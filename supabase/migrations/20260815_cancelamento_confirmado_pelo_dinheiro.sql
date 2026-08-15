-- ESTORNO PARCIAL NÃO É CANCELAMENTO
--
-- A conversão tirava da receita todo pedido marcado como cancelado, confiando
-- no status que vem da loja. O caso que ensinou: um item esgotou depois da
-- compra, a operação estornou só aquele item e enviou o resto. O cancelamento
-- na loja foi engano — o pedido foi entregue —, mas o ERP obedeceu e apagou
-- uma venda de R$ 540,00 que existiu.
--
-- O dinheiro não mente. Cancelado com estorno TOTAL é venda desfeita; com
-- estorno PARCIAL ou nenhum, o dinheiro ficou, e então é venda, com o estorno
-- lançado à parte em "Estornos e devoluções". Quando o status da loja e o
-- extrato discordam, quem manda é o extrato.
--
-- Dos três pedidos cancelados com crédito, o teste separou corretamente:
--   YP-1510190500460251  creditou 885,80  estornou 885,80  -> venda desfeita
--   YP-1510190745184906  creditou 459,32  estornou  26,80  -> VENDA legítima
--   YP-1510190605467642  creditou  49,75  estornou  49,75  -> venda desfeita
create or replace function pedido_cancelado_de_verdade(p_pedido_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- Estornou 99% ou mais do que entrou: venda desfeita. A folga de 1% é
    -- para centavo de arredondamento do adquirente, não para estorno parcial.
    sum(case when e.descricao = 'Estorno ao cliente' then e.valor else 0 end)
      >= 0.99 * nullif(sum(case when e.descricao = 'Venda recebida' then e.valor else 0 end), 0),
    false)
  from extrato_linhas e
  where e.pedido_id = p_pedido_id and not e.ignorado;
$$;

comment on function pedido_cancelado_de_verdade is
  'Cancelamento confirmado pelo dinheiro, não pelo status da loja. Estorno parcial não cancela venda.';

-- Em `converter_extrato_em_caixa`, as três primeiras inserções passam a usar
--   not (p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id))
-- no lugar de `p.situacao <> 'cancelado'`. A função completa está em
-- 20260815_caixa_real_extrato.sql.

-- Reparo do pedido que o engano apagou: SH-1871, Isabelle Fernandez, 10/08.
update pedidos set pagamento = 'pago', situacao = 'enviado'
 where id = 'YP-1510190745184906';

update lancamentos
   set descricao = 'Venda YP-1510190745184906 – Isabelle Fernandez',
       categoria = 'Vendas', categoria_id = 'vendas',
       pedido_id = 'YP-1510190745184906', valor = 540.00, recebido = 540.00
 where id = 'ext-2026-08-10:172234003463:payment:45932:1';
