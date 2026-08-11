-- Movimentos do mercado: o que mudou entre uma vasculhada e a outra.
--
-- A coleta substitui os preços de cada loja — sem este registro, a mudança
-- de preço do concorrente evaporava a cada releitura. Aqui fica o diff:
-- subiu, baixou, produto que entrou, produto que saiu. É a matéria-prima
-- dos alertas e do histórico por perfume.
create table concorrente_mudancas (
  id             bigint generated always as identity primary key,
  concorrente_id text not null,
  titulo         text not null,
  base_id        text,
  variante       smallint,
  tipo           text not null check (tipo in ('subiu', 'baixou', 'entrou', 'saiu')),
  preco_de       numeric(10, 2),
  preco_para     numeric(10, 2),
  ocorrida_em    timestamptz not null default now()
);

create index on concorrente_mudancas (ocorrida_em desc);

alter table concorrente_mudancas enable row level security;
create policy erp_leitura on concorrente_mudancas for select to authenticated using (true);
