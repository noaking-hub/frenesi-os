-- Kits explodem em componentes na baixa (20/08).
--
-- O kit entra da Shopify como uma "base" própria e a baixa o tratava como UM
-- decant: 1 frasco/tampa/válvula e zero ml. Mas o Kit Nicho Essencial
-- Masculino 5 ml são TRÊS decants de 5 ml — Vibrato, Naxos e Hacivat. A
-- composição vira dado (`kit_componentes`), e as duas baixas passam a
-- explodir o kit: cada componente consome frasco+tampa+válvula do tamanho da
-- variante, e o ml sai das bases reais que estão sob controle (a regra do
-- líquido continua intacta: componente sem compra de frasco não baixa ml).

create table if not exists kit_componentes (
  kit_base_id text not null references perfumes_base(id),
  componente_base_id text not null references perfumes_base(id),
  quantidade integer not null default 1,
  primary key (kit_base_id, componente_base_id)
);
alter table kit_componentes enable row level security;
comment on table kit_componentes is
  'Composição dos kits: cada linha é um decant que o kit carrega. A variante vendida do kit vale para cada componente (kit 5 ml = um decant de 5 ml de cada).';

insert into kit_componentes (kit_base_id, componente_base_id) values
  ('kit-nicho-essencial-masculino-decants', 'vibrato-sospiro-unissex-eau-de-parfum-decant'),
  ('kit-nicho-essencial-masculino-decants', 'xerjoff-naxos-unissex-eau-de-parfum-decant'),
  ('kit-nicho-essencial-masculino-decants', 'nishane-hacivat-masculino-extrait-de-parfum-decant')
on conflict do nothing;

-- ── Baixa de LÍQUIDO com explosão de kit ──────────────────────────────────
create or replace function public.baixar_estoque_do_pedido(p_pedido_id text, p_operador text default 'Faturamento automático')
returns numeric
language plpgsql
as $function$
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
    with brutos as (
      select i.base_id, i.variante, i.quantidade
        from pedido_itens i
       where i.pedido_id = p_pedido_id
         and i.variante is not null
         and i.base_id is not null
    ),
    -- O kit vira seus componentes; item comum passa reto (kit sem linha na
    -- composição também — melhor baixar como um decant do que nada).
    explodidos as (
      select coalesce(k.componente_base_id, b.base_id) as base_id,
             b.variante,
             (b.quantidade * coalesce(k.quantidade, 1))::int as quantidade
        from brutos b
        left join kit_componentes k on k.kit_base_id = b.base_id
    )
    select e.base_id, sum(e.variante * e.quantidade) as ml_liquido
      from explodidos e
     where base_sob_controle(e.base_id)
     group by e.base_id
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

  -- Frasco, válvula e tampa saem junto com o líquido: é o mesmo envase, e
  -- separar os dois momentos faria o insumo ficar sempre desatualizado.
  perform baixar_insumos_do_pedido(p_pedido_id, p_operador);

  return v_total;
end;
$function$;

-- ── Baixa de INSUMOS com explosão de kit ──────────────────────────────────
create or replace function public.baixar_insumos_do_pedido(p_pedido_id text, p_operador text default 'Faturamento automático')
returns integer
language plpgsql
as $function$
declare
  v_linha record;
  v_atual integer;
  v_saldo integer;
  v_baixado integer;
  v_total integer := 0;
begin
  if exists (
    select 1 from insumo_movimentacoes
     where pedido_id = p_pedido_id and tipo = 'saida'
  ) then
    return 0;
  end if;

  for v_linha in
    with brutos as (
      select i.base_id, i.variante, i.quantidade
        from pedido_itens i
       where i.pedido_id = p_pedido_id
         and i.variante is not null
    ),
    explodidos as (
      -- Kit de 3 componentes = 3 decants = 3 frascos, 3 tampas, 3 válvulas.
      select b.variante,
             (b.quantidade * coalesce(k.quantidade, 1))::int as quantidade
        from brutos b
        left join kit_componentes k on k.kit_base_id = b.base_id
    ),
    itens as (
      select frasco_da_variante(e.variante::smallint) as frasco_ml,
             sum(e.quantidade)::int as unidades
        from explodidos e
       group by 1
    )
    select ins.id as insumo_id, x.unidades
      from itens x
      join insumos ins on ins.frasco_ml = x.frasco_ml and ins.ativo
    union all
    select ins.id, (select coalesce(sum(unidades), 0) from itens)::int
      from insumos ins
     where ins.frasco_ml is null and ins.ativo
  loop
    continue when v_linha.unidades <= 0;

    select unidades into v_atual from insumos where id = v_linha.insumo_id for update;
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
$function$;

-- ── Correção do kit já vendido (SH-1964, kit 3 ml, baixado em 19/08) ──────
-- Insumos: saiu 1 conjunto, eram 3 — completa os 2 que faltam.
-- Líquido: o componente sob controle (Vibrato) não baixou — baixa agora.
do $do$
declare
  v_perda numeric;
  v_ml numeric;
  v_saldo numeric;
  v_atual integer;
  v_novo integer;
  v_ins record;
begin
  -- +2 unidades de saída em frasco 8 ml, tampa e válvula.
  for v_ins in select id from insumos where ativo and (frasco_ml = 8 or frasco_ml is null)
  loop
    select unidades into v_atual from insumos where id = v_ins.id for update;
    update insumos set unidades = greatest(unidades - 2, 0) where id = v_ins.id
    returning unidades into v_novo;
    insert into insumo_movimentacoes (
      insumo_id, tipo, unidades, saldo_anterior, saldo, ref, pedido_id, descricao, responsavel
    ) values (
      v_ins.id, 'saida', -2, v_atual, v_novo,
      'YP-1510190952075742', 'YP-1510190952075742',
      'Correção kit SH-1964: 3 decants, saíra só 1 conjunto',
      'Correção de kit (20/08)'
    );
  end loop;

  select coalesce(perda_pct, 0) into v_perda
    from parametros_precificacao order by vigente_desde desc limit 1;
  v_ml := round(3 * (1 + coalesce(v_perda, 0) / 100.0), 1);

  update perfumes_base
     set volume_ml = greatest(volume_ml - v_ml, 0)
   where id = 'vibrato-sospiro-unissex-eau-de-parfum-decant'
  returning volume_ml into v_saldo;

  insert into movimentacoes (
    base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, pedido_id,
    descricao, responsavel, saldo_ml
  ) values (
    'vibrato-sospiro-unissex-eau-de-parfum-decant', 'saida', now(), -v_ml, -3,
    'YP-1510190952075742', 'YP-1510190952075742',
    'Correção kit SH-1964: componente Vibrato 3 ml não havia baixado',
    'Correção de kit (20/08)', v_saldo
  );

  update pedidos
     set estoque_baixado_ml = coalesce(estoque_baixado_ml, 0) + v_ml
   where id = 'YP-1510190952075742';
end $do$;
