-- 57 tabelas concediam INSERT/UPDATE/DELETE a `anon` no nível de GRANT.
--
-- O RLS já barra — nenhuma policy autoriza `anon` a coisa nenhuma, e as que
-- existem são todas `to authenticated`, exceto a de `usuarios`, que é
-- `auth.uid() = id` (e `anon` não tem uid, então não casa com linha alguma).
--
-- Mas GRANT e RLS são travas independentes, e depender de uma só é apostar
-- que ninguém vai criar uma policy permissiva demais por engano. Tirar o
-- GRANT faz a tentativa morrer antes de chegar na policy.
--
-- `authenticated` mantém o SELECT que as policies já filtram; perde apenas
-- escrita, que nenhuma tela faz pelo navegador — toda gravação do ERP passa
-- por Server Action ou rota, com service role.
--
-- O portal público de devoluções não é afetado: ele também escreve pelo
-- servidor, com service role, e nunca usou a chave anon.
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t.relname);
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $$;
