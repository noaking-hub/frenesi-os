-- Trilha de auditoria da publicação de preço (escopo do módulo de Produtos,
-- Fase 2): cada envio à Shopify registra o preço anterior, o novo, quem
-- mandou, quando, de onde — e o VEREDITO do retorno da loja. "Publicado"
-- sem conferência já mentiu uma vez; aqui o resultado é um fato gravado.
create table precos_publicados (
  id bigint generated always as identity primary key,
  base_id text not null references perfumes_base(id),
  variante integer not null,
  preco_anterior numeric,
  preco_novo numeric not null,
  usuario text not null,
  origem text not null default 'precificacao',
  publicado_em timestamptz not null default now(),
  -- confirmado: a loja devolveu o mesmo valor. divergente: devolveu outro.
  -- recusado: nem chegou a gravar (userError, sem vínculo, abaixo do piso).
  resultado text not null check (resultado in ('confirmado', 'divergente', 'recusado')),
  detalhe text
);

create index precos_publicados_por_base on precos_publicados (base_id, publicado_em desc);

comment on table precos_publicados is
  'Auditoria de publicação de preço na Shopify: antes/depois, autor e retorno da loja';
