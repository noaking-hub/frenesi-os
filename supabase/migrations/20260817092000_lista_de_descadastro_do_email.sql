-- Quem pediu para não receber mais e-mail de marketing.
--
-- Os modelos já traziam "Cancelar inscrição" no rodapé, apontando para uma
-- página que NÃO EXISTIA. Link morto num pedido de descadastro é pior do que
-- link nenhum: a pessoa clica, não acontece nada, e o próximo e-mail vira
-- denúncia de spam — que é o que derruba a reputação do domínio inteiro e
-- manda também os avisos de pedido para a caixa de lixo.
--
-- O que entra aqui vale só para MARKETING (carrinho, giftback, aviso de
-- cashback). Aviso de pedido pago, enviado, entregue e devolução são
-- mensagens de serviço sobre uma compra que a pessoa fez — elas continuam
-- saindo, e é assim que a lei e o bom senso tratam a diferença.
create table if not exists descadastrados (
  email text primary key,
  motivo text,
  origem text not null default 'link do e-mail',
  criado_em timestamptz not null default now()
);

alter table descadastrados enable row level security;
revoke all on descadastrados from anon, authenticated;

create index if not exists descadastrados_criado_idx on descadastrados (criado_em desc);

-- Registrar é idempotente: clicar duas vezes no link não pode dar erro na
-- cara de quem só quer sair da lista.
create or replace function public.registrar_descadastro(
  p_email text,
  p_origem text default 'link do e-mail',
  p_motivo text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into descadastrados (email, origem, motivo)
  values (lower(btrim(p_email)), coalesce(p_origem, 'link do e-mail'), p_motivo)
  on conflict (email) do update
     set motivo = coalesce(excluded.motivo, descadastrados.motivo),
         origem = excluded.origem;
$$;

revoke execute on function public.registrar_descadastro(text, text, text)
  from anon, authenticated, public;

create or replace function public.reativar_email(p_email text) returns void
language sql
security definer
set search_path = public
as $$
  delete from descadastrados where email = lower(btrim(p_email));
$$;

revoke execute on function public.reativar_email(text) from anon, authenticated, public;
