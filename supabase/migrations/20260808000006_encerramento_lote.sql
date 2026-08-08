-- ═══════════════════════════════════════════════════════════════════════════
-- Encerramento de lote: onde a perda deixa de ser estimativa e vira medida.
-- ═══════════════════════════════════════════════════════════════════════════

-- A versão do schema inicial nunca chegou a ser chamada por tela nenhuma, e
-- tinha três buracos: não gravava quem declarou nem o saldo resultante (as
-- colunas vieram depois, na migration de movimentações), e zerava o estoque
-- com `greatest(0, ...)` — o que transformava divergência em volume zerado,
-- calado. Trocada por inteiro; a assinatura muda, então é drop e create.
drop function encerrar_lote(text, text);

/**
 * Declarar o frasco vazio. UMA ação que fecha o lote, tira do estoque o
 * volume que sobrou no papel e lança o ajuste correspondente — nunca três
 * escritas soltas.
 *
 * A perda é a diferença entre o que foi comprado e o que o extrato de saídas
 * comprova ter sido envasado: fundo de frasco, respingo e evaporação. Ela só
 * existe agora porque só agora o frasco acabou; enquanto o lote está aberto
 * essa diferença é saldo, não perda.
 *
 * O volume sai da base porque o líquido não está mais lá. Sem essa baixa a
 * invariante do sistema quebraria: a soma dos saldos dos lotes abertos
 * deixaria de bater com o volume em estoque.
 */
create function encerrar_lote(p_lote_id text, p_operador text)
returns numeric
language plpgsql
as $$
declare
  v_lote        lotes%rowtype;
  v_consumido   numeric(12, 2);
  v_perda       numeric(12, 2);
  v_volume_base numeric(12, 2);
  v_saldo       numeric(12, 2);
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está declarando o frasco vazio';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'lote "%" não existe', p_lote_id;
  end if;
  if v_lote.encerrado_em is not null then
    raise exception 'lote % já foi encerrado em %', p_lote_id, v_lote.encerrado_em;
  end if;

  select coalesce(sum(unidades * variante), 0)
    into v_consumido
    from lote_saidas
   where lote_id = p_lote_id;

  v_perda := v_lote.volume_ml - v_consumido;

  -- Extrato acima do comprado é erro de lançamento, não perda negativa.
  if v_perda < 0 then
    raise exception
      'o extrato do lote % soma % ml envasados, mais que os % ml comprados — corrija as saídas antes de encerrar',
      p_lote_id, v_consumido, v_lote.volume_ml;
  end if;

  select volume_ml into v_volume_base
    from perfumes_base
   where id = v_lote.base_id
     for update;

  -- Baixar mais do que existe esconderia a divergência num volume zerado.
  if v_perda > v_volume_base then
    raise exception
      'a perda apurada (% ml) é maior que o volume em estoque da base (% ml) — há movimentação lançada fora do fluxo de lotes; acerte pelo Inventário antes de encerrar',
      v_perda, v_volume_base;
  end if;

  update lotes
     set encerrado_em = current_date,
         encerrado_por = p_operador
   where id = p_lote_id;

  -- Lote consumido até a última gota não gera lançamento: não houve perda.
  if v_perda > 0 then
    update perfumes_base
       set volume_ml = volume_ml - v_perda
     where id = v_lote.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_lote.base_id, 'ajuste', now(), -v_perda, p_lote_id,
      'Encerramento do lote · perda real medida no frasco', p_operador, v_saldo
    );
  end if;

  return v_perda;
end;
$$;

comment on function encerrar_lote is
  'Declara o frasco vazio: fecha o lote, baixa a perda real do estoque e lança o ajuste (ref = id do lote). Retorna a perda em ml.';

/**
 * Salvar os parâmetros de precificação.
 *
 * Não edita a linha vigente: grava uma NOVA vigência. O preço praticado
 * ontem continua explicável pelo parâmetro que valia ontem — sem isso o
 * histórico de margem viraria ficção retroativa.
 */
create function salvar_parametros(
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
  p_operador           text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está salvando os parâmetros';
  end if;

  -- A constraint parametros_coerentes já barra a soma acima de 100%; estes
  -- checks existem para a mensagem apontar o campo, não o constraint.
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
    insumos, frete_subsidio, antifraude, perda_pct, margem_alvo, criado_por
  ) values (
    round(p_intermediador_pct, 3), round(p_intermediador_fixo, 2), round(p_checkout_pct, 3),
    round(p_imposto_pct, 3), round(p_ads_pct, 3), round(p_insumos, 2),
    round(p_frete_subsidio, 2), round(p_antifraude, 2), round(p_perda_pct, 3),
    round(p_margem_alvo, 3), p_operador
  ) returning id into v_id;

  return v_id;
end;
$$;

comment on function salvar_parametros is
  'Nova vigência dos parâmetros de precificação. Não sobrescreve a anterior: preço antigo continua explicável.';

/**
 * Levar só o parâmetro de perda ao que os lotes encerrados mediram,
 * preservando as demais taxas da vigência atual.
 */
create function ajustar_perda_parametro(p_perda_pct numeric, p_operador text)
returns uuid
language plpgsql
as $$
declare
  v_atual parametros_precificacao%rowtype;
begin
  select * into v_atual
    from parametros_precificacao
   order by vigente_desde desc
   limit 1;
  if not found then
    raise exception 'não há parâmetros de precificação cadastrados';
  end if;

  return salvar_parametros(
    v_atual.intermediador_pct, v_atual.intermediador_fixo, v_atual.checkout_pct,
    v_atual.imposto_pct, v_atual.ads_pct, v_atual.insumos, v_atual.frete_subsidio,
    v_atual.antifraude, p_perda_pct, v_atual.margem_alvo, p_operador
  );
end;
$$;

comment on function ajustar_perda_parametro is
  'Nova vigência com a perda medida nos lotes encerrados, mantendo as demais taxas.';
