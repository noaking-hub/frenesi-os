-- ═══════════════════════════════════════════════════════════════════════════
-- A ponte que faltava entre o pedido e o dinheiro.
--
-- O extrato do Mercado Pago traz o id do pagamento e mais nada sobre a venda.
-- A busca de pagamentos traz a referência externa, mas a Yampi manda ali um
-- token de carrinho (`hWNFxk2p…`), não o número do pedido — então nem o
-- gateway sabe de qual venda se trata. Sobrava casar por valor e data, que é
-- palpite e recusa sempre que dois decants do mesmo preço caem no mesmo dia.
-- Resultado: 89 vendas de 230 numa fila de decisões sem nada a decidir.
--
-- A Yampi guarda, em cada pedido, a transação com o identificador que o
-- gateway devolveu. É o mesmo id que aparece no extrato. A chave exata sempre
-- esteve a uma chamada de distância — só não estava sendo pedida.
--
-- `identificadores` é uma lista, não um campo: a Yampi chama esse id ora de
-- `transaction_id`, ora de `gateway_transaction_id`, e a grafia muda entre
-- versões e entre gateways. Guardar todos os candidatos e casar por qualquer
-- um custa nada quando sobra e custa a venda inteira quando falta.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists pedido_transacoes (
  pedido_id       text not null references pedidos(id) on delete cascade,
  transacao_id    text not null,
  gateway         text not null default '',
  status          text not null default '',
  valor           numeric(12,2) not null default 0,
  parcelas        integer not null default 0,
  identificadores text[] not null default '{}',
  lido_em         timestamptz not null default now(),
  primary key (pedido_id, transacao_id)
);

comment on table pedido_transacoes is
  'Transações de pagamento de cada pedido, lidas da Yampi. É por elas que a linha do extrato encontra a venda.';

comment on column pedido_transacoes.identificadores is
  'Todo valor que pode ser o id no gateway. Casa-se por qualquer um: um candidato a mais nunca casa, um a menos deixa a venda órfã.';

-- Busca por identificador é o caminho quente da conciliação.
create index if not exists pedido_transacoes_ids
  on pedido_transacoes using gin (identificadores);

/**
 * Liga as linhas de extrato ao pedido pelo identificador da transação.
 *
 * Exato, ao contrário do casamento por valor e data. Roda a cada atualização
 * do extrato e a cada importação de pedidos, o que resolve os dois atrasos
 * possíveis: o pedido que chega depois do dinheiro e o dinheiro que chega
 * depois do pedido.
 */
create or replace function ligar_extrato_por_transacao(p_origem text default 'mercadopago')
returns integer
language plpgsql
as $$
declare
  v_ligadas integer;
begin
  update extrato_linhas e
     set pedido_id = t.pedido_id
    from pedido_transacoes t
   where e.origem = p_origem
     and e.pedido_id is null
     and nullif(e.documento, '') is not null
     and e.documento = any (t.identificadores);
  get diagnostics v_ligadas = row_count;

  return v_ligadas;
end;
$$;

comment on function ligar_extrato_por_transacao is
  'Liga linha de extrato ao pedido pelo id da transação no gateway, lido da Yampi.';
