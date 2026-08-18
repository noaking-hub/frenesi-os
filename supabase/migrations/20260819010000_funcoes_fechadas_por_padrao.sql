-- Função do schema public não é API do navegador: TODO acesso do ERP ao banco
-- passa pelo servidor, com service role. Mesmo assim 86 funções `invoker`
-- seguiam executáveis por `anon` e `authenticated` — sem dano imediato porque
-- esbarram no RLS e nos grants revogados das tabelas, mas confiar nisso é usar
-- a segunda tranca para justificar a primeira aberta (a 20260817170000 já
-- registrou onde esse raciocínio termina: uma `security definer` recriada
-- voltou aberta e gravava pedido sem sessão).
--
-- Duas medidas, e a segunda é a que muda o jogo:
--
-- 1. Varrer TODAS as funções do schema — definer e invoker — e revogar
--    execute de anon, authenticated e PUBLIC. service_role tem grant
--    explícito próprio (proacl: service_role=X) e continua funcionando.
--
-- 2. ALTER DEFAULT PRIVILEGES: função criada daqui em diante NASCE fechada.
--    É isto que conserta o buraco recorrente do drop+create — a varredura
--    manual era regra de disciplina, e disciplina falhou 18 horas depois de
--    escrita.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f.assinatura);
  end loop;
end $$;

-- Sem estas três linhas, o Supabase concede execute a anon/authenticated em
-- toda função nova do postgres neste schema — era daí que vinha o `anon=X`
-- de cada create.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;
