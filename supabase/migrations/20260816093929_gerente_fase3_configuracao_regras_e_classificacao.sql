-- ── Configuração administrativa do Gerente (§13 e §15) ────────────────────
--
-- O modo de escrita sai da variável de ambiente e vem para o banco. A variável
-- continua existindo, mas como INTERRUPTOR DE EMERGÊNCIA — `GERENTE_ESCRITA =
-- 'desligada'` força leitura mesmo que a configuração diga o contrário. O que
-- muda é quem decide no dia a dia: ligar autonomia passa a ser uma decisão de
-- operação, feita na tela, e não um deploy.
--
-- Linha única e forçada a ser única: duas configurações significariam duas
-- políticas simultâneas, e a pergunta "a IA pode gravar?" precisa ter uma
-- resposta só.
create table if not exists public.gerente_configuracao (
  id boolean primary key default true check (id),
  escrita_liberada boolean not null default false,
  modo_autonomia text not null default 'sugestao'
    check (modo_autonomia in ('sugestao', 'assistido', 'regra_aprovada')),
  limiar_confianca numeric(4,3) not null default 0.950
    check (limiar_confianca > 0 and limiar_confianca <= 1),
  -- Teto de valor para o que a automação pode classificar sozinha. Acima disso
  -- vai para revisão mesmo com confiança máxima: erro em movimento grande custa
  -- mais para descobrir e mais para desfazer.
  teto_valor_automatico numeric(12,2) not null default 500.00,
  atualizada_em timestamptz not null default now(),
  atualizada_por text
);

insert into public.gerente_configuracao (id) values (true) on conflict (id) do nothing;

alter table public.gerente_configuracao enable row level security;

comment on table public.gerente_configuracao is
  'Política de escrita e autonomia do Gerente. Uma linha só; GERENTE_ESCRITA=desligada é o kill switch acima disto.';

-- ── Regras de classificação com governança (§4.11) ────────────────────────
--
-- A tabela existia com padrão e categoria em texto. Faltava tudo que
-- transforma "um jeito de adivinhar" em regra de negócio: quem aprovou,
-- prioridade para desempatar, escopo por tipo, e a possibilidade de pausar sem
-- apagar — porque apagar perde a informação de que a regra já existiu.
alter table public.regras_categoria
  add column if not exists categoria_id text references public.categorias_financeiras(id),
  add column if not exists ativa boolean not null default true,
  add column if not exists prioridade smallint not null default 0,
  add column if not exists tipo text check (tipo in ('entrada', 'saida')),
  add column if not exists criada_por text,
  add column if not exists trace_id uuid,
  add column if not exists observacao text,
  add column if not exists atualizada_em timestamptz not null default now();

-- Casa as regras antigas com a categoria pelo nome, uma vez. Regra sem
-- `categoria_id` fica de fora da automação em vez de classificar para um id
-- inventado.
update public.regras_categoria r
   set categoria_id = c.id
  from public.categorias_financeiras c
 where r.categoria_id is null and lower(c.nome) = lower(r.categoria);

create index if not exists regras_categoria_ativas
  on public.regras_categoria (ativa, prioridade desc);

-- ── Mutações: lote e reversão ─────────────────────────────────────────────
alter table public.gerente_mutacoes
  add column if not exists batch_id uuid,
  -- Quando esta linha foi desfeita, e por qual mutação. O histórico NUNCA é
  -- apagado: reverter cria linha nova e marca a antiga.
  add column if not exists revertida_em timestamptz,
  add column if not exists revertida_por bigint references public.gerente_mutacoes(id);

create index if not exists gerente_mutacoes_batch on public.gerente_mutacoes (batch_id);

/**
 * Classifica lançamentos em nome do Gerente — a ÚNICA porta de escrita.
 *
 * Ela é uma função, e não um update solto da aplicação, porque três coisas
 * precisam acontecer na MESMA transação ou nenhuma: capturar o valor anterior,
 * gravar o novo e registrar a mutação. Se a auditoria ficasse a cargo de uma
 * segunda chamada, existiria a janela em que o dado mudou e o registro não —
 * e é justamente essa janela que uma auditoria financeira não pode ter.
 *
 * A idempotência mora no `unique (idempotency_key)` da tabela de mutações. Um
 * retry de rede não cria a segunda classificação: ele colide, o insert é
 * ignorado, e o lançamento correspondente não é tocado de novo.
 */
create or replace function public.classificar_lancamentos_do_gerente(
  p_ids text[],
  p_categoria_id text,
  p_ator jsonb,
  p_canal text,
  p_trace_id uuid,
  p_conversa_id uuid,
  p_confirmacao text,
  p_chave_base text,
  p_regra text default null,
  p_confianca numeric default null
)
returns table (aplicados integer, ignorados integer, batch_id uuid, categoria text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_batch uuid := gen_random_uuid();
  v_categoria text;
  v_aplicados int := 0;
  v_ignorados int := 0;
  v_id text;
  v_anterior jsonb;
  v_mutacao bigint;
begin
  select nome into v_categoria from categorias_financeiras where id = p_categoria_id and ativa;
  if v_categoria is null then
    raise exception 'Categoria % não existe ou está inativa.', p_categoria_id;
  end if;

  foreach v_id in array p_ids loop
    -- O estado ANTES, capturado dentro da transação: revalidar aqui é o que
    -- impede aprovar uma prévia e gravar sobre um dado que mudou no meio.
    select jsonb_build_object(
             'categoria_id', l.categoria_id,
             'categoria', l.categoria,
             'centro_custo', l.centro_custo
           )
      into v_anterior
      from lancamentos l
     where l.id = v_id and l.cancelado_em is null;

    if v_anterior is null then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    -- Transferência interna não é classificável, e a trava fica no BANCO além
    -- do domínio: uma chamada direta à função não pode furar a regra que a
    -- interface respeita.
    if exists (select 1 from lancamentos where id = v_id and transferencia_id is not null) then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    begin
      insert into gerente_mutacoes (
        trace_id, conversa_id, ator, canal, ferramenta, versao_da_ferramenta, risco,
        registro_afetado, valor_anterior, valor_novo, confirmacao, regra_usada, confianca,
        idempotency_key, resultado, reversivel, undo_id, batch_id
      ) values (
        p_trace_id, p_conversa_id, p_ator, p_canal, 'classificar_lancamento', '1.0.0', 'B',
        v_id, v_anterior,
        jsonb_build_object('categoria_id', p_categoria_id, 'categoria', v_categoria),
        p_confirmacao, p_regra, p_confianca,
        p_chave_base || ':' || v_id, 'sucesso', true, v_batch::text, v_batch
      ) returning id into v_mutacao;
    exception when unique_violation then
      -- Já classificado por esta mesma decisão. Devolver o resultado original
      -- em vez de gravar de novo é o comportamento que o §10 pede.
      v_ignorados := v_ignorados + 1;
      continue;
    end;

    update lancamentos
       set categoria_id = p_categoria_id,
           categoria = v_categoria,
           atualizado_em = now()
     where id = v_id;

    v_aplicados := v_aplicados + 1;
  end loop;

  return query select v_aplicados, v_ignorados, v_batch, v_categoria;
end;
$function$;

/**
 * Desfaz um lote de classificação.
 *
 * Rollback gera linha NOVA de auditoria e marca a original como revertida. Não
 * apaga nada: o histórico de que a classificação existiu é parte do registro, e
 * um financeiro que apaga o próprio erro perde a capacidade de explicar o mês.
 */
create or replace function public.desfazer_classificacao_do_gerente(
  p_batch_id uuid,
  p_ator jsonb,
  p_canal text,
  p_trace_id uuid
)
returns table (revertidos integer)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_n int := 0;
  m record;
  v_nova bigint;
begin
  for m in
    select * from gerente_mutacoes
     where batch_id = p_batch_id and revertida_em is null and resultado = 'sucesso'
  loop
    update lancamentos
       set categoria_id = nullif(m.valor_anterior->>'categoria_id', ''),
           categoria = nullif(m.valor_anterior->>'categoria', ''),
           atualizado_em = now()
     where id = m.registro_afetado;

    insert into gerente_mutacoes (
      trace_id, conversa_id, ator, canal, ferramenta, versao_da_ferramenta, risco,
      registro_afetado, valor_anterior, valor_novo, confirmacao,
      idempotency_key, resultado, reversivel, batch_id
    ) values (
      p_trace_id, m.conversa_id, p_ator, p_canal, 'desfazer_classificacao', '1.0.0', 'A',
      m.registro_afetado, m.valor_novo, m.valor_anterior, 'explicita',
      'undo:' || m.id::text, 'sucesso', false, p_batch_id
    ) returning id into v_nova;

    update gerente_mutacoes
       set revertida_em = now(), revertida_por = v_nova
     where id = m.id;

    v_n := v_n + 1;
  end loop;

  return query select v_n;
end;
$function$;
