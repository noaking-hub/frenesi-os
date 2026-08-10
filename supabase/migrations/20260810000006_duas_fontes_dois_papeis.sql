-- ═══════════════════════════════════════════════════════════════════════════
-- Cada fonte com um papel, para o mesmo dinheiro não entrar duas vezes.
--
-- O Relatório de Liberações e a busca de pagamentos descrevem a MESMA venda
-- com chaves diferentes: a liberação usa data + operação + posição, o
-- pagamento usa o id dele. Gravando as duas na tabela de extrato, o crédito
-- de cada venda entraria duas vezes e o saldo dobraria.
--
-- Papéis, daqui em diante:
--   Liberações          → o extrato. Saldo e movimento, saques inclusive.
--   Busca de pagamentos → a tarifa de cada venda e o casamento com o pedido.
--
-- A tarifa mora no repasse, que é por pedido. Por isso o meio de pagamento
-- passa a ser guardado ali: é dele que sai o custo real de receber, que antes
-- era extraído do extrato e agora seria dobrado junto.
-- ═══════════════════════════════════════════════════════════════════════════

alter table repasses add column if not exists meio text;

comment on column repasses.meio is
  'Meio de pagamento informado pelo gateway: Pix, Cartão de crédito 6x… Sustenta o custo real de receber.';

drop function if exists conciliar_repasses_lote(jsonb, text);

create function conciliar_repasses_lote(p_itens jsonb, p_operador text)
returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_conciliados integer := 0;
  v_inalterados integer := 0;
  v_orfaos      jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'os itens da conciliação precisam vir em uma lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    update repasses
       set recebido      = (v_item ->> 'recebido')::numeric,
           creditado_em  = coalesce((v_item ->> 'creditado_em')::date, current_date),
           gateway_id    = v_item ->> 'gateway_id',
           bruto_gateway = (v_item ->> 'bruto')::numeric,
           taxa_real     = (v_item ->> 'taxa_real')::numeric,
           meio          = coalesce(v_item ->> 'meio', meio),
           conciliado_por = p_operador
     where pedido_id = v_item ->> 'pedido_id'
       -- Não reescreve conciliação idêntica: sem isto toda sincronia diria
       -- que "conciliou" centenas de repasses que já estavam conciliados.
       and (recebido is distinct from (v_item ->> 'recebido')::numeric
            or meio is distinct from (v_item ->> 'meio'));

    if found then
      v_conciliados := v_conciliados + 1;
    elsif exists (select 1 from repasses where pedido_id = v_item ->> 'pedido_id') then
      v_inalterados := v_inalterados + 1;
    else
      v_orfaos := v_orfaos || jsonb_build_array(v_item);
    end if;
  end loop;

  return jsonb_build_object(
    'conciliados', v_conciliados,
    'inalterados', v_inalterados,
    'orfaos', v_orfaos
  );
end;
$$;

/**
 * Custo real de receber, por meio de pagamento.
 *
 * Sai do REPASSE, não do extrato: é o repasse que guarda, por pedido, o
 * bruto e a tarifa que o gateway informou. Tirar do extrato deixou de ser
 * possível sem dobrar o movimento, porque o extrato agora vem das
 * liberações — que agregam venda e tarifa em linhas próprias.
 */
drop view if exists custo_recebimento_por_meio;

create view custo_recebimento_por_meio as
with base as (
  select
    coalesce(nullif(trim(r.meio), ''), 'Não identificado') as meio,
    r.bruto_gateway as valor_bruto,
    r.taxa_real     as tarifa
  from repasses r
  join pedidos p on p.id = r.pedido_id
  where r.bruto_gateway is not null
    and r.taxa_real is not null
    and r.bruto_gateway > 0
    and p.comprado_em > now() - interval '90 days'
)
select
  meio,
  count(*)                   as vendas,
  round(sum(valor_bruto), 2) as bruto,
  round(sum(tarifa), 2)      as tarifa,
  round(100 * sum(tarifa) / nullif(sum(valor_bruto), 0), 2) as pct,
  round(100 * sum(valor_bruto) / nullif(sum(sum(valor_bruto)) over (), 0), 1) as fatia
from base
group by meio
order by sum(valor_bruto) desc;

comment on view custo_recebimento_por_meio is
  'Custo real de receber por meio, medido na tarifa que o gateway informou em cada repasse.';
