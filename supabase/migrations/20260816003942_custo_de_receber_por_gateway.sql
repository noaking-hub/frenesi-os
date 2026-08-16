-- O custo de receber passa a ter DUAS dimensões: meio e gateway.
--
-- O dado mostrou por quê. "pix" a 0,70% e "Pix" a 0,99% pareciam grafias do
-- mesmo custo; eram dois intermediadores — 0,70% era a Pagar.me, que saiu em
-- 22/07, e 0,99% é o Mercado Pago de hoje. Agrupar só por meio faria a
-- precificação usar a tarifa de um contrato encerrado.
--
-- O nome do meio também se normaliza aqui: `credit_card` da Pagar.me e
-- "Cartão de crédito" da Yampi são o mesmo meio escrito de dois jeitos. O que
-- NÃO se junta é o número de parcelas — 6x custa 14,94% e à vista 2,77%, e a
-- média dos dois não descreve venda nenhuma.
--
-- `translate` no lugar de `unaccent`: a extensão não está instalada, e para
-- cinco vogais acentuadas não vale ligar uma extensão inteira.

create or replace function public.meio_canonico(bruto text)
returns text language sql immutable as $$
  with t as (
    select lower(translate(coalesce(trim(bruto), ''), 'áàãâéêíóôõúüç', 'aaaaeeiooouuc')) as m
  )
  select case
    when (select m from t) = '' then 'Não identificado'
    when (select m from t) like '%pagaleve%' then 'Pix parcelado (Pagaleve)'
    when (select m from t) like '%boleto%' or (select m from t) like '%bank_slip%' then 'Boleto'
    when (select m from t) like '%pix%' then 'Pix'
    when (select m from t) like '%debit%' or (select m from t) like '%debito%' then 'Cartão de débito'
    when (select m from t) like '%credit%' or (select m from t) like '%cartao%' or (select m from t) like '%card%'
      then 'Cartão de crédito ' ||
           coalesce(nullif((regexp_match((select m from t), '(\d{1,2})\s*x'))[1], ''), '1') || 'x'
    else initcap(trim(bruto))
  end
$$;

create or replace function public.gateway_do_repasse(origem text, comprado_em timestamptz)
returns text language sql immutable as $$
  select case
    when lower(coalesce(origem,'')) like '%pagaleve%' then 'Pagaleve'
    when lower(coalesce(origem,'')) like '%pagarme%' then 'Pagar.me'
    when lower(coalesce(origem,'')) like '%mercado%' then 'Mercado Pago'
    -- A origem "Yampi · Pago" diz de onde veio o PEDIDO, não quem processou o
    -- dinheiro. Quem processou se decide pela data contra a troca de 22/07.
    when lower(coalesce(origem,'')) like '%yampi%' or lower(coalesce(origem,'')) like '%shopify%'
      then case when (comprado_em at time zone 'America/Sao_Paulo')::date < date '2026-07-22'
                then 'Pagar.me' else 'Mercado Pago' end
    else 'Outro'
  end
$$;

drop view if exists public.custo_recebimento_por_meio;

create view public.custo_recebimento_por_meio as
with base as (
  select
    public.meio_canonico(r.meio) as meio,
    public.gateway_do_repasse(r.origem, p.comprado_em) as gateway,
    r.bruto_gateway as valor_bruto,
    r.taxa_real as tarifa,
    (p.comprado_em at time zone 'America/Sao_Paulo')::date as dia
  from repasses r
  join pedidos p on p.id = r.pedido_id
  where r.bruto_gateway is not null
    and r.taxa_real is not null
    and r.bruto_gateway > 0
    and p.comprado_em > now() - interval '90 days'
)
select
  meio,
  gateway,
  -- Só o gateway vigente entra no preço. O histórico continua visível, para
  -- comparar contrato antigo com novo, mas não contamina a média que precifica.
  (gateway <> 'Pagar.me') as vigente,
  count(*) as vendas,
  round(sum(valor_bruto), 2) as bruto,
  round(sum(tarifa), 2) as tarifa,
  round(100 * sum(tarifa) / nullif(sum(valor_bruto), 0), 2) as pct,
  round(100 * sum(valor_bruto) / nullif(sum(sum(valor_bruto)) over (), 0), 1) as fatia,
  min(dia) as primeira_venda,
  max(dia) as ultima_venda
from base
group by meio, gateway
order by sum(valor_bruto) desc;
