-- ═══════════════════════════════════════════════════════════════════════════
-- Marketing: do valor que se gasta para o percentual que entra no preço.
-- ═══════════════════════════════════════════════════════════════════════════

-- Quem compra tráfego sabe o valor do mês — "gasto R$ 7.000" —, não o
-- percentual. A precificação trabalha em percentual do preço, porque é assim
-- que o custo se distribui entre um decant de 3 ml e um de 15 ml. A ponte
-- entre os dois é a receita: 7.000 sobre o que se vendeu no mês.
--
-- Guardar o valor mensal ao lado do percentual é o que permite ao ERP avisar
-- quando os dois deixam de bater — mesma ideia da perda real contra o
-- parâmetro de perda. Sem o valor guardado, o percentual envelheceria calado:
-- a receita cai, o ADS continua o mesmo, e todo preço fica com o custo de
-- marketing subestimado sem ninguém perceber.

alter table parametros_precificacao add column ads_mensal numeric(12, 2);

comment on column parametros_precificacao.ads_mensal is
  'Gasto mensal com tráfego pago que originou ads_pct. Nulo quando o percentual foi digitado direto.';

-- `salvar_parametros` ganha o valor mensal como parâmetro opcional: quem
-- edita as taxas à mão não precisa saber que ele existe.
create or replace function salvar_parametros(
  p_intermediador_pct  numeric,
  p_intermediador_fixo numeric,
  p_checkout_pct       numeric,
  p_imposto_pct        numeric,
  p_ads_pct            numeric,
  p_insumos            numeric,
  p_frete_subsidio     numeric,
  p_antifraude         numeric,
  p_perda_pct          numeric,
  p_margem_alvo        numeric,
  p_operador           text,
  p_ads_mensal         numeric default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está salvando os parâmetros';
  end if;

  if p_perda_pct < 0 or p_perda_pct >= 100 then
    raise exception 'perda técnica de % %% está fora da faixa aceitável', p_perda_pct;
  end if;
  if p_margem_alvo <= 0 or p_margem_alvo >= 100 then
    raise exception 'margem alvo de % %% está fora da faixa aceitável', p_margem_alvo;
  end if;
  if least(p_intermediador_fixo, p_insumos, p_frete_subsidio, p_antifraude) < 0 then
    raise exception 'custo fixo negativo não existe';
  end if;

  insert into parametros_precificacao (
    intermediador_pct, intermediador_fixo, checkout_pct, imposto_pct, ads_pct,
    insumos, frete_subsidio, antifraude, perda_pct, margem_alvo, criado_por, ads_mensal
  ) values (
    round(p_intermediador_pct, 3), round(p_intermediador_fixo, 2), round(p_checkout_pct, 3),
    round(p_imposto_pct, 3), round(p_ads_pct, 3), round(p_insumos, 2),
    round(p_frete_subsidio, 2), round(p_antifraude, 2), round(p_perda_pct, 3),
    round(p_margem_alvo, 3), p_operador, round(p_ads_mensal, 2)
  ) returning id into v_id;

  return v_id;
end;
$$;

/**
 * Leva só o parâmetro de ADS ao percentual derivado do gasto mensal,
 * preservando as demais taxas da vigência atual.
 *
 * Espelha `ajustar_perda_parametro`: uma taxa de cada vez, sempre como nova
 * vigência. O preço de ontem continua explicável pelo parâmetro de ontem.
 */
create function ajustar_ads_parametro(
  p_ads_pct    numeric,
  p_ads_mensal numeric,
  p_operador   text
) returns uuid
language plpgsql
as $$
declare
  v_atual parametros_precificacao%rowtype;
begin
  if p_ads_pct is null or p_ads_pct < 0 or p_ads_pct >= 100 then
    raise exception 'percentual de ADS de % %% está fora da faixa aceitável', p_ads_pct;
  end if;
  if p_ads_mensal is not null and p_ads_mensal < 0 then
    raise exception 'gasto mensal negativo não existe';
  end if;

  select * into v_atual
    from parametros_precificacao
   order by vigente_desde desc
   limit 1;
  if not found then
    raise exception 'não há parâmetros de precificação cadastrados';
  end if;

  return salvar_parametros(
    v_atual.intermediador_pct, v_atual.intermediador_fixo, v_atual.checkout_pct,
    v_atual.imposto_pct, p_ads_pct, v_atual.insumos, v_atual.frete_subsidio,
    v_atual.antifraude, v_atual.perda_pct, v_atual.margem_alvo, p_operador, p_ads_mensal
  );
end;
$$;

comment on function ajustar_ads_parametro is
  'Nova vigência com o ADS derivado do gasto mensal, mantendo as demais taxas.';

/**
 * Base de rateio do marketing: o que os pedidos PAGOS dos últimos 30 dias
 * trouxeram em produto.
 *
 * Fora o frete, que é repassado e não é receita de perfume — incluí-lo
 * diluiria o ADS num dinheiro que passa direto para a transportadora.
 * Fora também o que não foi pago: anúncio que gerou pedido pendente ou
 * cancelado custou igual, mas não há receita para ratear nele.
 */
create view receita_mensal as
select count(*)                                          as pedidos,
       coalesce(sum(valor - coalesce(frete, 0)), 0)       as receita_produtos,
       coalesce(sum(valor), 0)                            as receita_com_frete
  from pedidos
 where pagamento = 'pago'
   and comprado_em >= now() - interval '30 days';

comment on view receita_mensal is
  'Pedidos pagos e receita de produto dos últimos 30 dias. Base para ratear custo mensal fixo (ADS).';
