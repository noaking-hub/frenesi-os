-- ═══════════════════════════════════════════════════════════════════════════
-- O id do pagamento vence o palpite, mesmo chegando depois.
--
-- O QUE ACONTECEU (20/08, medido no banco)
--
-- 15:32:03 — a rotina do Mercado Pago leu o extrato e criou a linha
--            `2026-08-20:173818124997:payment:30600:1`: R$ 306,00, documento
--            173818124997. É o PIX da Ana Wilma, comprovante em mãos.
--            Nesse instante a venda dela ainda NÃO existia no ERP. O único
--            pedido de R$ 306,00 na janela de três dias era o
--            YP-1510190952075742 (Marco Aurelio, 17/08) — candidato único, e o
--            casamento por valor+data deu o dinheiro a ele.
-- 15:32:14 — `converter_extrato_em_caixa` derivou dali o lançamento
--            "Venda YP-1510190952075742", R$ 306,00, no Mercado Pago.
-- 16:44:23 — só então a venda manual foi registrada (MAN-0002), COM o id do
--            pagamento digitado certo: 173818124997.
--
-- Ou seja: o operador fez tudo certo, inclusive a parte opcional. O crédito
-- chegou uma hora antes da venda ser lançada, e nada revisitava o palpite.
-- `ligar_extrato_por_transacao` casaria certo — o documento da linha é
-- exatamente o id informado —, mas ela só olha linha SEM pedido, e essa já
-- tinha dono.
--
-- A REGRA QUE FALTAVA: igualdade exata vence palpite, não importa a ordem de
-- chegada. Quando o ERP aprende que um pagamento pertence a um pedido, a linha
-- do extrato daquele pagamento passa a ser dele — e o que o palpite derivou é
-- desfeito. É o que esta migração instala, e o reparo do caso real é feito
-- chamando a própria função nova: se ela consertar a Ana Wilma, ela funciona.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reivindicar_credito_do_pagamento(
  p_pedido_id text,
  p_documento text
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc text := nullif(trim(coalesce(p_documento, '')), '');
  v_valor numeric;
  v_linha record;
  v_reivindicadas integer := 0;
begin
  if v_doc is null then
    return 0;
  end if;

  select valor into v_valor from pedidos where id = p_pedido_id;
  if v_valor is null then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;

  for v_linha in
    select e.chave, e.valor, e.pedido_id
      from extrato_linhas e
     where e.documento = v_doc
       -- Só a linha de CRÉDITO. O mesmo documento aparece em movimentos
       -- internos do gateway ("Reserva de pagamento", "Reserva para
       -- transferência"), e nenhum deles é o dinheiro da venda.
       and e.descricao = 'Venda recebida'
       and not e.ignorado
  loop
    -- Já é deste pedido: o caminho feliz, quando o crédito chega depois da
    -- venda e `ligar_extrato_por_transacao` casou sozinho.
    continue when v_linha.pedido_id is not distinct from p_pedido_id;

    -- O crédito tem de caber na venda. `converter_extrato_em_caixa` exige
    -- `p.valor >= e.valor` e lança a diferença como tarifa do gateway; um
    -- crédito MAIOR que a venda não é desta venda, e reivindicá-lo faria o
    -- dinheiro sumir em silêncio, porque a conversão pularia a linha e ela já
    -- não apareceria mais como crédito a classificar.
    continue when v_linha.valor > v_valor;

    -- Desfaz o que o palpite derivou. A ordem importa: `extrato_linhas`
    -- referencia o lançamento, então o vínculo sai antes da linha morrer.
    update extrato_linhas set lancamento_id = null where chave = v_linha.chave;
    delete from lancamentos
     where origem like 'Extrato %'
       and chave_externa in (v_linha.chave, 'taxa-' || v_linha.chave);

    update extrato_linhas set pedido_id = p_pedido_id where chave = v_linha.chave;
    v_reivindicadas := v_reivindicadas + 1;
  end loop;

  -- Reconstrói o caixa pela lógica de sempre, em vez de escrever o lançamento
  -- à mão aqui: a conversão já sabe montar descrição, categoria, competência e
  -- a tarifa do gateway, e duas cópias dessa regra divergiriam no primeiro
  -- ajuste. Ela só enxerga linha com `lancamento_id` nulo, que é o estado em
  -- que a linha acabou de ficar.
  if v_reivindicadas > 0 then
    perform converter_extrato_em_caixa();
  end if;

  return v_reivindicadas;
end;
$function$;

revoke all on function public.reivindicar_credito_do_pagamento(text, text)
  from public, anon, authenticated;
grant execute on function public.reivindicar_credito_do_pagamento(text, text)
  to service_role;

comment on function public.reivindicar_credito_do_pagamento(text, text) is
  'Dá ao pedido a linha de crédito do extrato cujo documento é o id do pagamento informado, desfazendo o lançamento que o casamento por valor+data tenha derivado antes. Igualdade exata vence palpite, mesmo chegando depois. Devolve quantas linhas mudaram de dono.';

-- ── O reparo do caso real ─────────────────────────────────────────────────
--
-- Feito pela função nova, de propósito: o conserto de hoje é o teste dela.
-- Depois disto, o crédito de R$ 306,00 de 20/08 pertence ao MAN-0002 (Ana
-- Wilma) e o pedido do Marco Aurelio volta a aguardar o crédito dele — que é
-- outro, e ainda não foi identificado.
do $do$
declare
  v_mudadas integer;
begin
  if exists (select 1 from pedidos where id = 'MAN-0002') then
    select reivindicar_credito_do_pagamento('MAN-0002', '173818124997') into v_mudadas;
    raise notice 'Linhas do extrato devolvidas ao MAN-0002: %', v_mudadas;
  end if;
end $do$;
