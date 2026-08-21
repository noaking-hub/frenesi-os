-- ═══════════════════════════════════════════════════════════════════════════
-- 57 pagamentos por PIX descritos como "Transferência para conta bancária".
--
-- O Mercado Pago chama de `payout` QUALQUER saída de dinheiro: o saque para o
-- banco próprio e o PIX para o fornecedor. O ERP traduzia esse rótulo para
-- "Transferência para conta bancária" — que é uma das duas leituras, escrita
-- como se fosse a única.
--
-- O dono já tinha classificado todas: frete, motoboy, embalagem, frasco,
-- perfume base, imposto, mídia. Nenhuma é `transferencias`. Ou seja: a
-- categoria dizia a verdade e a descrição dizia o contrário, na mesma linha.
--
-- Isso não é cosmético. A descrição é o que aparece na lista de Lançamentos,
-- na busca e no extrato — e é por ela que alguém procura "onde foi parar
-- aquele pagamento". Cinquenta e sete linhas dizendo "transferência" para
-- pagamentos que nunca voltaram para conta nenhuma é o tipo de ruído que faz
-- a conferência de um mês inteiro parecer errada quando está certa.
--
-- A descrição nova sai da CATEGORIA, e não de um palpite sobre o
-- destinatário: é o único dado que já foi decidido por uma pessoa. O
-- `favorecido` continua nulo de propósito — o gateway não revela o
-- destinatário, e preenchê-lo aqui seria inventar o nome de quem recebeu.
--
-- Nada muda de valor, data, conta ou categoria. Só o rótulo.
-- ═══════════════════════════════════════════════════════════════════════════

update lancamentos l
   set descricao = case l.categoria_id
                     when 'perfume-base'      then 'Compra de perfume base'
                     when 'frascos-e-insumos' then 'Frascos e insumos'
                     when 'embalagens'        then 'Embalagens'
                     when 'frete'             then 'Fretes'
                     when 'motoboy'           then 'Motoboy'
                     when 'imposto'           then 'Imposto'
                     when 'trafego-pago'      then 'Mídia paga'
                     else c.nome
                   end,
       atualizado_em = now()
  from categorias_financeiras c
 where c.id = l.categoria_id
   and l.descricao ilike 'Transfer%ncia para conta banc%'
   and l.cancelado_em is null
   -- A guarda que impede o tiro no pé: linha ainda classificada como
   -- transferência PODE ser transferência de verdade, e aí a descrição está
   -- certa. Só renomeia o que já foi decidido ser outra coisa.
   and l.categoria_id <> 'transferencias';
