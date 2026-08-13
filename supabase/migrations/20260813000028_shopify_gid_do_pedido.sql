-- O identificador estável do pedido na Shopify.
--
-- O vínculo guardava só o `name` (`SH-1885`), que é rótulo de exibição: ele
-- muda se a loja for renumerada, e não serve para chamar a API. O GID
-- (`gid://shopify/Order/…`) é o que a Admin API aceita, e é dele que o
-- espelhamento de fulfillment precisa para marcar envio e entrega.
--
-- Guardar os dois não é redundância: o número é o que o cliente vê e informa;
-- o GID é o que o ERP usa para falar com a loja.
alter table pedidos add column if not exists shopify_gid text;

comment on column pedidos.shopify_gid is 'GID do pedido na Shopify (gid://shopify/Order/…), para chamadas à Admin API';
