-- O ERP creditou R$ 27.504,00 no Inter que nunca entraram lá.
--
-- O relatório de liberações do Mercado Pago descreve TODA saída de dinheiro com
-- a mesma frase: "Transferência para o banco". Sacar para o próprio banco e
-- pagar o Google no cartão da conta chegam idênticos, contraparte vazia.
--
-- Diante dessa ambiguidade o ERP não perguntou: a migration 20260816155013
-- marcou o Inter como `recebe_repasses` e o conversor passou a carimbar TODO
-- saque como transferência para lá, criando a perna de entrada correspondente.
-- Sessenta e duas vezes. O dono confirmou: nunca houve repasse ao Inter dessa
-- forma. Nenhuma das 62 entradas aconteceu.
--
-- Quatro delas o dono já tinha corrigido à mão (pagamentos ao Google ADS em
-- 01, 05, 09 e 13/08). Corrigir a saída não bastava: a tela de edição troca
-- descrição e categoria mas não desfaz o par, então a entrada fantasma
-- continuava viva no Inter.
--
-- Efeito medido: o saldo do Inter calculado pelo ERP cai de R$ 29.355,45 para
-- R$ 1.851,45. A divergência contra o saldo informado (R$ 915,76) — que a tela
-- vinha apontando havia semanas sem ninguém ligar à causa — cai de vinte e oito
-- mil para R$ 935,69.
--
-- Cancelar, e não apagar: `cancelado_em` some da fila de trabalho e continua
-- respondendo "o que aconteceu com aquele lançamento?". Apagar levaria junto a
-- explicação.
update public.lancamentos
   set cancelado_em = now(),
       cancelado_motivo = 'perna criada pela regra "saque vai para o Inter"; '
                       || 'o dono confirmou que nunca houve repasse ao Inter dessa forma',
       atualizado_em = now()
 where id like '%:destino'
   and conta_id = 'inter'
   and transferencia_id is not null
   and cancelado_em is null;

-- As quatro que o dono já classificou deixam de ser transferência de vez. O
-- `transferencia_id` é o que fazia o lançamento se apresentar como movimentação
-- interna; mantê-lo ao lado de uma categoria de despesa cria um híbrido que
-- nenhuma tela sabe ler — e faria o conversor recriar a perna na próxima
-- rodada.
update public.lancamentos
   set transferencia_id = null,
       conta_destino_id = null,
       aguarda_destino = false,
       atualizado_em = now()
 where tipo = 'saida'
   and transferencia_id is not null
   and origem like 'Extrato %'
   and categoria is distinct from 'Transferências'
   and cancelado_em is null;

-- As outras 58 voltam para a fila de "Destino dos repasses", que existe
-- exatamente para isto e até hoje nunca recebeu uma linha — porque a regra
-- cega respondia antes de alguém ser perguntado. `transferencia_id` fica: é
-- dele que `resolver_destino_do_payout` monta a perna quando a resposta for
-- "foi para conta própria".
update public.lancamentos
   set conta_destino_id = null,
       aguarda_destino = true,
       atualizado_em = now()
 where tipo = 'saida'
   and transferencia_id is not null
   and origem like 'Extrato %'
   and categoria = 'Transferências'
   and cancelado_em is null;

-- E a regra para de decidir sozinha. Sem conta marcada, `v_destino` sai nulo,
-- o conversor grava `aguarda_destino = true` e o saque novo nasce esperando
-- resposta humana em vez de nascer com uma resposta inventada.
--
-- Não é desligar funcionalidade: é devolver a pergunta à única parte que sabe
-- respondê-la. Quando houver de fato uma conta que recebe todo repasse, marcar
-- de novo é uma linha — mas aí será uma decisão tomada, e não herdada.
update public.contas_bancarias set recebe_repasses = false where recebe_repasses;
