-- ═══════════════════════════════════════════════════════════════════════════
-- O ml vendido antes do frasco existir deixa de sumir.
--
-- `baixar_estoque_do_pedido` filtra os itens por `base_sob_controle`, que é
-- "existe lote deste perfume". Quem não passa é DESCARTADO — e a baixa só roda
-- uma vez, porque `estoque_baixado_em` fica preenchido. Resultado: pedido
-- faturado antes de a compra do frasco ser lançada perde aquele ml para
-- sempre. Ninguém volta para buscá-lo.
--
-- Não é hipótese. Vinte e um ml estão nessa situação agora:
--   · Club de Nuit  3 ml (pedido baixado em 17/08, 1º lote entrou em 21/08)
--   · Club de Nuit 10 ml (21/08, mesmo dia — a baixa correu antes do frasco)
--   · Jo Malone     3 ml (20/08, idem)
--   · Jo Malone     5 ml (20/08, venda manual MAN-0002)
--
-- Volume pequeno; falha estrutural grande. Ela se repete TODA vez que um
-- perfume esgota e a reposição chega depois da venda — que é o caso comum, não
-- a exceção.
--
-- ── O conserto ────────────────────────────────────────────────────────────
--
-- O item pulado passa a ser REGISTRADO em vez de descartado, e uma rotina
-- tenta de novo a cada rodada. Assim que a compra do frasco entra, o ml sai —
-- na data em que sai, não retroativamente, porque estoque é saldo do presente.
--
-- A regra do dono continua intacta: perfume sem compra de frasco lançada NÃO
-- baixa. A diferença é que agora "ainda não tem lote" vira ESPERA em vez de
-- esquecimento. O pedido anterior à virada segue fora por
-- `estoque_fora_do_controle`, e nada aqui o alcança.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists baixa_pendencias (
  id           bigserial primary key,
  pedido_id    text not null references pedidos(id) on delete cascade,
  base_id      text not null references perfumes_base(id) on delete cascade,
  -- O ml LÍQUIDO, sem a perda: o percentual de perda é lido no momento da
  -- baixa e pode mudar entre a venda e a chegada do frasco. Guardar o bruto
  -- congelaria um parâmetro que não é do fato.
  ml_liquido   numeric(10,2) not null check (ml_liquido > 0),
  criada_em    timestamptz not null default now(),
  resolvida_em timestamptz,
  -- Uma pendência por pedido e perfume. O `on conflict do nothing` na inserção
  -- é o que torna seguro rodar a baixa de novo sobre o mesmo pedido.
  unique (pedido_id, base_id)
);

create index if not exists baixa_pendencias_abertas on baixa_pendencias (base_id)
  where resolvida_em is null;

comment on table baixa_pendencias is
  'Itens vendidos cujo perfume ainda não tinha compra de frasco lançada quando a baixa rodou. `reprocessar_baixas_pendentes()` os consome assim que o lote entra.';

-- ── A baixa passa a anotar o que pulou ─────────────────────────────────────
create or replace function baixar_estoque_do_pedido(
  p_pedido_id text,
  p_operador text default 'Faturamento automático'
) returns numeric
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
    explodidos as (
      select coalesce(k.componente_base_id, b.base_id) as base_id,
             b.variante,
             (b.quantidade * coalesce(k.quantidade, 1))::int as quantidade
        from brutos b
        left join kit_componentes k on k.kit_base_id = b.base_id
    )
    -- O filtro saiu do WHERE e virou coluna: agora o laço vê TODOS os itens e
    -- decide o que fazer com cada um. Antes, o que não passava sumia sem
    -- deixar registro — e era justamente o caso que precisava de registro.
    select e.base_id,
           sum(e.variante * e.quantidade) as ml_liquido,
           base_sob_controle(e.base_id) as sob_controle
      from explodidos e
     group by e.base_id
  loop
    if not v_item.sob_controle then
      insert into baixa_pendencias (pedido_id, base_id, ml_liquido)
      values (p_pedido_id, v_item.base_id, v_item.ml_liquido)
      on conflict (pedido_id, base_id) do nothing;
      continue;
    end if;

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
$function$;

comment on function baixar_estoque_do_pedido(text, text) is
  'Tira do saldo o ml do pedido faturado. Item cujo perfume ainda não tem compra de frasco lançada vai para `baixa_pendencias` em vez de ser descartado — o ml sai quando o lote entrar.';

-- ── A segunda chance ───────────────────────────────────────────────────────
--
-- Roda a cada rodada de sincronização e consome o que já tem frasco. A data da
-- movimentação é HOJE, não a da venda: estoque é saldo do presente, e
-- retroagir mudaria um saldo que já foi conferido em inventário.
create or replace function reprocessar_baixas_pendentes(p_limite int default 200)
returns integer
language plpgsql
as $function$
declare
  v_perda numeric;
  v_p record;
  v_ml numeric;
  v_saldo numeric;
  v_feitas int := 0;
begin
  select coalesce(perda_pct, 0) into v_perda
    from parametros_precificacao order by vigente_desde desc limit 1;
  v_perda := coalesce(v_perda, 0);

  for v_p in
    select b.* from baixa_pendencias b
     where b.resolvida_em is null
       and base_sob_controle(b.base_id)
     order by b.criada_em
     limit p_limite
  loop
    v_ml := round(v_p.ml_liquido * (1 + v_perda / 100.0), 1);

    update perfumes_base
       set volume_ml = greatest(volume_ml - v_ml, 0)
     where id = v_p.base_id
    returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, pedido_id,
      descricao, responsavel, saldo_ml
    ) values (
      v_p.base_id, 'saida', now(), -v_ml, -v_p.ml_liquido, v_p.pedido_id, v_p.pedido_id,
      'Baixa pendente do pedido ' || v_p.pedido_id || ' — frasco cadastrado depois da venda',
      'Reprocessamento automático', v_saldo
    );

    -- O total baixado do pedido acompanha, senão a ficha dele continuaria
    -- dizendo que saiu menos ml do que saiu.
    update pedidos
       set estoque_baixado_ml = coalesce(estoque_baixado_ml, 0) + v_ml
     where id = v_p.pedido_id;

    update baixa_pendencias set resolvida_em = now() where id = v_p.id;
    v_feitas := v_feitas + 1;
  end loop;

  return v_feitas;
end;
$function$;

comment on function reprocessar_baixas_pendentes(int) is
  'Consome as pendências cujo perfume já ganhou compra de frasco. A movimentação leva a data de hoje — estoque é saldo do presente, e retroagir mexeria em saldo já conferido.';

-- ── Os que já estão presos ────────────────────────────────────────────────
--
-- Reconstruídos a partir dos itens dos pedidos já baixados que têm lote hoje e
-- não geraram movimentação nenhuma. `on conflict do nothing` porque a
-- migração precisa poder rodar duas vezes sem duplicar o ml.
--
-- Eles entram JÁ ENCERRADOS, sem baixar ml — ver a migração seguinte. O dono
-- confirmou o fato físico: o lote novo de Club de Nuit não serviu pedido
-- nenhum. Aquele perfume saiu de um frasco anterior ao controle, e descontá-lo
-- do lote novo faria o saldo dele mostrar 92 ml onde existem 105. A mecânica
-- vale daqui para frente; o passado fica onde está.
insert into baixa_pendencias (pedido_id, base_id, ml_liquido)
select p.id, pi.base_id, sum(pi.variante * pi.quantidade)
  from pedido_itens pi
  join pedidos p on p.id = pi.pedido_id
 where p.estoque_baixado_em is not null
   and pi.base_id is not null
   and pi.variante is not null
   and exists (select 1 from lotes l where l.base_id = pi.base_id)
   and not exists (
     select 1 from movimentacoes m
      where m.pedido_id = p.id and m.tipo = 'saida' and m.base_id = pi.base_id
   )
 group by p.id, pi.base_id
on conflict (pedido_id, base_id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- O passado fica onde está.
--
-- A coluna abaixo separa "encerrada baixando o ml" de "encerrada sem baixar".
-- As pendências reconstruídas acima entram no segundo caso: o dono confirmou
-- que o lote novo de Club de Nuit não serviu pedido nenhum — os 2 ml que
-- saíram dele foram baixa manual. Descontar as vendas antigas dali faria o
-- saldo mostrar 92 ml onde existem 105.
--
-- A mesma leitura vale para Jo Malone, pela regra da casa: perfume sem compra
-- de frasco lançada NA ÉPOCA DA VENDA não entra no controle. São 8 ml — e se
-- eles de fato saíram do frasco novo, uma saída manual corrige. O caminho
-- inverso, tirar ml que nunca saiu, não tem conserto que o inventário aceite.
-- ═══════════════════════════════════════════════════════════════════════════

alter table baixa_pendencias add column if not exists descartada_motivo text;

comment on column baixa_pendencias.descartada_motivo is
  'Preenchido quando a pendência foi encerrada SEM baixar ml: o perfume saiu de um frasco que nunca esteve sob controle, e descontá-lo do lote novo faria o saldo dele mentir.';

update baixa_pendencias
   set resolvida_em = now(),
       descartada_motivo = 'Venda anterior ao cadastro do frasco — o perfume saiu de estoque fora do controle'
 where resolvida_em is null;
