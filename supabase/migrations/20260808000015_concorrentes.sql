-- ═══════════════════════════════════════════════════════════════════════════
-- Concorrentes: preço de mercado com procedência.
-- ═══════════════════════════════════════════════════════════════════════════

-- A tela existia lendo fixture: mostrava "148 preços lidos hoje 06:12" para
-- uma coleta que nunca aconteceu. Preço de concorrente entra na decisão de
-- preço de venda — número inventado ali é pior que tela vazia, porque a
-- decisão errada parece fundamentada.
--
-- Três tabelas, e a divisão entre elas é a própria honestidade do módulo:
--   `concorrentes`         quem é a fonte e o que aconteceu na última leitura;
--   `concorrente_precos`   cada preço observado, com título original e quando;
--   `concorrente_apelidos` o que o operador ensinou sobre nomes que o
--                          casamento automático não resolveu.

create table concorrentes (
  id             text primary key,
  nome           text not null,
  /** Domínio sem esquema nem barra: `loja.com.br`. */
  dominio        text not null unique,
  ativo          boolean not null default true,
  /**
   * Como o preço entra:
   *   'nuvemshop' lê o sitemap da vitrine e o JSON-LD de cada produto — que é
   *               marcação de SEO padronizada, não seletor de tema;
   *   'shopify'   lê /products.json, endpoint público de catálogo;
   *   'manual'    só recebe preço digitado, e funciona em qualquer loja.
   */
  coleta         text not null default 'nuvemshop'
                 check (coleta in ('shopify', 'nuvemshop', 'manual')),
  ultima_leitura timestamptz,
  /** O que aconteceu na última tentativa. `nunca` enquanto não houve. */
  ultimo_status  text not null default 'nunca'
                 check (ultimo_status in ('nunca', 'lida', 'parcial', 'bloqueada', 'manual')),
  /** Mensagem crua do erro. É o que permite descobrir o motivo sem adivinhar. */
  ultimo_erro    text,
  precos_lidos   integer not null default 0,
  criado_em      timestamptz not null default now()
);

comment on table concorrentes is
  'Lojas monitoradas para comparação de preço, com o resultado da última leitura.';

create table concorrente_precos (
  concorrente_id text not null references concorrentes(id) on delete cascade,
  /**
   * Identidade do item NA LOJA DE ORIGEM (handle + variante). É o que torna a
   * releitura idempotente: o mesmo produto atualiza a linha em vez de criar
   * uma segunda observação do mesmo preço.
   */
  chave          text not null,
  /** Null enquanto o título não casou com nenhuma base nossa. */
  base_id        text references perfumes_base(id) on delete set null,
  variante       smallint,
  /** Título exatamente como veio da loja. Nunca normalizado aqui. */
  titulo         text not null,
  preco          numeric(10, 2) not null check (preco > 0),
  url            text,
  lido_em        timestamptz not null default now(),
  primary key (concorrente_id, chave)
);

create index concorrente_precos_base on concorrente_precos (base_id, variante);

comment on table concorrente_precos is
  'Preços observados nos concorrentes. `base_id` nulo = título ainda não casado com o catálogo.';

create table concorrente_apelidos (
  /** Título do concorrente sem acento, caixa ou espaço repetido. */
  titulo_normalizado text primary key,
  base_id            text not null references perfumes_base(id) on delete cascade,
  criado_em          timestamptz not null default now()
);

comment on table concorrente_apelidos is
  'Nomes de concorrente que o operador ligou à mão a uma base. Vale para as próximas leituras.';

/**
 * Menor preço de mercado por produto e variante.
 *
 * Só entra observação casada: preço sem base não sabe de qual perfume fala, e
 * entrar na comparação como se soubesse é o tipo de número que decide errado.
 */
create view mercado_por_variante as
select base_id,
       variante,
       min(preco)                     as menor,
       max(preco)                     as maior,
       round(avg(preco), 2)           as media,
       count(distinct concorrente_id) as concorrentes,
       max(lido_em)                   as lido_em
  from concorrente_precos
 where base_id is not null and variante is not null
 group by base_id, variante;

comment on view mercado_por_variante is
  'Faixa de preço do mercado por base e variante, considerando só observações casadas com o catálogo.';

alter table concorrentes          enable row level security;
alter table concorrente_precos    enable row level security;
alter table concorrente_apelidos  enable row level security;

create policy erp_leitura on concorrentes         for select to authenticated using (true);
create policy erp_leitura on concorrente_precos   for select to authenticated using (true);
create policy erp_leitura on concorrente_apelidos for select to authenticated using (true);
