-- ═══════════════════════════════════════════════════════════════════════════
-- A parcela do KGIRO sempre debita no Inter.
--
-- Dezenove parcelas apontavam para o Inter e uma — a de 16/08/2026, a única já
-- paga — para "Rafael (PF)". Não era uma exceção do contrato: era lançamento
-- errado, e a conta do débito é sempre a mesma. Enquanto ficasse assim, a
-- projeção de caixa mostraria a saída de setembro em diante numa conta e o
-- histórico de agosto em outra, e "quanto o Inter paga de banco por mês" daria
-- respostas diferentes conforme o mês olhado.
--
-- O saldo EXIBIDO das duas contas não se mexe, e vale registrar por quê: as
-- duas têm `saldo_informado` — foto do Inter em 20/08 e do Rafael (PF) em
-- 17/08 — e a view só soma lançamentos POSTERIORES ao marco. A baixa é de
-- 16/08, anterior aos dois. O que muda é o movimento do mês: Rafael (PF)
-- deixa de ter a única saída que tinha em agosto, e ela reaparece no Inter,
-- onde de fato saiu.
-- ═══════════════════════════════════════════════════════════════════════════

update lancamentos
   set conta_id = 'inter'
 where documento = 'C517206125'
   and conta_id <> 'inter';
