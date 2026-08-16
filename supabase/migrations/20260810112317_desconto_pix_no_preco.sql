-- ═══════════════════════════════════════════════════════════════════════════
-- O desconto de Pix do checkout entra no preço.
--
-- Faltava, e é o maior custo de receber que a operação tem: 10% de desconto
-- para pagamento no Pix, com o Pix respondendo por três quartos das vendas.
-- Ao lado disso, a tarifa do gateway (0,43% no Pix) é ruído. O ERP estava
-- comparando centavos e ignorando o desconto que dá em toda venda.
--
-- Modelado como taxa sobre o preço porque é exatamente isso: uma parcela do
-- preço de tabela que nunca chega na conta. O peso é o desconto vezes a
-- fatia de vendas que usa o Pix — não adianta descontar 10% do preço inteiro
-- se um quarto dos clientes paga no cartão.
-- ═══════════════════════════════════════════════════════════════════════════

alter table parametros_precificacao
  add column if not exists desconto_pix_pct numeric(6, 3) not null default 0,
  add column if not exists fatia_pix_pct    numeric(6, 3) not null default 0;

comment on column parametros_precificacao.desconto_pix_pct is
  'Desconto oferecido no checkout para pagamento via Pix, em %.';
comment on column parametros_precificacao.fatia_pix_pct is
  'Fatia do faturamento que vem no Pix, em %. Medida no extrato do gateway.';

-- O parâmetro vigente ganha os números reais da Frenesi.
update parametros_precificacao
   set desconto_pix_pct = 10, fatia_pix_pct = 74.9
 where id = (select id from parametros_precificacao order by vigente_desde desc limit 1);

/**
 * Salvar os parâmetros da tela sem perder o que a tela não edita.
 *
 * Desconto de Pix e fatia de Pix são carregados da linha vigente: a tela de
 * parâmetros não os edita (um vem da configuração do checkout, o outro é
 * medido no extrato), e recriar a linha sem eles zeraria os dois em silêncio
 * no primeiro "Salvar" — que é o tipo de perda que só aparece semanas depois,
 * no preço.
 */
create or replace function salvar_parametros(
  p_intermediador_pct numeric,
  p_intermediador_fixo numeric,
  p_checkout_pct numeric,
  p_imposto_pct numeric,
  p_ads_pct numeric,
  p_insumos numeric,
  p_frete_subsidio numeric,
  p_antifraude numeric,
  p_perda_pct numeric,
  p_margem_alvo numeric,
  p_operador text,
  p_ads_mensal numeric default null
) returns uuid
language plpgsql
as $$
declare
  v_id    uuid;
  v_atual parametros_precificacao%rowtype;
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

  select * into v_atual from parametros_precificacao order by vigente_desde desc limit 1;

  insert into parametros_precificacao (
    intermediador_pct, intermediador_fixo, checkout_pct, imposto_pct, ads_pct,
    insumos, frete_subsidio, antifraude, perda_pct, margem_alvo, criado_por,
    ads_mensal, desconto_pix_pct, fatia_pix_pct
  ) values (
    round(p_intermediador_pct, 3), round(p_intermediador_fixo, 2), round(p_checkout_pct, 3),
    round(p_imposto_pct, 3), round(p_ads_pct, 3), round(p_insumos, 2),
    round(p_frete_subsidio, 2), round(p_antifraude, 2), round(p_perda_pct, 3),
    round(p_margem_alvo, 3), p_operador,
    coalesce(round(p_ads_mensal, 2), v_atual.ads_mensal),
    coalesce(v_atual.desconto_pix_pct, 0),
    coalesce(v_atual.fatia_pix_pct, 0)
  ) returning id into v_id;

  return v_id;
end;
$$;

/** Ajusta o desconto de Pix e a fatia medida, sem tocar no resto. */
create function ajustar_pix_parametro(
  p_desconto_pct numeric,
  p_fatia_pct    numeric,
  p_operador     text
) returns void
language plpgsql
as $$
declare
  v_atual parametros_precificacao%rowtype;
begin
  if p_desconto_pct < 0 or p_desconto_pct >= 100 then
    raise exception 'desconto de Pix fora da faixa: %', p_desconto_pct;
  end if;
  if p_fatia_pct < 0 or p_fatia_pct > 100 then
    raise exception 'fatia de Pix fora da faixa: %', p_fatia_pct;
  end if;

  select * into v_atual from parametros_precificacao order by vigente_desde desc limit 1;
  if not found then
    raise exception 'não há parâmetro de precificação vigente';
  end if;

  insert into parametros_precificacao (
    intermediador_pct, intermediador_fixo, checkout_pct, imposto_pct, ads_pct,
    insumos, frete_subsidio, antifraude, perda_pct, margem_alvo,
    vigente_desde, criado_por, ads_mensal, desconto_pix_pct, fatia_pix_pct
  ) values (
    v_atual.intermediador_pct, v_atual.intermediador_fixo, v_atual.checkout_pct,
    v_atual.imposto_pct, v_atual.ads_pct, v_atual.insumos, v_atual.frete_subsidio,
    v_atual.antifraude, v_atual.perda_pct, v_atual.margem_alvo,
    now(), p_operador, v_atual.ads_mensal,
    round(p_desconto_pct, 3), round(p_fatia_pct, 3)
  );
end;
$$;
