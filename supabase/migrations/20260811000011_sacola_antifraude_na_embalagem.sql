-- A sacola lacrada de segurança do envio entra na embalagem, ao lado dos
-- demais itens. A soma continua em `insumos` — a única coluna que o cálculo
-- de preço lê.

alter table parametros_precificacao
  add column sacola_antifraude numeric(10, 2) not null default 0;

drop function salvar_parametros(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, numeric
);

create function salvar_parametros(
  p_intermediador_pct  numeric,
  p_intermediador_fixo numeric,
  p_checkout_pct       numeric,
  p_imposto_pct        numeric,
  p_ads_pct            numeric,
  p_frasco             numeric,
  p_valvula            numeric,
  p_tampa              numeric,
  p_etiqueta           numeric,
  p_caixa              numeric,
  p_plastico_bolha     numeric,
  p_sacola_antifraude  numeric,
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
  if least(p_intermediador_fixo, p_frasco, p_valvula, p_tampa, p_etiqueta, p_caixa,
           p_plastico_bolha, p_sacola_antifraude, p_frete_subsidio, p_antifraude) < 0 then
    raise exception 'custo fixo negativo não existe';
  end if;

  insert into parametros_precificacao (
    intermediador_pct, intermediador_fixo, checkout_pct, imposto_pct, ads_pct,
    insumos, frasco, valvula, tampa, etiqueta, caixa, plastico_bolha, sacola_antifraude,
    frete_subsidio, antifraude, perda_pct, margem_alvo, criado_por, ads_mensal
  ) values (
    round(p_intermediador_pct, 3), round(p_intermediador_fixo, 2), round(p_checkout_pct, 3),
    round(p_imposto_pct, 3), round(p_ads_pct, 3),
    round(p_frasco + p_valvula + p_tampa + p_etiqueta + p_caixa + p_plastico_bolha
          + p_sacola_antifraude, 2),
    round(p_frasco, 2), round(p_valvula, 2), round(p_tampa, 2), round(p_etiqueta, 2),
    round(p_caixa, 2), round(p_plastico_bolha, 2), round(p_sacola_antifraude, 2),
    round(p_frete_subsidio, 2), round(p_antifraude, 2), round(p_perda_pct, 3),
    round(p_margem_alvo, 3), p_operador, round(p_ads_mensal, 2)
  ) returning id into v_id;

  return v_id;
end;
$$;
