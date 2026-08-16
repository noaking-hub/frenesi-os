-- O cronograma de recebimento das vendas em Pix parcelado.
--
-- Uma venda pela Pagaleve não é caixa do dia da venda: é caixa espalhado por
-- até 45 dias, em parcelas de quinze em quinze dias. Sem estas linhas, a
-- projeção de fluxo trata a venda como dinheiro imediato — e é esse otimismo
-- que faz um caixa parecer confortável na véspera de não ser.
--
-- Tudo aqui é PREVISÃO. `liquidada_em` só é preenchido quando o dinheiro
-- aparece de verdade no extrato, e é essa coluna que separa o previsto do
-- realizado. Nada nesta tabela entra no saldo por conta própria.

create table if not exists public.pagaleve_parcelas (
  checkout_id   text        not null,
  numero        smallint    not null check (numero between 1 and 4),
  de            smallint    not null check (de between 1 and 4),
  pedido_id     text        references public.pedidos(id) on delete set null,
  bruto         numeric(12,2) not null,
  tarifa        numeric(12,2) not null default 0,
  liquido       numeric(12,2) not null,
  prevista_para date        not null,
  liquidada_em  date,
  atualizada_em timestamptz not null default now(),
  primary key (checkout_id, numero),
  constraint parcela_dentro_do_total check (numero <= de)
);

create index if not exists pagaleve_parcelas_previstas_idx
  on public.pagaleve_parcelas (prevista_para)
  where liquidada_em is null;

create index if not exists pagaleve_parcelas_pedido_idx
  on public.pagaleve_parcelas (pedido_id);

alter table public.pagaleve_parcelas enable row level security;

comment on table public.pagaleve_parcelas is
  'Cronograma previsto de repasse do Pix parcelado da Pagaleve. Previsão, não caixa: quem realiza é o extrato.';

-- Quanto a Pagaleve deve, e quando cada pedaço chega.
create or replace view public.pagaleve_a_receber as
select
  prevista_para,
  count(*)                                   as parcelas,
  count(distinct checkout_id)                as vendas,
  round(sum(liquido), 2)                     as liquido,
  (prevista_para < current_date)             as ja_venceu
from public.pagaleve_parcelas
where liquidada_em is null
group by prevista_para
order by prevista_para;
