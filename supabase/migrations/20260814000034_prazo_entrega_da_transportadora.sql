-- O prazo de entrega cotado pela transportadora, em dias.
--
-- A régua do pedido tem duas metades: 72 h de produção+expedição (regra da
-- operação) e, depois do despacho, o prazo que a TRANSPORTADORA prometeu para
-- aquele envio. A Yampi não devolve esse número; quem o conhece é a Frenet
-- (cotação por serviço). Ele é gravado uma vez por pedido — cotar de novo a
-- cada tela daria um prazo diferente por dia, contado do dia errado.
alter table pedidos add column if not exists prazo_entrega_dias smallint;

comment on column pedidos.prazo_entrega_dias is
  'Prazo de entrega cotado pela transportadora, em dias corridos da postagem';
