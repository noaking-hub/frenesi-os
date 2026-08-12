-- Eventos de rastreio da transportadora.
--
-- A Yampi entrega o código e a confirmação de entrega, nunca o caminho do
-- objeto. Quem tem os escaneamentos é quem emitiu a etiqueta — Frenet e
-- Melhor Envio. Esta tabela guarda esses eventos para o ERP mostrar a linha
-- do tempo e para o site do cliente consumi-la sem consultar a transportadora
-- a cada visita.
--
-- A chave é o par (código, quando, descrição) resumido em `id`: a mesma
-- ocorrência chega tanto pelo webhook quanto pela varredura de reforço, e
-- gravar duas vezes viraria timeline duplicada na cara do cliente.

create table if not exists rastreio_eventos (
  id text primary key,
  codigo text not null,
  pedido_id text references pedidos (id) on delete cascade,
  quando timestamptz,
  descricao text not null,
  local text,
  -- 'frenet' | 'melhorenvio' — de onde o evento veio, para diagnóstico.
  origem text not null,
  -- Marca a ocorrência que representa a entrega concluída.
  entregue boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists rastreio_eventos_codigo_idx on rastreio_eventos (codigo, quando desc);
create index if not exists rastreio_eventos_pedido_idx on rastreio_eventos (pedido_id, quando desc);

comment on table rastreio_eventos is 'Escaneamentos da transportadora, vindos de Frenet e Melhor Envio';

-- Quando o ERP consultou o rastreio de cada código pela última vez. Fica no
-- pedido porque a pergunta é sempre "quais códigos estão velhos" — e sem ela
-- a varredura releria os 383 códigos a cada rodada.
alter table pedidos add column if not exists rastreio_lido_em timestamptz;
