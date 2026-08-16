-- A compra que originou a parcela fica guardada na própria linha.
--
-- Sem isso, o vínculo com o pedido só pode ser feito no instante da
-- importação: perdida a data e o valor da compra, refazer o casamento exigiria
-- o relatório de novo. Com eles aqui, o vínculo é recalculável a qualquer
-- momento — inclusive para pedidos que só forem importados depois.
alter table public.pagaleve_parcelas
  add column if not exists comprada_em date,
  add column if not exists total_da_compra numeric(12,2);

comment on column public.pagaleve_parcelas.total_da_compra is
  'Valor da venda inteira, usado para casar com o pedido do ERP.';
