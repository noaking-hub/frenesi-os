-- ═══════════════════════════════════════════════════════════════════════════
-- Parcela de cartão vence no dia da FATURA, não a cada 30 dias corridos.
--
-- Medido com uma compra real em 5× no Cartão Digio (fatura todo dia 20),
-- primeira parcela em 20/08: as demais nasciam em 19/09, 19/10, 18/11 e 18/12.
-- Trinta dias corridos não é um mês — o ano tem 365 dias, e a deriva chega a
-- cinco dias na décima segunda parcela. Numa compra em 12× a última parcela
-- caía numa fatura anterior à que vai cobrá-la, e a projeção de caixa passava
-- a mostrar a saída no mês errado.
--
-- Dias corridos continuam certos para o resto do mundo: carnê, boleto de
-- fornecedor, acordo em 3× a cada 15 dias. O que muda é o cartão, e ele se
-- identifica sozinho — é a conta que tem `dia_vencimento`. Quando ela tem, o
-- cronograma anda por MÊS DE CALENDÁRIO ancorado nesse dia, e `p_intervalo_dias`
-- deixa de ser consultado: no cartão quem manda é o fechamento da fatura, não
-- um número de dias.
--
-- Mês curto não empurra a data para o mês seguinte: fatura dia 31 vence em
-- 28/02 (ou 29), e não em 03/03. `least(dia, último dia do mês)` é a mesma
-- regra que `proximaFatura`, no formulário, já usa para preencher a primeira.
--
-- `create or replace` com a assinatura intacta: quem chama (parcelar_lancamento
-- e a venda manual) não muda uma linha, e os privilégios do objeto seguem de pé.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gravar_parcelas_do_lancamento(
  p_modelo lancamentos,
  p_parcelas smallint,
  p_intervalo_dias int default 30,
  p_ja_recebidas smallint default 0,
  p_recebidas_em date default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_valor numeric;
  v_resto numeric;
  v_valor_i numeric;
  v_primeiro_venc date;
  v_ja smallint := coalesce(p_ja_recebidas, 0);
  v_criadas int := 0;
  -- Null em conta que não é cartão, e é essa nulidade que escolhe o cronograma.
  v_dia_fatura smallint;
  v_venc_i date;
  v_mes date;
begin
  if p_parcelas is null or p_parcelas < 2 then
    raise exception 'parcelamento exige ao menos 2 parcelas';
  end if;
  if p_parcelas > 48 then
    raise exception 'no máximo 48 parcelas';
  end if;
  if coalesce(p_intervalo_dias, 0) < 1 then
    raise exception 'o intervalo entre parcelas precisa ser de ao menos 1 dia';
  end if;

  if v_ja < 0 then
    raise exception 'não existe número negativo de parcelas já recebidas';
  end if;
  if v_ja > p_parcelas then
    raise exception 'não dá para marcar % parcelas já recebidas em um parcelamento de %',
      v_ja, p_parcelas;
  end if;
  if v_ja > 0 and p_recebidas_em is null then
    raise exception 'informe a data em que as parcelas já recebidas entraram';
  end if;

  -- O centavo do arredondamento vai na PRIMEIRA parcela, não na última: quem
  -- confere o boleto de hoje encontra a diferença agora, e não daqui a 11
  -- meses. `dividirEmParcelas`, em src/domain/parcelamento.ts, é o espelho
  -- desta conta.
  v_valor := trunc(p_modelo.valor / p_parcelas, 2);
  v_resto := p_modelo.valor - (v_valor * p_parcelas);

  if v_valor <= 0 then
    raise exception 'não dá para dividir R$ % em % parcelas: sobraria parcela de R$ 0,00',
      to_char(p_modelo.valor, 'FM999999990.00'), p_parcelas;
  end if;

  v_primeiro_venc := case when v_ja > 0 then p_recebidas_em
                          else coalesce(p_modelo.vence_em, p_modelo.competencia) end;

  -- Conta sem `dia_vencimento` — corrente, gateway, carteira — devolve null e
  -- cai no cronograma de dias corridos de sempre. Conta que não existe também:
  -- `conta_id` é opcional em lançamento, e um select vazio deixa a variável nula.
  select c.dia_vencimento into v_dia_fatura
    from contas_bancarias c where c.id = p_modelo.conta_id;

  for i in 1..p_parcelas loop
    v_valor_i := v_valor + case when i = 1 then v_resto else 0 end;

    if i <= v_ja then
      -- A parcela já paga vence no dia em que foi paga. Data futura numa linha
      -- quitada faria a coluna "vence" contradizer o "baixado em" ao lado.
      v_venc_i := p_recebidas_em;
    elsif v_dia_fatura is not null then
      -- Cartão: uma parcela por fatura, sempre no mesmo dia do mês. O mês é
      -- contado a partir do da PRIMEIRA parcela, então uma compra em 5× cujo
      -- primeiro vencimento é 20/08 fecha em 20/12 — e não em 18/12.
      v_mes := (date_trunc('month', v_primeiro_venc::timestamp)
                + ((i - 1) || ' month')::interval)::date;
      v_venc_i := v_mes + (least(
        v_dia_fatura::int,
        extract(day from (v_mes + interval '1 month - 1 day'))::int
      ) - 1);
    else
      -- Dias CORRIDOS: 07/09 + 30 + 30 é 06/11, e a tela mostra a data
      -- calculada justamente para não prometer "mensal" e entregar 06/11.
      v_venc_i := v_primeiro_venc + ((i - 1) * p_intervalo_dias);
    end if;

    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id,
      centro_custo, conta_id, tipo, valor, recebido, baixado_em, origem, favorecido,
      documento, observacao, parcela, parcelas, pai_id, criado_por,
      pedido_id, chave_externa
    ) values (
      p_modelo.id || '-' || i,
      p_modelo.ocorrido_em,
      -- A competência de TODAS é a do fato: a compra aconteceu uma vez só. O que
      -- se espalha pelos vencimentos é o caixa, não o resultado.
      p_modelo.competencia,
      v_venc_i,
      p_modelo.descricao || ' (' || i || '/' || p_parcelas || ')',
      p_modelo.categoria, p_modelo.categoria_id, p_modelo.centro_custo, p_modelo.conta_id,
      p_modelo.tipo,
      v_valor_i,
      -- As K primeiras nascem QUITADAS. As demais, inteiramente em aberto: ou a
      -- parcela está paga por inteiro, ou está aberta por inteiro.
      case when i <= v_ja then v_valor_i else 0 end,
      case when i <= v_ja then p_recebidas_em else null end,
      p_modelo.origem, p_modelo.favorecido,
      p_modelo.documento, p_modelo.observacao,
      i::smallint, p_parcelas, p_modelo.pai_id, p_modelo.criado_por,
      p_modelo.pedido_id,
      case when p_modelo.chave_externa is null then null
           else p_modelo.chave_externa || '-' || i end
    );
    v_criadas := v_criadas + 1;
  end loop;

  return v_criadas;
end;
$$;

comment on function gravar_parcelas_do_lancamento(lancamentos, smallint, int, smallint, date) is
  'Escreve um lançamento repartido em N vencimentos, das quais as K primeiras já nascem quitadas. Em conta com `dia_vencimento` (cartão) o cronograma segue o dia da fatura e ignora o intervalo em dias; nas demais, soma dias corridos. Único lugar do sistema que sabe dividir o valor e espaçar as datas.';
