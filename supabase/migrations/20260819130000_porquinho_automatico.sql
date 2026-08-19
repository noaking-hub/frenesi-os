-- O Porquinho automático: 10% de cada venda vai para a Reserva do Mercado
-- Pago sem ninguém clicar — e a partir de 19/08 essas linhas aparecem no
-- extrato como "Compra paga pela conta" SEM contraparte (compra de verdade
-- vem nomeada: "Compra de etiquetas", loja, checkout). O conversor aprende o
-- padrão: sem nome não é despesa, é o dinheiro indo para a própria Reserva —
-- transferência entre contas próprias, com a perna de entrada em
-- `reserva-mp`, fora da DRE e com o saldo do Porquinho andando sozinho.
create or replace function public.converter_extrato_em_caixa()
returns table(criados integer, total_convertidos integer)
language plpgsql
as $function$
declare
  v_antes integer;
  v_depois integer;
  v_destino text;
begin
  select count(*) into v_antes from lancamentos where origem like 'Extrato %';
  select id into v_destino from contas_bancarias where recebe_repasses limit 1;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Venda ' || e.pedido_id || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    'Vendas', 'vendas', e.conta_id, 'entrada', p.valor, p.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida' and not e.ignorado and p.valor >= e.valor
    and e.lancamento_id is null
    and not (p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id))
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-taxa-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Tarifa do gateway – ' || e.pedido_id, 'Taxas de pagamento', 'taxas-de-pagamento', e.conta_id,
    'saida', p.valor - e.valor, p.valor - e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, 'taxa-' || e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida' and not e.ignorado and p.valor > e.valor
    and (e.lancamento_id is null or e.lancamento_id = 'ext-' || e.chave)
    and not (p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id))
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Crédito a classificar'
      || coalesce(' – pedido ' || p.id || ' cancelado e estornado', '')
      || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    e.conta_id, 'entrada', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  left join pedidos p on p.id = e.pedido_id
       and p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id)
  where e.descricao = 'Venda recebida' and not e.ignorado
    and e.lancamento_id is null
    and (e.pedido_id is null
         or p.id is not null
         or not exists (select 1 from pedidos x where x.id = e.pedido_id and x.valor >= e.valor))
  on conflict (chave_externa) do nothing;

  -- O Porquinho: "Compra paga pela conta" sem contraparte é a reserva
  -- automática (10% das vendas) ou uma aplicação manual — nunca despesa.
  -- Vira transferência para `reserva-mp`; a perna de entrada nasce no
  -- espelho de transferências, mais abaixo.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    conta_destino_id, aguarda_destino, favorecido, observacao, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Transferência para a Reserva (Porquinho)', 'Transferências', 'transferencias', e.conta_id,
    'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, 'transf-' || e.chave, 'reserva-mp', false,
    'Reserva Mercado Pago',
    'Reserva automática do Mercado Pago (Porquinho): compra paga pela conta, sem contraparte.',
    e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao = 'Compra paga pela conta'
    and nullif(btrim(e.contraparte), '') is null
    and e.tipo = 'saida'
    and not e.ignorado
    and e.lancamento_id is null
    and exists (select 1 from contas_bancarias r where r.id = 'reserva-mp' and r.ativa)
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    e.descricao
      || case when e.descricao = 'Estorno ao cliente' and cancelado.id is not null
              then ' – pedido ' || cancelado.id || ' cancelado' else '' end
      || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    case when e.descricao = 'Estorno ao cliente' and cancelado.id is null
         then 'Estornos e devoluções' end,
    case when e.descricao = 'Estorno ao cliente' and cancelado.id is null
         then 'estornos-e-devolucoes' end,
    e.conta_id, 'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  left join pedidos cancelado on cancelado.id = e.pedido_id
       and cancelado.situacao = 'cancelado' and pedido_cancelado_de_verdade(cancelado.id)
  where e.descricao in ('Estorno ao cliente', 'Compra paga pela conta') and not e.ignorado
    and e.lancamento_id is null
    -- O Porquinho (sem contraparte) já saiu como transferência, acima.
    and not (e.descricao = 'Compra paga pela conta' and nullif(btrim(e.contraparte), '') is null)
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    conta_destino_id, aguarda_destino, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Transferência para conta bancária', 'Transferências', 'transferencias', e.conta_id,
    'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, 'transf-' || e.chave,
    v_destino, v_destino is null, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao = 'Transferência para o banco' and not e.ignorado
    and e.lancamento_id is null
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    conta_destino_id, chave_externa, criado_por)
  select s.id || ':destino', s.ocorrido_em, s.competencia,
    'Transferência recebida – ' || c.nome,
    'Transferências', 'transferencias', s.conta_destino_id,
    'entrada', s.valor, s.valor, s.baixado_em, false,
    s.origem, s.transferencia_id, s.conta_id, s.id || ':destino', 'conversão automática'
  from lancamentos s
  join contas_bancarias c on c.id = s.conta_id
  where s.tipo = 'saida'
    and s.transferencia_id is not null
    and s.conta_destino_id is not null
    and s.conta_destino_id <> s.conta_id
    and s.cancelado_em is null
    and s.origem like 'Extrato %'
    and not s.aguarda_destino
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    e.descricao || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    e.conta_id, e.tipo, e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where not e.ignorado
    and e.lancamento_id is null
    and e.descricao not in (
      'Venda recebida', 'Estorno ao cliente', 'Compra paga pela conta',
      'Transferência para o banco')
    and e.descricao not like 'Reserva%'
  on conflict (chave_externa) do nothing;

  update extrato_linhas e set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave and e.lancamento_id is null;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$function$;
