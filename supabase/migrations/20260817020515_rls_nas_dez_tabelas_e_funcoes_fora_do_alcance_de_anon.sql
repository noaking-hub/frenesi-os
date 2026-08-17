-- Dez tabelas sem RLS, e funções de escrita chamáveis por `anon` via RPC.
--
-- Hoje nada disso é alcançável: nenhuma tela usa o Supabase pelo navegador,
-- toda leitura passa por `supabaseServer()` com service role. Mas "hoje" é uma
-- garantia frágil — um único `createBrowserClient` em qualquer tela converte
-- isso em exposição total, e quem escrever essa linha não vai saber que ela
-- destranca `pedido_transacoes` (638 linhas, base da conciliação) e
-- `cashback_movimentos` para DELETE anônimo.
--
-- A postura correta é a inversa: fechado por padrão, e quem precisar de
-- acesso pelo navegador que crie a policy explicitamente.
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    -- Sem policy nenhuma: RLS ligado e sem regra significa "ninguém, exceto
    -- service role". É exatamente o que estas tabelas precisam — o ERP
    -- inteiro fala com elas pelo servidor.
    execute format('revoke all on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- ── Funções SECURITY DEFINER ───────────────────────────────────────────────
--
-- `SECURITY DEFINER` roda com os privilégios de quem CRIOU a função, ou seja,
-- ignora o RLS que acabamos de ligar. Com `execute` concedido a `anon`, uma
-- chamada RPC anônima podia registrar venda manual — gravando faturamento e
-- baixando estoque —, resolver destino de payout ou classificar lançamento.
--
-- O `revoke` é feito em bloco sobre TODAS as funções `definer` do schema,
-- porque a lista cresce a cada migration e enumerar à mão garante esquecer a
-- próxima. `service_role` mantém o acesso; é por ela que o ERP chama.
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
