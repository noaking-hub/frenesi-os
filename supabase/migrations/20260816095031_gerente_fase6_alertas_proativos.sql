-- Alertas proativos — §4.6 e Fase 6.
--
-- O motor de prioridades já existia, mas só rodava quando alguém abria a tela.
-- Um gerente que só avisa quando você pergunta não é gerente; é consulta.
--
-- A tabela existe por causa de UMA coisa que a fila calculada na hora não sabe
-- fazer: lembrar. Sem estado, o sistema não distingue "problema novo" de
-- "problema que você já viu ontem e decidiu conviver" — e um alerta que repete
-- todo dia é um alerta que se aprende a ignorar.
create table if not exists public.gerente_alertas (
  id bigserial primary key,
  -- A identidade do PROBLEMA, não da ocorrência: "caixa negativa em 12/09" é a
  -- mesma coisa hoje e amanhã. É por esta chave que a deduplicação acontece.
  chave text not null,
  severidade text not null check (severidade in ('critico', 'alto', 'medio', 'informativo')),
  titulo text not null,
  impacto_financeiro numeric(12,2),
  impacto_operacional text,
  urgencia text,
  responsavel text,
  proxima_acao jsonb,
  confianca jsonb,
  detectado_em timestamptz not null default now(),
  visto_em timestamptz,
  -- Resolvido pelo MUNDO, não por alguém clicar: quando a fila deixa de
  -- apontar o problema, ele se fecha sozinho com a data. Exigir baixa manual
  -- encheria a tela de pendências que já não existem.
  resolvido_em timestamptz,
  -- Silenciado por decisão humana, com prazo. "Já sei, me lembre semana que
  -- vem" é uma resposta legítima e precisa de lugar para morar.
  silenciado_ate timestamptz,
  silenciado_por text,
  ocorrencias integer not null default 1,
  ultima_vez timestamptz not null default now(),
  unique (chave)
);

create index if not exists gerente_alertas_abertos
  on public.gerente_alertas (severidade, detectado_em desc)
  where resolvido_em is null;

alter table public.gerente_alertas enable row level security;

comment on table public.gerente_alertas is
  'Alertas do motor proativo, deduplicados por chave. Fecham sozinhos quando o problema some da fila.';

/**
 * Sincroniza a fila calculada com os alertas persistidos.
 *
 * Três movimentos numa transação só:
 * 1. O que é novo entra.
 * 2. O que continua aparecendo tem a contagem e a data atualizadas — sem virar
 *    um alerta novo, que é o que faria a caixa de entrada encher.
 * 3. O que sumiu da fila é RESOLVIDO com data. É o passo que a maioria dos
 *    sistemas de alerta esquece, e é por isso que eles acumulam ruído até
 *    alguém desligar as notificações.
 */
create or replace function public.sincronizar_alertas_do_gerente(p_itens jsonb)
returns table (novos integer, repetidos integer, resolvidos integer)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_novos int := 0;
  v_repetidos int := 0;
  v_resolvidos int := 0;
  v_chaves text[];
begin
  select coalesce(array_agg(x->>'chave'), '{}') into v_chaves
    from jsonb_array_elements(p_itens) x;

  with entrada as (
    select
      x->>'chave' as chave,
      x->>'severidade' as severidade,
      x->>'titulo' as titulo,
      nullif(x->>'impactoFinanceiro', '')::numeric as impacto_financeiro,
      x->>'impactoOperacional' as impacto_operacional,
      x->>'urgencia' as urgencia,
      x->>'responsavel' as responsavel,
      x->'proximaAcao' as proxima_acao,
      x->'confianca' as confianca
    from jsonb_array_elements(p_itens) x
  ),
  gravados as (
    insert into gerente_alertas (
      chave, severidade, titulo, impacto_financeiro, impacto_operacional,
      urgencia, responsavel, proxima_acao, confianca
    )
    select chave, severidade, titulo, impacto_financeiro, impacto_operacional,
           urgencia, responsavel, proxima_acao, confianca
      from entrada
    on conflict (chave) do update set
      severidade = excluded.severidade,
      titulo = excluded.titulo,
      impacto_financeiro = excluded.impacto_financeiro,
      impacto_operacional = excluded.impacto_operacional,
      urgencia = excluded.urgencia,
      proxima_acao = excluded.proxima_acao,
      confianca = excluded.confianca,
      ocorrencias = gerente_alertas.ocorrencias + 1,
      ultima_vez = now(),
      -- Problema que voltou depois de resolvido é problema NOVO de novo.
      resolvido_em = null,
      detectado_em = case
        when gerente_alertas.resolvido_em is not null then now()
        else gerente_alertas.detectado_em
      end
    returning (xmax = 0) as inserido
  )
  select
    count(*) filter (where inserido),
    count(*) filter (where not inserido)
  into v_novos, v_repetidos
  from gravados;

  update gerente_alertas
     set resolvido_em = now()
   where resolvido_em is null
     and not (chave = any (v_chaves));
  get diagnostics v_resolvidos = row_count;

  return query select v_novos, v_repetidos, v_resolvidos;
end;
$function$;
