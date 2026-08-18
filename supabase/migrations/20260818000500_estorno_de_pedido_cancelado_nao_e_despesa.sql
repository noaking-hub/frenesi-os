-- Pedido cancelado: a DRE carregava o estorno sem a venda.
--
-- A regra da casa já está decidida e documentada em 20260815: pedido
-- CANCELADO não gera receita, mesmo com crédito no extrato. O dinheiro entra
-- como "Crédito a classificar", o saldo continua verdadeiro, e alguém decide
-- o que aquilo é. Está certo — inflar faturamento com venda que a tela de
-- Pedidos jura que não aconteceu foi justamente o defeito que aquela migração
-- consertou.
--
-- Só que a metade de VOLTA ficou de fora do raciocínio. O "Estorno ao cliente"
-- da mesma operação continuou entrando como despesa de "Estornos e
-- devoluções". O resultado é uma DRE que registra a devolução de uma venda que
-- ela própria nunca registrou: R$ 935,55 de despesa sem contrapartida nenhuma,
-- em dois pedidos.
--
--   YP-1510190500460251  R$ 885,80  (29/07)
--   YP-1510190605467642  R$  49,75  (14/08)
--
-- Estorno de venda ENTREGUE é outra coisa, e continua sendo despesa: a venda
-- aconteceu, o produto saiu, o dinheiro voltou. Os três casos assim na base
-- (R$ 79,60) não são tocados. O que muda é só o estorno cujo pedido foi
-- cancelado — dinheiro que entrou e saiu sem que nada tenha acontecido.
--
-- As duas pernas ficam fora da DRE e dentro do caixa, que é onde elas são
-- verdade.
create or replace function public.converter_extrato_em_caixa()
returns table(criados integer, total_convertidos integer)
language plpgsql
security definer
set search_path to 'public'
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

  -- Estorno e compra paga pela conta. A categoria de estorno passa a depender
  -- do PEDIDO: cancelado, a devolução não é despesa, porque a venda também
  -- não foi receita. Sem esta condição a DRE registra a devolução de algo que
  -- ela nunca registrou ter vendido.
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

  -- A perna de entrada deriva da SAÍDA já gravada, e só existe enquanto
  -- aquela saída continuar sendo uma transferência para a conta de destino.
  -- Payout reclassificado como despesa perde `transferencia_id`, sai deste
  -- SELECT, e nenhuma entrada é inventada para ele.
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

  -- NENHUMA linha do extrato fica fora do caixa.
  --
  -- Os INSERTs acima cobrem as descrições CONHECIDAS. O que a Mercado Pago
  -- mandar com outro rótulo caía num vão silencioso: virava saldo no extrato e
  -- nada no caixa. Aconteceu uma vez, com uma entrada de R$ 186,97 de 22/07
  -- chamada "Movimento sem descrição", sem documento e sem contraparte — a
  -- única de 344 linhas que nunca virou lançamento, e a causa exata da
  -- diferença entre o saldo pelo extrato e o saldo pelos lançamentos.
  --
  -- Uma linha que o conversor não entende continua sendo dinheiro que se
  -- moveu. Ela entra sem categoria, com o rótulo que veio, e aparece na fila
  -- de classificação — que é o lugar certo para o que ninguém sabe o que é.
  -- Silêncio, aqui, é a única resposta que não serve.
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
    -- Reserva é mecânica interna do gateway e vem em par que se anula: 94
    -- pares conferidos, desequilíbrio zero. Virar caixa duplicaria movimento.
    and e.descricao not like 'Reserva%'
  on conflict (chave_externa) do nothing;

  -- Só carimba linha que ainda não tem dono. Repontar uma linha já
  -- classificada para o lançamento do conversor foi o que transformaria a
  -- duplicidade em lançamento órfão — o da regra some da tela e continua
  -- pesando no caixa.
  update extrato_linhas e set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave and e.lancamento_id is null;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$function$;

-- Reparo do que já está gravado: os dois estornos de pedido cancelado saem da
-- DRE e passam a dizer por quê.
update lancamentos l
   set categoria = null,
       categoria_id = null,
       descricao = 'Estorno ao cliente – pedido ' || p.id || ' cancelado',
       atualizado_em = now()
  from pedidos p
 where p.id = l.pedido_id
   and l.categoria_id = 'estornos-e-devolucoes'
   and l.cancelado_em is null
   and p.situacao::text = 'cancelado';
