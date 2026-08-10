-- ═══════════════════════════════════════════════════════════════════════════
-- Movimento interno: conta no saldo, mas não é decisão de ninguém.
--
-- O extrato do Mercado Pago trouxe 207 linhas para a fila "precisam de você",
-- e boa parte delas não tem decisão alguma a tomar:
--
--   reserve_for_payout  + 25,00   dinheiro separado para sair
--   reserve_for_payout  − 25,00   a reserva sendo consumida
--   payout              − 25,00   o dinheiro saindo de fato
--
-- Isso é a conta se mexendo, não uma despesa a categorizar. Pedir categoria
-- para cada uma é fabricar trabalho — e uma fila cheia de trabalho inventado
-- é uma fila que ninguém olha, incluindo a despesa de verdade que está no
-- meio dela.
--
-- Dispensar (`ignorado`) seria errado: `contas_saldo` não soma o que foi
-- dispensado, e o saque sumiria do saldo. Foi exatamente esse o defeito que
-- mostrou R$ 83 mil numa conta com R$ 10 mil. Por isso um terceiro estado:
-- conta no saldo, fora da fila.
-- ═══════════════════════════════════════════════════════════════════════════

alter table extrato_linhas add column if not exists interno boolean not null default false;

comment on column extrato_linhas.interno is
  'Movimento da própria conta (saque, reserva, liberação): entra no saldo, não entra na fila de classificação nem no DRE.';

-- ── A importação passa a receber a marca ───────────────────────────────────

create or replace function importar_extrato(p_origem text, p_conta_id text, p_linhas jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_item      jsonb;
  v_novas     integer := 0;
  v_repetidas integer := 0;
  v_valor     numeric;
  v_tipo      text;
begin
  if not exists (select 1 from contas_bancarias where id = p_conta_id) then
    raise exception 'a conta % não está cadastrada', p_conta_id;
  end if;
  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'as linhas do extrato precisam vir em uma lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_linhas) loop
    v_valor := (v_item ->> 'valor')::numeric;
    v_tipo  := v_item ->> 'tipo';

    if v_valor is null or v_valor = 0 then
      continue;
    end if;
    if v_tipo is null then
      v_tipo := case when v_valor < 0 then 'saida' else 'entrada' end;
    end if;
    v_valor := abs(v_valor);

    insert into extrato_linhas (
      origem, chave, conta_id, ocorrido_em, descricao, contraparte, documento,
      tipo, valor, pedido_id, bruto, interno
    ) values (
      p_origem,
      v_item ->> 'chave',
      p_conta_id,
      (v_item ->> 'ocorrido_em')::date,
      coalesce(nullif(trim(v_item ->> 'descricao'), ''), 'Sem descrição'),
      coalesce(v_item ->> 'contraparte', ''),
      coalesce(v_item ->> 'documento', ''),
      v_tipo,
      v_valor,
      (select p.id from pedidos p where p.id = v_item ->> 'pedido_id'),
      v_item -> 'bruto',
      coalesce((v_item ->> 'interno')::boolean, false)
    )
    on conflict (origem, chave) do nothing;

    if found then
      v_novas := v_novas + 1;
    else
      v_repetidas := v_repetidas + 1;
    end if;
  end loop;

  return jsonb_build_object('novas', v_novas, 'repetidas', v_repetidas);
end;
$$;

-- ── A fila e a conferência ignoram o movimento interno ─────────────────────

create or replace view extrato_a_decidir as
select
  e.origem, e.chave, e.conta_id, e.ocorrido_em, e.descricao, e.contraparte,
  e.documento, e.tipo, e.valor, e.pedido_id, e.lancamento_id, e.ignorado,
  e.motivo_ignorado, e.bruto, e.lido_em,
  c.nome as conta_nome,
  case when e.tipo = 'saida' then 'Classificar a despesa'
       else 'Entrada sem pedido correspondente' end as motivo,
  -- Coluna nova vai no fim: `create or replace view` não aceita renomear
  -- coluna existente, e inserir no meio é exatamente isso para o Postgres.
  e.interno
from extrato_linhas e
join contas_bancarias c on c.id = e.conta_id
where e.lancamento_id is null
  and not e.ignorado
  and not e.interno
  and (e.tipo = 'saida' or e.pedido_id is null)
order by e.ocorrido_em desc, e.valor desc;

create or replace view contas_conferencia as
select
  c.id, c.nome, c.banco, c.saldo, c.saldo_informado, c.movimento_lido,
  coalesce(sum(e.valor) filter (where e.tipo = 'entrada' and not e.ignorado), 0)
    - coalesce(sum(e.valor) filter (where e.tipo = 'saida' and not e.ignorado), 0)
    as saldo_extrato,
  count(e.*) filter (
    where e.lancamento_id is null and not e.ignorado and not e.interno
      and (e.tipo = 'saida' or e.pedido_id is null)
  ) as a_classificar,
  count(e.*) as linhas_lidas,
  max(e.ocorrido_em) as ultima_leitura
from contas_saldo c
left join extrato_linhas e on e.conta_id = c.id
group by c.id, c.nome, c.banco, c.saldo, c.saldo_informado, c.movimento_lido;

-- ── Recomeçar a leitura das liberações ─────────────────────────────────────
--
-- A chave da linha deixou de ser posicional e passou a descrever o conteúdo
-- (dia, operação, movimento, valor). As linhas já gravadas têm a chave antiga:
-- a próxima importação não as reconheceria e gravaria tudo de novo, dobrando o
-- saldo. Apagar o que veio das liberações e deixar a próxima atualização
-- reconstruir é o caminho seguro — e barato, porque nada disso foi
-- classificado ainda.
--
-- O que foi classificado à mão fica; pedidos e repasses não são tocados.

delete from extrato_linhas
 where origem = 'mercadopago'
   and lancamento_id is null
   and bruto ->> 'origem_relatorio' = 'liberacoes';

delete from relatorios_importados where arquivo is not null;
