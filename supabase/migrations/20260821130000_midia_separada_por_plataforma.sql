-- ═══════════════════════════════════════════════════════════════════════════
-- Meta e Google deixam de dividir a mesma linha.
--
-- O relatório de mídia de 21/08 abriu com esta frase: "44% do investimento
-- estava invisível". A causa era uma categoria só — "Tráfego Pago" — somando
-- duas plataformas que se decide separadamente. Enquanto elas dividem a linha,
-- não existe a pergunta "quanto foi para cada uma", nem a resposta "esta
-- rendeu mais que aquela".
--
-- ── O que é certeza, e por quê ─────────────────────────────────────────────
--
-- Oito dos catorze lançamentos dizem no próprio texto de onde vieram — "Meta
-- ADS", "Google ADS", "Adição de Saldo · Google". Não é palpite: é o que o
-- operador escreveu na hora.
--
-- O nono é o de 05/08, R$ 1.000,00, que estava sem plataforma. Ele fecha por
-- CONFERÊNCIA, não por chute: a fatura da Meta de 01 a 21/08, transcrita no
-- relatório, lista três recargas — 05/08 R$ 1.000,00, 11/08 R$ 1.200,00 e
-- 16/08 R$ 1.205,49, somando R$ 3.405,49. As duas últimas já estavam marcadas
-- como Meta no ERP; a de 05/08 é a que faltava, e com ela o total no ERP passa
-- a bater ao centavo com a fatura da plataforma.
--
-- ── O que NÃO é certeza, e continua fora ───────────────────────────────────
--
-- Cinco lançamentos seguem em "Tráfego Pago": 22/07, 25/07, 27/07 e 31/07
-- (R$ 3.000,00) e 14/08 (R$ 500,00). São exatamente as duas perguntas que o
-- relatório de mídia deixou em aberto e que ninguém respondeu ainda.
--
-- Há um indício forte de que os quatro de julho são Meta — o primeiro
-- pagamento identificado como Google no ERP é de 01/08, e antes disso não há
-- nenhum. Indício não é prova, e escrever um palpite no livro de uma operação
-- é pior que deixar a lacuna à vista: a lacuna alguém fecha, o palpite vira
-- número que ninguém desconfia. Ficam onde estão, com a descrição dizendo o
-- que são.
--
-- "Tráfego Pago" passa a ser exatamente isto: mídia cuja plataforma não foi
-- identificada. Categoria vazia é a meta.
-- ═══════════════════════════════════════════════════════════════════════════

insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, conta_contabil, centro_custo,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, ativa
) values
  ('midia-meta',   'Mídia — Meta Ads',   'Despesa', 'despesa_comercial',
   '3.1.02.001 · mídia paga · meta',   'marketing', true, true, false, true, true),
  ('midia-google', 'Mídia — Google Ads', 'Despesa', 'despesa_comercial',
   '3.1.02.002 · mídia paga · google', 'marketing', true, true, false, true, true)
on conflict (id) do update
   set nome = excluded.nome,
       natureza_gerencial = excluded.natureza_gerencial,
       conta_contabil = excluded.conta_contabil,
       centro_custo = excluded.centro_custo,
       ativa = true;

-- Meta: as duas já rotuladas mais a de 05/08 que a fatura da plataforma
-- confirma. O `valor = 1000 and ocorrido_em = '2026-08-05'` é nominal de
-- propósito — há outro pagamento de R$ 500,00 no mesmo dia que é Google, e um
-- filtro por data sozinho levaria os dois.
update lancamentos
   set categoria = 'Mídia — Meta Ads',
       categoria_id = 'midia-meta',
       centro_custo = 'marketing',
       descricao = 'Meta Ads — adição de saldo',
       favorecido = 'Meta Platforms',
       atualizado_em = now()
 where categoria_id in ('trafego-pago', 'marketing-e-ads')
   and cancelado_em is null
   and (descricao ilike '%meta%'
        or (valor = 1000 and ocorrido_em = date '2026-08-05'));

update lancamentos
   set categoria = 'Mídia — Google Ads',
       categoria_id = 'midia-google',
       centro_custo = 'marketing',
       descricao = 'Google Ads — adição de saldo',
       favorecido = 'Google',
       atualizado_em = now()
 where categoria_id in ('trafego-pago', 'marketing-e-ads')
   and cancelado_em is null
   and (descricao ilike '%google%' or favorecido ilike '%google%');

-- O que sobrou diz que sobrou. "Mídia paga" sem mais nada deixava a lacuna
-- invisível; assim ela aparece na lista e cobra a resposta.
update lancamentos
   set descricao = 'Mídia paga — plataforma não identificada',
       atualizado_em = now()
 where categoria_id = 'trafego-pago'
   and cancelado_em is null;

comment on function marcar_estornados() is
  'Tira da receita a venda que voltou INTEIRA para o cliente. Estorno parcial não derruba o pedido — ele é registrado em `pedido_reembolsos` e deduzido pela linha do extrato.';
