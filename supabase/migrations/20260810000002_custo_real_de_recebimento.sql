/**
 * Quanto CUSTA de fato receber, por meio de pagamento.
 *
 * A tabela de taxas do gateway lista o pior caso de cada modalidade. O que
 * entra no preço não é o pior caso: é a média ponderada da mistura real de
 * quem compra. Um decant vendido no Pix custa 0,5% para receber; o mesmo
 * decant em 6x sem juros custa 15%. Precificar tudo a 15% faz o cliente do
 * Pix — que aqui é a maioria — pagar por um parcelamento que ele não usou.
 *
 * O percentual sai da tarifa que o próprio gateway informou em cada
 * pagamento, não de tabela digitada. Se a taxa mudar amanhã, isto muda junto.
 *
 * Janela de 90 dias: recente o bastante para refletir o comportamento de
 * agora, longa o bastante para uma semana atípica não virar parâmetro.
 */
create view custo_recebimento_por_meio as
with linhas as (
  select
    nullif(trim(split_part(descricao, ' · ', 1)), '') as meio,
    (bruto ->> 'bruto')::numeric  as valor_bruto,
    (bruto ->> 'tarifa')::numeric as tarifa
  from extrato_linhas
  where origem = 'mercadopago'
    and tipo = 'entrada'
    and bruto ? 'bruto'
    and bruto ? 'tarifa'
    and ocorrido_em > current_date - 90
)
select
  coalesce(meio, 'Não identificado') as meio,
  count(*)                            as vendas,
  round(sum(valor_bruto), 2)          as bruto,
  round(sum(tarifa), 2)               as tarifa,
  round(100 * sum(tarifa) / nullif(sum(valor_bruto), 0), 2) as pct,
  round(100 * sum(valor_bruto) / nullif(sum(sum(valor_bruto)) over (), 0), 1) as fatia
from linhas
where valor_bruto > 0
group by meio
order by sum(valor_bruto) desc;

comment on view custo_recebimento_por_meio is
  'Custo real de receber por meio de pagamento, medido na tarifa que o gateway informou.';

/**
 * Ajusta só o custo de receber, mantendo o resto do parâmetro vigente.
 *
 * Igual ao ADS: a precificação inteira é uma linha versionada, e reescrever
 * a linha toda a partir da tela obrigaria a tela a conhecer campos que ela
 * não edita — o primeiro esquecido zeraria um custo em silêncio.
 */
create function ajustar_intermediador_parametro(
  p_intermediador_pct numeric,
  p_operador          text
) returns void
language plpgsql
as $$
declare
  v_atual parametros_precificacao%rowtype;
begin
  if p_intermediador_pct is null or p_intermediador_pct < 0 or p_intermediador_pct >= 100 then
    raise exception 'percentual de intermediador fora da faixa: %', p_intermediador_pct;
  end if;

  select * into v_atual from parametros_precificacao
   order by vigente_desde desc limit 1;
  if not found then
    raise exception 'não há parâmetro de precificação vigente';
  end if;

  insert into parametros_precificacao (
    intermediador_pct, intermediador_fixo, checkout_pct, imposto_pct, ads_pct,
    insumos, frete_subsidio, antifraude, perda_pct, margem_alvo,
    vigente_desde, criado_por, ads_mensal
  ) values (
    p_intermediador_pct, v_atual.intermediador_fixo, v_atual.checkout_pct,
    v_atual.imposto_pct, v_atual.ads_pct, v_atual.insumos, v_atual.frete_subsidio,
    v_atual.antifraude, v_atual.perda_pct, v_atual.margem_alvo,
    now(), p_operador, v_atual.ads_mensal
  );
end;
$$;

comment on function ajustar_intermediador_parametro is
  'Cria nova versão do parâmetro mudando só o custo de receber, medido no extrato.';
