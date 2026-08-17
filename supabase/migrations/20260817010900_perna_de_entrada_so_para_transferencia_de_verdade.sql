-- Dois defeitos meus, na mesma função, corrigidos juntos.
--
-- 1. A CONVERSÃO ABORTAVA INTEIRA desde 16/08 15:50.
--
-- Na migration 20260816155013 eu gravei a perna de entrada do saque com
--
--   id            = 'ext-' || e.chave || ':destino'
--   chave_externa =          e.chave || ':destino'   ← sem o prefixo
--
-- enquanto `resolver_destino_do_payout`, que criou as 62 pernas existentes,
-- grava as DUAS com o prefixo. Como o `on conflict` arbitra por
-- `chave_externa`, ele não via conflito — e a colisão estourava na PRIMARY
-- KEY. A exceção derruba a função inteira, e o Postgres desfaz os cinco
-- INSERTs anteriores: venda, tarifa, crédito a classificar, estorno e perna
-- de saída. Nenhuma venda nova do Mercado Pago virou lançamento por nove
-- horas, e as duas chamadas da sincronização engolem o erro num `catch` —
-- então isso não apareceu em tela nenhuma.
--
-- Regra que fica: quando a tabela tem PRIMARY KEY e chave única, as duas
-- colunas precisam ser geradas pela MESMA expressão, e o `on conflict` tem de
-- arbitrar pela que a linha nova realmente pode repetir.
--
-- 2. A PERNA DE ENTRADA NASCIA DA LINHA DO EXTRATO, e não da saída.
--
-- Toda linha descrita como "Transferência para o banco" ganhava uma entrada
-- no Inter. Só que o destino pode ter sido corrigido depois: os R$ 1.205,49
-- de Meta ADS de 16/08 viraram despesa, e `resolver_destino_do_payout` limpou
-- o `transferencia_id`. A linha do extrato continua dizendo "transferência",
-- porque é o que o Mercado Pago escreveu — só o LANÇAMENTO sabe o que foi
-- decidido sobre ela.
--
-- Sem essa amarração a conversão recriava a entrada a cada rodada: R$ 2.405,49
-- de dinheiro que nunca chegou ao Inter, inventados em um minuto.
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
    and (e.pedido_id is null
         or p.id is not null
         or not exists (select 1 from pedidos x where x.id = e.pedido_id and x.valor >= e.valor))
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    e.descricao || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    case when e.descricao = 'Estorno ao cliente' then 'Estornos e devoluções' end,
    case when e.descricao = 'Estorno ao cliente' then 'estornos-e-devolucoes' end,
    e.conta_id, 'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao in ('Estorno ao cliente', 'Compra paga pela conta') and not e.ignorado
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

  update extrato_linhas e set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave and e.lancamento_id is distinct from l.id;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$function$;

-- Apaga as duas pernas fantasma: R$ 1.205,49 (Meta ADS de 16/08, que é
-- despesa) e R$ 1.200,00 (o payout de 11/08 que segue em dúvida). Nenhum dos
-- dois dinheiros chegou ao Inter.
delete from lancamentos
 where id in (
   'ext-2026-08-16:173187955221:payout:-120549:1:destino',
   'ext-2026-08-11:172403512649:payout:-120000:1:destino'
 );
