-- O `drop function` devolveu a `anon` o EXECUTE que a 20260817020515 tinha
-- tirado — e ninguém percebeu porque o `create` seguinte parecia igual.
--
-- `create or replace` preserva os privilégios do objeto. `drop function` +
-- `create function` NÃO: o segundo é um objeto novo, e todo objeto novo nasce
-- com `execute` para PUBLIC, o que inclui `anon` e `authenticated`. Três
-- funções passaram por esse par nas migrations de parcelamento e voltaram a
-- ficar abertas:
--
--   registrar_venda_manual(...)            SECURITY DEFINER  ← o buraco de verdade
--   gravar_parcelas_do_lancamento(...)     invoker
--   parcelar_lancamento(...)               invoker
--
-- A grave é a primeira. Sendo `definer`, ela roda como `postgres` e passa por
-- cima do RLS que a 20260817020515 ligou nas dez tabelas; um POST em
-- /rest/v1/rpc/registrar_venda_manual com a NEXT_PUBLIC_SUPABASE_ANON_KEY —
-- que está num repositório PÚBLICO — gravava pedido MAN-xxxx, faturamento e
-- baixa de estoque sem sessão nenhuma. Medido em pg_proc antes deste arquivo:
-- das 18 funções `prosecdef` do schema, era a ÚNICA com `anon=X` no proacl.
-- As duas `invoker` não davam dano hoje (esbarram nos grants revogados de
-- `lancamentos`), mas depender disso é usar a segunda tranca para justificar a
-- primeira aberta.
--
-- ── Por que o laço, e não três `revoke` à mão ──────────────────────────────
--
-- Porque foi exatamente o `revoke` à mão que faltou. A 20260817020515 já tinha
-- escolhido varrer todas as `definer` do schema "porque a lista cresce a cada
-- migration e enumerar à mão garante esquecer a próxima" — e a próxima chegou
-- dezoito horas depois. Repetir a varredura aqui reconserta o esquecimento e
-- pega qualquer outra função `definer` que tenha sido recriada no meio.
--
-- O que isto NÃO resolve: a próxima migration que fizer drop+create abre o
-- buraco de novo até alguém rodar esta varredura outra vez. Enquanto não
-- houver um event trigger fazendo isso sozinho, a regra é escrita no fim de
-- cada migration que dropa função — 20260817134500 e 20260817160000 já
-- carregam o `revoke` correspondente.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f.assinatura);
  end loop;
end $$;

-- As duas do parcelamento são `invoker`, então não entram no laço acima. Elas
-- escrevem em `lancamentos` e não têm por que ser alcançáveis pelo navegador:
-- o ERP inteiro fala com o banco pelo servidor, com service role.
revoke execute on function public.gravar_parcelas_do_lancamento(lancamentos, smallint, int, smallint, date)
  from anon, authenticated, public;
revoke execute on function public.parcelar_lancamento(text, smallint, int, smallint, date)
  from anon, authenticated, public;
