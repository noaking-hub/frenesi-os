-- O serviço que a Frenet aceitou e o link público do objeto.
--
-- `servico_frete` guarda o RÓTULO da Yampi (`FRENET_SEDEX_03220`), que a
-- consulta de rastreio da Frenet não reconhece: ela quer o código do serviço
-- (`03220`, `03298`, `F_3`, `JTE_INT`). Descobrir o código certo custa uma
-- tentativa por candidato, e metade dos pedidos veio de antes do ERP sem
-- rótulo nenhum — guardar o que funcionou evita repetir a busca a cada rodada.
--
-- `rastreio_url` existe porque a Jadlog não devolve histórico pela Frenet:
-- ela reconhece o objeto, responde com a página pública e uma lista de
-- ocorrências VAZIA, mesmo depois de entregue. Sem guardar esse link, esses
-- pedidos ficariam sem absolutamente nada para mostrar ao cliente.
alter table pedidos add column if not exists rastreio_servico text;
alter table pedidos add column if not exists rastreio_url text;

comment on column pedidos.rastreio_servico is 'Código do serviço da Frenet que respondeu a consulta (03220, F_3, JTE_INT…)';
comment on column pedidos.rastreio_url is 'Página pública de rastreio devolvida pela transportadora';
