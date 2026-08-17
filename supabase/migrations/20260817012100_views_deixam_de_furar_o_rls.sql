-- 22 views entregavam o balanço da empresa para quem tivesse a chave anon.
--
-- View criada por `postgres` roda com os privilégios do DONO, e `postgres`
-- tem `rolbypassrls`. O RLS das tabelas embaixo, que funciona, era pulado:
-- `extrato_linhas` como anon devolve 0 linhas, mas `extrato_a_classificar`,
-- que lê exatamente essa tabela, devolvia 177.
--
-- O que saía: saldo de todas as contas (inclusive a PESSOAL do dono), receita
-- mensal, CMV por competência, margem, perda real. A chave anon é pública por
-- construção — ela vive no JavaScript que o navegador baixa. O `.env.example`
-- afirmava que "a chave anon devolveria listas vazias"; não devolvia, e isso
-- foi verificado trocando o papel na sessão.
--
-- Duas travas, porque uma só não basta:
--
-- `security_invoker = on` faz a view rodar com os privilégios de QUEM
-- CONSULTA, então o RLS da tabela volta a valer para ela.
--
-- `revoke select from anon` tira o acesso de vez. É redundante de propósito:
-- se amanhã alguém criar uma view sem o `security_invoker`, o revoke segura.
--
-- Nada do aplicativo quebra: toda leitura passa por `supabaseServer()`, com
-- service role, em arquivos marcados 'server-only'.
do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    execute format('revoke select on public.%I from anon', v.relname);
  end loop;
end $$;
