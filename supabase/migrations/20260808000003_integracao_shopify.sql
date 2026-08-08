-- Integração Shopify: vínculo dos registros com a loja e trilha de sincronização.
--
-- A Shopify é a fonte do CATÁLOGO (nome, marca, variantes, preço publicado,
-- quantidade publicada). Custo por ml, volume em estoque e consumo continuam
-- sendo do ERP — a importação nunca os sobrescreve.

alter table perfumes_base
  add column shopify_product_id text unique,
  add column shopify_handle     text;

alter table produtos_derivados
  add column shopify_variant_id text;

alter table shopify_publicado
  add column shopify_variant_id text;

-- Cada execução de sincronização vira uma linha: o que veio, o que foi
-- ignorado e por quê. A tela mostra a última — derivada daqui, nunca digitada.
create table sincronizacoes (
  id            bigint generated always as identity primary key,
  origem        text not null check (origem in ('shopify', 'yampi')),
  tipo          text not null,
  executada_em  timestamptz not null default now(),
  perfumes      integer not null default 0,
  variantes     integer not null default 0,
  ignorados     integer not null default 0,
  -- [{ produto, variante?, motivo }]
  detalhes      jsonb not null default '[]'::jsonb
);

alter table sincronizacoes enable row level security;
create policy erp_leitura on sincronizacoes for select to authenticated using (true);
