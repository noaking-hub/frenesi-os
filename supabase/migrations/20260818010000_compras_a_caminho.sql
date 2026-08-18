-- O que foi comprado e ainda não chegou.
--
-- Entre "comprei" e "chegou" existe um período que o ERP não enxergava: o
-- perfume aparecia do nada no dia em que a compra do lote era lançada, e até
-- lá a única memória era uma lista fora do sistema. Quem espera dez frascos e
-- recebe oito não tem onde registrar os dois que faltam.
--
-- ESTE MÓDULO NÃO DÁ ENTRADA NO ESTOQUE. É decisão do dono, e tem uma razão
-- que o desenho precisa respeitar: parte dos perfumes comprados AINDA NÃO
-- EXISTE — nem na Shopify, nem no catálogo do ERP. Eles precisam ser criados
-- lá primeiro, com imagem e descrição, e só então a compra do lote pode ser
-- registrada com o custo por ml. Marcar "recebido" aqui e criar estoque
-- automaticamente atropelaria esse passo e faria nascer produto sem cadastro.
--
-- Por isso as duas perguntas são INDEPENDENTES e cada uma tem sua coluna:
--
--   chegou?              -> recebido_em / quantidade_recebida
--   existe no catálogo?  -> base_id preenchido
--
-- Um item pode ter chegado sem existir no catálogo (o caso que motivou a
-- decisão), e pode existir no catálogo sem ter chegado (o caso comum). A tela
-- mostra os dois estados lado a lado, porque é a combinação deles que diz o
-- que falta fazer.

create table if not exists public.compras_a_caminho (
  id uuid primary key default gen_random_uuid(),
  fornecedor text not null,
  -- Nota, pedido do fornecedor, link do marketplace: o que identifica a compra
  -- do lado de lá. Livre porque cada fornecedor chama de um jeito.
  referencia text,
  comprada_em date not null,
  prevista_para date,
  /**
   * Rastreio é OPCIONAL, e não é descuido.
   *
   * Compra de fornecedor muitas vezes chega por transportadora própria, ou é
   * retirada em mãos, e nunca terá código. Exigir o campo obrigaria a inventar
   * um — e campo inventado é pior que campo vazio, porque a tela passa a
   * mostrar um rastreio que não rastreia nada.
   */
  rastreio text,
  transportadora text,
  valor_total numeric(12,2),
  frete numeric(12,2) not null default 0,
  observacao text,
  cancelada_em timestamptz,
  cancelada_motivo text,
  criada_em timestamptz not null default now(),
  criada_por text,
  atualizada_em timestamptz not null default now()
);

create table if not exists public.compras_a_caminho_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras_a_caminho(id) on delete cascade,
  /**
   * O perfume, quando ele já existe no catálogo.
   *
   * NULO é um estado legítimo e esperado: é o perfume que ainda vai ser criado
   * na Shopify. `descricao` sempre tem o nome escrito à mão, e é ela que a tela
   * mostra — o vínculo com a base é o que falta, não a identidade do item.
   */
  base_id text references public.perfumes_base(id) on delete set null,
  descricao text not null,
  /** Volume do frasco comprado, em ml. */
  volume_ml numeric(10,2),
  quantidade integer not null default 1 check (quantidade > 0),
  custo_unitario numeric(12,2),
  /**
   * Quanto chegou. Zero é "não chegou nada"; menor que `quantidade` é
   * recebimento PARCIAL, que é o caso que a lista de papel não sabia
   * representar — e o que sobra continua pendente, com o motivo à vista.
   */
  quantidade_recebida integer not null default 0 check (quantidade_recebida >= 0),
  recebido_em date,
  /** Faltou, quebrou, veio trocado: o que aconteceu com o que não chegou. */
  ocorrencia text,
  /**
   * O lote que este item virou, quando a compra de frasco for registrada.
   *
   * É a ponte com o estoque, e ela é atravessada À MÃO, de propósito: o
   * módulo aponta o que está pronto para virar lote, e a pessoa decide quando.
   */
  lote_id text references public.lotes(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists compras_a_caminho_itens_por_compra
  on public.compras_a_caminho_itens (compra_id);

create index if not exists compras_a_caminho_abertas
  on public.compras_a_caminho (comprada_em desc)
  where cancelada_em is null;

alter table public.compras_a_caminho enable row level security;
alter table public.compras_a_caminho_itens enable row level security;
revoke all on public.compras_a_caminho from anon, authenticated;
revoke all on public.compras_a_caminho_itens from anon, authenticated;

comment on table public.compras_a_caminho is
  'Perfumes comprados que ainda não chegaram. Não cria estoque: o cadastro do lote continua sendo passo próprio, porque perfume novo precisa existir na Shopify antes.';
comment on column public.compras_a_caminho_itens.base_id is
  'Nulo quando o perfume ainda não existe no catálogo — estado esperado, e o que a tela sinaliza como pendência de cadastro.';
comment on column public.compras_a_caminho_itens.quantidade_recebida is
  'Recebimento parcial é primeira classe: o que faltou continua pendente com o motivo.';
