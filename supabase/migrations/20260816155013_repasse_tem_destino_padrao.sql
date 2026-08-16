-- O saque do gateway deixa de ser pergunta e vira regra.
--
-- A fila de destino resolveu o problema de o ERP adivinhar, mas trocou por
-- outro: 64 perguntas iguais, todas com a mesma resposta. Perguntar 64 vezes o
-- que muda em 2 é o mesmo desperdício de atenção, invertido.
--
-- A regra agora mora num DADO, não no código: a conta que recebe os saques é
-- marcada em `contas_bancarias`. Trocar de banco vira um clique, e não um
-- deploy — que é a diferença entre uma automação e uma amarração.
alter table public.contas_bancarias
  add column if not exists recebe_repasses boolean not null default false;

comment on column public.contas_bancarias.recebe_repasses is
  'Conta para onde o saque do gateway vai por padrão. Uma só; sem nenhuma, o payout volta a esperar decisão.';

-- Uma conta, não duas. Dois destinos padrão seria a mesma indecisão de antes,
-- só que escondida numa tabela em vez de numa fila.
create unique index if not exists contas_bancarias_um_destino_de_repasse
  on public.contas_bancarias (recebe_repasses) where recebe_repasses;

update public.contas_bancarias set recebe_repasses = true where id = 'inter';

/**
 * A conversão do extrato passa a gravar as DUAS pernas do saque.
 *
 * Só o bloco do payout muda; os outros quatro seguem idênticos. Com destino
 * padrão marcado, o saque nasce completo — sai do gateway e entra no banco — e
 * a transferência é neutra no caixa desde o primeiro minuto, que é o que ela
 * de fato é.
 *
 * Sem destino padrão marcado, o comportamento antigo volta inteiro: perna
 * única e `aguarda_destino`. É o que impede a automação de virar invenção no
 * dia em que alguém desmarcar a conta.
 */
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

  -- Perna de SAÍDA do saque. `aguarda_destino` só nasce true quando não há
  -- conta marcada para receber — é a única situação em que o ERP realmente
  -- não sabe.
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

  -- Perna de ENTRADA, na conta que recebe. Sem ela o dinheiro sai do
  -- consolidado e não chega em lugar nenhum, que foi o defeito original.
  if v_destino is not null then
    insert into lancamentos (
      id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
      tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
      conta_destino_id, chave_externa, criado_por)
    select 'ext-' || e.chave || ':destino', e.ocorrido_em,
      date_trunc('month', e.ocorrido_em)::date,
      'Transferência recebida – ' || c.nome,
      'Transferências', 'transferencias', v_destino,
      'entrada', e.valor, e.valor, e.ocorrido_em, false,
      'Extrato ' || c.nome, 'transf-' || e.chave,
      e.conta_id, e.chave || ':destino', 'conversão automática'
    from extrato_linhas e
    join contas_bancarias c on c.id = e.conta_id
    where e.descricao = 'Transferência para o banco' and not e.ignorado
      and e.conta_id <> v_destino
    on conflict (chave_externa) do nothing;
  end if;

  update extrato_linhas e set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave and e.lancamento_id is distinct from l.id;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$function$;
