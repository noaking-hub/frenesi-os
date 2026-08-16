-- Seis vendas de maio pela Pagaleve de OUTRO CNPJ, conta encerrada.
--
-- Elas estavam dispensadas por "anterior ao primeiro extrato disponível", o
-- que é verdade e é irrelevante — coincidência de data, não a causa. A causa é
-- que o dinheiro entrou numa conta que a operação não usa mais, e por isso
-- nenhuma importação futura vai achá-lo: a API responde pela conta atual.
--
-- Trocar o motivo não muda nenhum número. Muda quem lê. Com o motivo antigo,
-- basta alguém carregar extrato mais velho para as seis voltarem à fila
-- pedindo uma conciliação que é impossível por natureza; com o motivo certo,
-- quem abrir a linha entende em cinco segundos por que ela nunca vai fechar.
--
-- Os checkouts vêm do `identificadores` da transação da Yampi, que guarda o id
-- da Pagaleve. Não é lista digitada à mão: é o que o ERP já tinha gravado.
update public.repasses r
   set dispensa_motivo = 'Venda pela Pagaleve de outro CNPJ, conta encerrada — '
                      || 'o crédito não entrou em nenhuma conta do ERP',
       dispensado_em = coalesce(r.dispensado_em, now())
  from public.pedido_transacoes t
 where t.pedido_id = r.pedido_id
   and t.identificadores && array[
     '62a48e73-9d69-4c08-9757-d1596e63dd12',
     '812260c4-be65-42bc-9556-2f3100bf014d',
     '5de1a541-1e82-4fd4-98d5-052aceb51abc',
     'd5bacfc5-b801-44fb-8df1-16e08fab7b05',
     '2a60455b-d86a-4a04-989a-684da8d9861f',
     '3dae4b7f-3604-4392-b5df-f111310b6d68'
   ]
   and r.recebido is null;
