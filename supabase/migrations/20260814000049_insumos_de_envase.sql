-- Insumos de envase: frasco, válvula e tampa.
--
-- Até aqui o ERP controlava só o líquido. Mas decant não se faz de perfume
-- sozinho: sem frasco, válvula e tampa não sai pedido nenhum, e acabar
-- tampa para quem tem 2 litros de perfume trava a operação do mesmo jeito
-- que acabar perfume.
--
-- Cada tamanho de frasco tem a sua válvula e a sua tampa — são seis itens,
-- não quatro. O consumo sai da variante vendida: 3, 5 e 8 ml vão no frasco
-- de 8 ml; 10 e 15 ml, no de 15 ml.

create table if not exists insumos (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('frasco', 'valvula', 'tampa', 'outro')),
  /** 8 ou 15. Null quando o item serve a qualquer frasco. */
  frasco_ml smallint check (frasco_ml in (8, 15)),
  unidades integer not null default 0 check (unidades >= 0),
  /** Custo médio ponderado, como nos lotes de perfume. */
  custo_unitario numeric(10,4) not null default 0 check (custo_unitario >= 0),
  /** Abaixo disto a tela pede compra. Zero desliga o alerta. */
  minimo integer not null default 0 check (minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table insumos enable row level security;

-- O mesmo princípio do estoque de líquido: saldo não se edita, se movimenta.
create table if not exists insumo_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  insumo_id text not null references insumos (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'estorno')),
  /** Positivo entra, negativo sai. */
  unidades integer not null,
  saldo_anterior integer,
  saldo integer,
  ref text,
  pedido_id text,
  descricao text not null,
  responsavel text,
  custo_unitario numeric(10,4),
  ocorrida_em timestamptz not null default now()
);

create index if not exists insumo_mov_idx on insumo_movimentacoes (insumo_id, ocorrida_em desc);
create index if not exists insumo_mov_pedido_idx on insumo_movimentacoes (pedido_id);

alter table insumo_movimentacoes enable row level security;

-- Os seis itens da operação, com saldo zero: quem diz quanto existe é a
-- primeira compra ou o primeiro ajuste, não um palpite gravado aqui.
insert into insumos (id, nome, tipo, frasco_ml, minimo) values
  ('frasco-8',  'Frasco de vidro 8 ml',  'frasco',  8,  100),
  ('valvula-8', 'Válvula spray 8 ml',    'valvula', 8,  100),
  ('tampa-8',   'Tampa 8 ml',            'tampa',   8,  100),
  ('frasco-15', 'Frasco de vidro 15 ml', 'frasco',  15, 50),
  ('valvula-15','Válvula spray 15 ml',   'valvula', 15, 50),
  ('tampa-15',  'Tampa 15 ml',           'tampa',   15, 50)
on conflict (id) do nothing;

/**
 * Qual frasco uma variante usa. Espelha `frascoDe()` do domínio — as duas
 * precisam concordar, senão a tela conta um insumo e a baixa tira outro.
 */
create or replace function frasco_da_variante(p_variante smallint)
returns smallint
language sql
immutable
as $$ select case when p_variante <= 8 then 8::smallint else 15::smallint end $$;

/**
 * Compra de insumo: entra unidade e o custo médio se refaz.
 *
 * Mesma regra dos lotes de perfume — comprar mais caro não apaga o que já
 * estava no estoque, faz média ponderada pelo que existe.
 */
create or replace function registrar_compra_insumo(
  p_insumo_id text,
  p_unidades integer,
  p_custo_total numeric,
  p_fornecedor text default null,
  p_operador text default 'Compra'
) returns integer
language plpgsql
as $$
declare
  v_atual integer;
  v_custo_atual numeric;
  v_novo_custo numeric;
  v_saldo integer;
begin
  if p_unidades is null or p_unidades <= 0 then
    raise exception 'Informe quantas unidades entraram.';
  end if;
  if p_custo_total is null or p_custo_total < 0 then
    raise exception 'Informe o custo total da compra.';
  end if;

  select unidades, custo_unitario into v_atual, v_custo_atual
    from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo % não existe.', p_insumo_id;
  end if;

  v_novo_custo := case
    when v_atual <= 0 or v_custo_atual <= 0 then p_custo_total / p_unidades
    else (v_atual * v_custo_atual + p_custo_total) / (v_atual + p_unidades)
  end;

  update insumos
     set unidades = unidades + p_unidades,
         custo_unitario = round(v_novo_custo, 4)
   where id = p_insumo_id
  returning unidades into v_saldo;

  insert into insumo_movimentacoes (
    insumo_id, tipo, unidades, saldo_anterior, saldo, ref, descricao,
    responsavel, custo_unitario
  ) values (
    p_insumo_id, 'entrada', p_unidades, v_atual, v_saldo,
    p_fornecedor,
    'Compra de ' || p_unidades || ' un' ||
      coalesce(' · ' || p_fornecedor, '') || ' · custo médio agora ' ||
      round(v_novo_custo, 4),
    p_operador, round(v_novo_custo, 4)
  );

  return v_saldo;
end;
$$;

/** Ajuste de contagem: alguém abriu a caixa e contou. */
create or replace function ajustar_insumo(
  p_insumo_id text,
  p_unidades integer,
  p_motivo text,
  p_operador text default 'Ajuste'
) returns integer
language plpgsql
as $$
declare
  v_atual integer;
  v_saldo integer;
begin
  if p_unidades is null or p_unidades < 0 then
    raise exception 'O saldo contado não pode ser negativo.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Ajuste de insumo exige motivo.';
  end if;

  select unidades into v_atual from insumos where id = p_insumo_id for update;
  if not found then
    raise exception 'Insumo % não existe.', p_insumo_id;
  end if;

  update insumos set unidades = p_unidades where id = p_insumo_id
  returning unidades into v_saldo;

  insert into insumo_movimentacoes (
    insumo_id, tipo, unidades, saldo_anterior, saldo, descricao, responsavel
  ) values (
    p_insumo_id, 'ajuste', p_unidades - v_atual, v_atual, v_saldo,
    'Ajuste de contagem · ' || p_motivo, p_operador
  );

  return v_saldo;
end;
$$;

/**
 * Baixa dos insumos de um pedido.
 *
 * Cada decant consome um frasco, uma válvula e uma tampa do tamanho certo.
 * Falta de insumo NÃO impede a baixa: o pedido já foi faturado e o decant
 * já saiu — travar aqui não desfaz o fato, só esconde. O saldo para em zero
 * e a movimentação registra quanto faltou, para a tela cobrar a compra.
 */
create or replace function baixar_insumos_do_pedido(
  p_pedido_id text,
  p_operador text default 'Faturamento'
) returns integer
language plpgsql
as $$
declare
  v_linha record;
  v_atual integer;
  v_saldo integer;
  v_baixado integer;
  v_total integer := 0;
begin
  -- Uma linha por insumo: agrupa as variantes do pedido pelo frasco que
  -- cada uma usa e cruza com os três itens daquele tamanho.
  for v_linha in
    select ins.id as insumo_id, x.unidades
      from (
        select frasco_da_variante(i.variante::smallint) as frasco_ml,
               sum(i.quantidade)::int as unidades
          from pedido_itens i
         where i.pedido_id = p_pedido_id and i.variante is not null
         group by 1
      ) x
      join insumos ins on ins.frasco_ml = x.frasco_ml and ins.ativo
  loop
    select unidades into v_atual from insumos where id = v_linha.insumo_id for update;
    -- Falta de insumo não impede a baixa: o decant já saiu. O saldo para em
    -- zero e a movimentação diz quanto faltou, para a tela cobrar a compra.
    v_baixado := least(v_atual, v_linha.unidades);

    update insumos set unidades = greatest(unidades - v_linha.unidades, 0)
     where id = v_linha.insumo_id
    returning unidades into v_saldo;

    insert into insumo_movimentacoes (
      insumo_id, tipo, unidades, saldo_anterior, saldo, ref, pedido_id,
      descricao, responsavel
    ) values (
      v_linha.insumo_id, 'saida', -v_baixado, v_atual, v_saldo,
      p_pedido_id, p_pedido_id,
      case when v_baixado < v_linha.unidades
        then 'Envase do pedido ' || p_pedido_id || ' · faltaram ' ||
             (v_linha.unidades - v_baixado) || ' un em estoque'
        else 'Envase do pedido ' || p_pedido_id
      end,
      p_operador
    );

    v_total := v_total + v_baixado;
  end loop;

  return v_total;
end;
$$;

-- O faturamento passa a tirar o insumo junto com o líquido: é o mesmo
-- envase, e separar os dois momentos deixaria o insumo sempre atrasado.
create or replace function baixar_estoque_do_pedido(
  p_pedido_id text,
  p_operador text default 'Faturamento'
) returns numeric
language plpgsql
as $$
declare
  v_perda numeric;
  v_total numeric := 0;
  v_item record;
  v_ml numeric;
  v_saldo numeric;
begin
  perform 1 from pedidos where id = p_pedido_id for update;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;
  if exists (
    select 1 from pedidos
     where id = p_pedido_id
       and (estoque_baixado_em is not null or estoque_fora_do_controle)
  ) then
    return 0;
  end if;

  select coalesce(perda_pct, 0) into v_perda
    from parametros_precificacao
   order by vigente_desde desc
   limit 1;
  v_perda := coalesce(v_perda, 0);

  for v_item in
    select i.base_id, sum(i.variante * i.quantidade) as ml_liquido
      from pedido_itens i
     where i.pedido_id = p_pedido_id
       and i.base_id is not null
       and base_sob_controle(i.base_id)
     group by i.base_id
  loop
    v_ml := round(v_item.ml_liquido * (1 + v_perda / 100.0), 1);
    v_total := v_total + v_ml;

    update perfumes_base
       set volume_ml = greatest(volume_ml - v_ml, 0)
     where id = v_item.base_id
    returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, pedido_id,
      descricao, responsavel, saldo_ml
    ) values (
      v_item.base_id, 'saida', now(), -v_ml, -v_item.ml_liquido, p_pedido_id, p_pedido_id,
      'Faturamento do pedido ' || p_pedido_id, p_operador, v_saldo
    );
  end loop;

  update pedidos
     set estoque_baixado_em = now(), estoque_baixado_ml = v_total
   where id = p_pedido_id;

  perform liberar_reserva_do_pedido(p_pedido_id, 'consumida', p_operador);
  perform baixar_insumos_do_pedido(p_pedido_id, p_operador);

  return v_total;
end;
$$;
