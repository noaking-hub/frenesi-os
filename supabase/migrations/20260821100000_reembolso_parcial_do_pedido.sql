-- ═══════════════════════════════════════════════════════════════════════════
-- Reembolso parcial: o dinheiro que voltou ao cliente sem o pedido morrer.
--
-- Caso real: pedido de R$ 254,00 pago por PIX, um item de R$ 62,00 devolvido.
-- O Mercado Pago estornou os R$ 62,00 pelo mesmo PIX, debitando a conta. No
-- ERP não havia onde registrar isso — nem o valor, nem o motivo, nem o
-- comprovante — e o débito ia cair no extrato como saída sem dono.
--
-- ── Por que não bastava marcar o pedido como estornado ─────────────────────
--
-- `marcar_estornados` vira o pedido inteiro para `divergente` assim que
-- aparece QUALQUER linha de estorno ligada a ele. Num estorno total isso é
-- certo. Num parcial é um erro de R$ 192,00: a venda de R$ 254,00 sai inteira
-- da receita quando só R$ 62,00 voltaram. A função passa a comparar o valor
-- estornado com o valor do pedido, e só derruba a venda quando o estorno
-- cobre o pedido todo (com meio centavo de folga, para arredondamento).
--
-- ── Por que o reembolso NÃO cria lançamento de caixa ───────────────────────
--
-- É a mesma regra da venda manual, e pela mesma razão: a conta do Mercado
-- Pago tem extrato lido, e nela o caixa nasce da linha do extrato, nunca de um
-- lançamento digitado. Criar um aqui faria os R$ 62,00 saírem duas vezes do
-- saldo — uma pelo lançamento, outra quando a linha do estorno chegasse.
--
-- O registro do reembolso é a INTENÇÃO declarada; o caixa é a linha do
-- extrato. `casar_reembolsos_com_extrato` costura as duas: acha a linha de
-- estorno de mesmo valor, aponta o pedido nela e a classifica como dedução de
-- receita. Aí o caixa cai uma vez só e a DRE enxerga a devolução.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists pedido_reembolsos (
  id            text primary key,
  pedido_id     text not null references pedidos(id) on delete cascade,
  valor         numeric(12,2) not null check (valor > 0),
  motivo        text not null,
  -- Qual item voltou, quando é sobre um item. Texto livre e não FK: o item
  -- pode ter sumido do catálogo, e a razão do reembolso não pode sumir junto.
  item          text,
  ocorrido_em   date not null,
  comprovante   text,
  -- O id do movimento no gateway, quando o operador tem em mãos. É a chave que
  -- casa com a linha do extrato SEM depender de palpite por valor e data.
  movimento_id  text,
  -- A linha do extrato que pagou este reembolso, depois de casada.
  extrato_chave text,
  criado_em     timestamptz not null default now(),
  criado_por    text
);

create index if not exists pedido_reembolsos_pedido on pedido_reembolsos (pedido_id);
create index if not exists pedido_reembolsos_sem_extrato on pedido_reembolsos (ocorrido_em)
  where extrato_chave is null;

comment on table pedido_reembolsos is
  'Dinheiro devolvido ao cliente sem cancelar o pedido. Não cria lançamento: em conta com extrato lido o caixa nasce da linha do extrato, e `casar_reembolsos_com_extrato` liga as duas pontas.';

-- ── O estorno parcial não mata a venda ─────────────────────────────────────
create or replace function marcar_estornados() returns integer
language plpgsql
set search_path = public
as $$
declare
  v_marcados integer;
begin
  with alvo as (
    update pedidos p
       set pagamento = 'divergente'
     where p.canal = 'yampi'
       and p.pagamento = 'pago'
       and (
         -- ESTORNO PELO EXTRATO. A soma é o que mudou: antes, `exists` bastava
         -- e um estorno de R$ 62,00 derrubava uma venda de R$ 254,00. Agora a
         -- venda só cai quando o que voltou cobre o que entrou.
         coalesce((
           select sum(e.valor) from extrato_linhas e
            where e.pedido_id = p.id
              and e.tipo = 'saida'
              and (e.descricao ilike '%estorno%'
                   or e.descricao ilike '%chargeback%'
                   or e.descricao ilike '%devolu%')
         ), 0) >= p.valor - 0.005
         or exists (
           -- A TRANSAÇÃO da Yampi não tem valor parcial: quando ela vira
           -- `refunded`, o pedido inteiro foi estornado lá. Segue como estava.
           select 1 from pedido_transacoes t
            where t.pedido_id = p.id
              and (t.status ilike '%refund%'
                   or t.status ilike '%estorn%'
                   or t.status ilike '%chargeback%'
                   or t.status ilike '%devolv%')
         )
       )
     returning p.id
  )
  select count(*) into v_marcados from alvo;
  return v_marcados;
end;
$$;

comment on function marcar_estornados() is
  'Tira da receita a venda que voltou INTEIRA para o cliente. Estorno parcial não derruba o pedido — ele é registrado em `pedido_reembolsos` e deduzido pela linha do extrato.';

-- ── Costurar o reembolso declarado com a linha do extrato ──────────────────
--
-- Duas chaves, nesta ordem: o id do movimento, quando informado, e depois
-- valor + janela de data. A igualdade exata vence o palpite — é a mesma
-- lição do crédito de R$ 306,00 que o palpite por valor e data grudou no
-- pedido errado.
--
-- A janela de sete dias existe porque o estorno cai no extrato no mesmo dia ou
-- no seguinte, e alargar isso convida a casar com o estorno de OUTRA venda de
-- mesmo valor. Reembolso que não casa fica esperando, visível, em vez de casar
-- errado em silêncio.
create or replace function casar_reembolsos_com_extrato() returns integer
language plpgsql
set search_path = public
as $$
declare
  v_r record;
  v_chave text;
  v_feitos integer := 0;
begin
  for v_r in
    select * from pedido_reembolsos where extrato_chave is null order by ocorrido_em
  loop
    v_chave := null;

    if v_r.movimento_id is not null and length(trim(v_r.movimento_id)) > 0 then
      select e.chave into v_chave
        from extrato_linhas e
       where e.tipo = 'saida'
         and e.pedido_id is null
         and e.chave like '%:' || trim(v_r.movimento_id) || ':%'
       limit 1;
    end if;

    if v_chave is null then
      select e.chave into v_chave
        from extrato_linhas e
       where e.tipo = 'saida'
         and e.pedido_id is null
         and abs(e.valor - v_r.valor) < 0.005
         and e.ocorrido_em between v_r.ocorrido_em - 1 and v_r.ocorrido_em + 7
         and (e.descricao ilike '%estorno%' or e.descricao ilike '%devolu%')
       order by e.ocorrido_em
       limit 1;
    end if;

    if v_chave is null then continue; end if;

    update extrato_linhas
       set pedido_id = v_r.pedido_id
     where chave = v_chave;

    update pedido_reembolsos set extrato_chave = v_chave where id = v_r.id;
    v_feitos := v_feitos + 1;
  end loop;

  return v_feitos;
end;
$$;

comment on function casar_reembolsos_com_extrato() is
  'Liga cada reembolso declarado à linha de estorno do extrato — pelo id do movimento quando existe, por valor e janela de data quando não. O que não casa fica esperando, visível, em vez de casar errado.';
