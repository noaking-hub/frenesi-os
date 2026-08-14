-- Fase 1 do módulo de Estoque: a reserva muda de lugar.
--
-- Até aqui "reserva" era UNIDADE de decant pronta, gravada em
-- produtos_derivados.reservadas e recalculada por agregado (base+variante).
-- Como a Frenesi envasa sob demanda — zero ordens de produção concluídas em
-- toda a história do ERP —, `envasadas` é sempre 0 e a tela fazia
-- `envasadas − reservadas` = −105 unidades "prontas para venda". Um KPI
-- físico negativo é impossível: o que existe é DEMANDA acima do estoque.
--
-- A reserva passa a ser o que ela é: MILILITROS comprometidos no perfume
-- base, por pedido, criados quando o pedido é pago e desfeitos quando ele é
-- cancelado ou consumidos quando a produção sai. Ela reduz o DISPONÍVEL sem
-- tocar no FÍSICO — que só muda por movimentação real.

-- ── 1. A reserva, por pedido ───────────────────────────────────────────────
--
-- A chave é (pedido, base): o mesmo webhook chegando duas vezes não cria duas
-- reservas, e é assim que a idempotência exigida pelo escopo se sustenta no
-- banco em vez de depender de o chamador lembrar.
create table if not exists reservas_estoque (
  pedido_id text not null references pedidos (id) on delete cascade,
  base_id text not null references perfumes_base (id) on delete cascade,
  ml numeric(12,2) not null check (ml > 0),
  criada_em timestamptz not null default now(),
  liberada_em timestamptz,
  -- Por que deixou de valer: 'cancelado', 'consumida', 'despachado'…
  motivo text,
  primary key (pedido_id, base_id)
);

create index if not exists reservas_ativas_idx
  on reservas_estoque (base_id) where liberada_em is null;

alter table reservas_estoque enable row level security;

-- ── 2. O saldo consolidado, no perfume base ────────────────────────────────
alter table perfumes_base
  add column if not exists reservado_ml numeric(12,2) not null default 0
    check (reservado_ml >= 0);

-- Disponível é derivado, nunca digitado — e nunca negativo. Reserva acima do
-- físico é uma PENDÊNCIA a mostrar na tela (demanda sem lastro), não um
-- número negativo a exibir como se fosse estoque.
alter table perfumes_base
  drop column if exists disponivel_ml;
alter table perfumes_base
  add column disponivel_ml numeric(12,2)
    generated always as (greatest(volume_ml - reservado_ml, 0)) stored;

-- ── 3. O ledger ganha o antes, o depois e a reserva ────────────────────────
alter table movimentacoes
  add column if not exists saldo_anterior_ml numeric(12,2),
  -- Positivo reserva, negativo libera. Fica separado de volume_ml de
  -- propósito: reserva não move líquido nenhum, e somar as duas colunas na
  -- mesma casa faria o saldo físico mentir.
  add column if not exists reserva_ml numeric(12,2),
  add column if not exists saldo_reservado_ml numeric(12,2),
  add column if not exists pedido_id text;

alter table movimentacoes drop constraint if exists movimentacoes_tipo_check;
alter table movimentacoes add constraint movimentacoes_tipo_check
  check (tipo in ('entrada','saida','ajuste','devolucao','reserva','liberacao','perda','estorno'));

-- O "saldo antes" sai de graça do que já existe: saldo depois − o que a linha
-- moveu. Uma função só, aplicada por gatilho, evita reescrever as dez funções
-- que gravam movimentação — e vale para as que vierem depois.
create or replace function preencher_saldos_da_movimentacao()
returns trigger
language plpgsql
as $$
begin
  if new.saldo_anterior_ml is null and new.saldo_ml is not null then
    new.saldo_anterior_ml := new.saldo_ml - coalesce(new.volume_ml, 0);
  end if;
  if new.saldo_reservado_ml is null then
    select reservado_ml into new.saldo_reservado_ml
      from perfumes_base where id = new.base_id;
  end if;
  return new;
end;
$$;

drop trigger if exists movimentacoes_saldos on movimentacoes;
create trigger movimentacoes_saldos
  before insert on movimentacoes
  for each row execute function preencher_saldos_da_movimentacao();

-- O histórico que já existe também ganha o antes.
update movimentacoes
   set saldo_anterior_ml = saldo_ml - coalesce(volume_ml, 0)
 where saldo_ml is not null and saldo_anterior_ml is null;

-- ── 4. Movimentação concluída não se apaga nem se edita ────────────────────
--
-- Correção é estorno + nova linha, preservando o histórico. Sem esta trava a
-- auditoria vira promessa: qualquer update silencioso reescreveria o passado.
create or replace function movimentacao_e_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Movimentação % não pode ser % — corrija com estorno e nova movimentação.',
    coalesce(old.id::text, '?'), case when tg_op = 'DELETE' then 'apagada' else 'editada' end;
end;
$$;

drop trigger if exists movimentacoes_imutaveis on movimentacoes;
create trigger movimentacoes_imutaveis
  before update or delete on movimentacoes
  for each row execute function movimentacao_e_imutavel();
