-- CAIXA REAL — o extrato do gateway vira lançamento, e o saldo informado anda.
--
-- O gráfico de recebido líquido vivia no zero num mês com centenas de vendas.
-- A causa eram duas desconexões:
--
-- 1. O extrato do Mercado Pago movia o SALDO da conta, mas nenhuma linha
--    virava lançamento — e caixa, DRE por caixa e fluxo leem lançamento.
--    Se o dinheiro entrou pelo funil do intermediador, é venda da casa: o
--    crédito já chega LÍQUIDO de tarifa, então a conversão grava a receita
--    BRUTA do pedido mais a tarifa retida como custo. A soma das duas é
--    exatamente o líquido que caiu, e a DRE passa a mostrar quanto o
--    intermediador levou.
--
-- 2. O saldo das contas sem integração ficava CONGELADO no valor digitado:
--    o COALESCE escolhia o informado e ignorava os lançamentos posteriores.
--    O Inter exibia R$ 986,93 tendo 23 lançamentos registrados depois disso.
--
-- Crédito sem pedido casado entra no caixa mas fica SEM categoria: entre os
-- avulsos havia um de R$ 11.719,80 que não tem cara de venda de decant, e
-- classificá-lo no automático seria inventar receita.

-- Categorias que faltavam para nomear o que vem do gateway.
insert into categorias_financeiras (id, nome, natureza, natureza_gerencial, ativa)
values
  ('vendas', 'Vendas', 'Receita', 'receita_operacional', true),
  ('estornos-e-devolucoes', 'Estornos e devoluções', 'Despesa', 'deducao_receita', true)
on conflict (id) do nothing;

-- Transferência entre contas da casa não é receita nem despesa: existe como
-- categoria só para a linha ter nome na tela. Fica fora da DRE e do caixa
-- consolidado — quem neutraliza de verdade é o par transferencia_id.
insert into categorias_financeiras
  (id, nome, natureza, natureza_gerencial, ativa, impacta_dre, impacta_caixa, usar_em_automacao)
values
  ('transferencias', 'Transferências', 'Despesa', 'despesa_administrativa', true, false, false, false)
on conflict (id) do nothing;

-- A chave externa é o que impede a mesma linha de extrato virar dois
-- lançamentos quando a conversão roda de novo. Índice total, não parcial:
-- o Postgres já trata NULL como distinto, e o "on conflict" precisa de uma
-- âncora que ele consiga inferir sem repetir predicado em cada insert.
create unique index if not exists lancamentos_chave_externa_idx
  on lancamentos (chave_externa);

/**
 * Converte extrato em caixa. Idempotente: rodar de novo não duplica.
 *
 * Uma regra por tipo de movimento do gateway:
 * - "Venda recebida" com pedido casado: receita bruta + tarifa como custo.
 * - "Venda recebida" sem pedido: entra pelo líquido, sem categoria.
 * - "Estorno ao cliente" e "Compra paga pela conta": saída real, baixada.
 * - "Transferência para o banco": saída marcada como transferência.
 * - Linhas internas de reserva: pares que se anulam, não viram nada.
 */
create or replace function converter_extrato_em_caixa()
returns table (criados integer, total_convertidos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  select count(*) into v_antes from lancamentos where origem like 'Extrato %';

  -- 1. Receita das vendas com pedido conhecido: valor BRUTO do pedido.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
    chave_externa, criado_por
  )
  select
    'ext-' || e.chave,
    e.ocorrido_em,
    date_trunc('month', e.ocorrido_em)::date,
    'Venda ' || e.pedido_id || coalesce(' – ' || nullif(e.contraparte, ''), ''),
    'Vendas', 'vendas', e.conta_id,
    'entrada', p.valor, p.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id,
    e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida'
    and not e.ignorado
    and p.valor >= e.valor
  on conflict (chave_externa) do nothing;

  -- 2. A tarifa que o intermediador reteve: bruto do pedido menos o creditado.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
    chave_externa, criado_por
  )
  select
    'ext-taxa-' || e.chave,
    e.ocorrido_em,
    date_trunc('month', e.ocorrido_em)::date,
    'Tarifa do gateway – ' || e.pedido_id,
    'Taxas de pagamento', 'taxas-de-pagamento', e.conta_id,
    'saida', p.valor - e.valor, p.valor - e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id,
    'taxa-' || e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida'
    and not e.ignorado
    and p.valor > e.valor
  on conflict (chave_externa) do nothing;

  -- 3. Crédito sem pedido casado: entra no caixa pelo líquido, sem categoria.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por
  )
  select
    'ext-' || e.chave,
    e.ocorrido_em,
    date_trunc('month', e.ocorrido_em)::date,
    'Crédito a classificar' || coalesce(' – ' || nullif(e.contraparte, ''), ''),
    e.conta_id,
    'entrada', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao = 'Venda recebida'
    and not e.ignorado
    and (e.pedido_id is null
         or not exists (select 1 from pedidos p where p.id = e.pedido_id and p.valor >= e.valor))
  on conflict (chave_externa) do nothing;

  -- 4. Saídas reais do gateway: estorno ao cliente e compra paga pelo saldo.
  --    Compra fica sem categoria de propósito: o ERP não sabe o que foi.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
    chave_externa, criado_por
  )
  select
    'ext-' || e.chave,
    e.ocorrido_em,
    date_trunc('month', e.ocorrido_em)::date,
    e.descricao || coalesce(' – ' || nullif(e.contraparte, ''), ''),
    case when e.descricao = 'Estorno ao cliente' then 'Estornos e devoluções' end,
    case when e.descricao = 'Estorno ao cliente' then 'estornos-e-devolucoes' end,
    e.conta_id,
    'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id,
    e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao in ('Estorno ao cliente', 'Compra paga pela conta')
    and not e.ignorado
  on conflict (chave_externa) do nothing;

  -- 5. Transferência para o banco: movimento real da conta, neutro no
  --    consolidado. `transferencia_id` é o que garante a neutralização.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    chave_externa, criado_por
  )
  select
    'ext-' || e.chave,
    e.ocorrido_em,
    date_trunc('month', e.ocorrido_em)::date,
    'Transferência para conta bancária',
    'Transferências', 'transferencias', e.conta_id,
    'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, 'transf-' || e.chave,
    e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao = 'Transferência para o banco'
    and not e.ignorado
  on conflict (chave_externa) do nothing;

  -- Amarra a linha do extrato ao lançamento que ela gerou: é o que faz a fila
  -- "precisa de você" esvaziar e impede reprocessar a mesma linha.
  update extrato_linhas e
     set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave
     and e.lancamento_id is distinct from l.id;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$$;

-- Conta sem integração funciona assim: o dono informa o saldo uma vez e, a
-- partir dali, cada lançamento manual mexe nele. Lançamento anterior à foto
-- não conta de novo — já estava dentro do valor digitado.
create or replace view contas_saldo as
with base as (
  select
    c.*,
    coalesce(c.saldo_informado_em, '-infinity'::timestamptz) as marco
  from contas_bancarias c
), do_extrato as (
  select
    e.conta_id,
    coalesce(sum(e.valor) filter (where e.tipo = 'entrada'), 0) as entradas,
    coalesce(sum(e.valor) filter (where e.tipo = 'saida'), 0) as saidas,
    coalesce(sum(e.valor) filter (where e.tipo = 'entrada' and e.ocorrido_em >= date_trunc('month', current_date)), 0) as entradas_mes,
    coalesce(sum(e.valor) filter (where e.tipo = 'saida' and e.ocorrido_em >= date_trunc('month', current_date)), 0) as saidas_mes,
    count(*) as linhas
  from extrato_linhas e
  where not e.ignorado
  group by e.conta_id
), manuais as (
  -- Lançamentos vindos do extrato ficam de fora: o extrato já os contou.
  select
    l.conta_id,
    coalesce(sum(l.recebido) filter (where l.tipo = 'entrada'), 0) as entradas,
    coalesce(sum(l.recebido) filter (where l.tipo = 'saida'), 0) as saidas,
    coalesce(sum(l.recebido) filter (where l.tipo = 'entrada' and l.baixado_em >= date_trunc('month', current_date)::date), 0) as entradas_mes,
    coalesce(sum(l.recebido) filter (where l.tipo = 'saida' and l.baixado_em >= date_trunc('month', current_date)::date), 0) as saidas_mes
  from lancamentos l
  where l.origem not like 'Extrato %'
    and l.cancelado_em is null
  group by l.conta_id
), depois_da_foto as (
  select
    l.conta_id,
    coalesce(sum(l.recebido) filter (where l.tipo = 'entrada'), 0) as entradas,
    coalesce(sum(l.recebido) filter (where l.tipo = 'saida'), 0) as saidas
  from lancamentos l
  join base b on b.id = l.conta_id
  where l.origem not like 'Extrato %'
    and l.cancelado_em is null
    and l.baixado_em is not null
    and b.saldo_informado is not null
    and l.baixado_em > b.marco::date
  group by l.conta_id
)
select
  b.id,
  b.nome,
  b.tipo,
  b.banco,
  b.uso,
  b.principal,
  b.ativa,
  case
    when b.saldo_informado is not null
      then b.saldo_informado + coalesce(d.entradas, 0) - coalesce(d.saidas, 0)
    else coalesce(e.entradas, 0) + coalesce(m.entradas, 0)
       - coalesce(e.saidas, 0) - coalesce(m.saidas, 0)
  end as saldo,
  b.saldo_informado,
  b.saldo_a_liberar,
  b.saldo_informado_em,
  coalesce(e.entradas, 0) + coalesce(m.entradas, 0)
    - coalesce(e.saidas, 0) - coalesce(m.saidas, 0) as movimento_lido,
  coalesce(e.entradas_mes, 0) + coalesce(m.entradas_mes, 0) as entradas_mes,
  coalesce(e.saidas_mes, 0) + coalesce(m.saidas_mes, 0) as saidas_mes,
  coalesce(e.linhas, 0) as linhas_extrato
from base b
left join do_extrato e on e.conta_id = b.id
left join manuais m on m.conta_id = b.id
left join depois_da_foto d on d.conta_id = b.id;
