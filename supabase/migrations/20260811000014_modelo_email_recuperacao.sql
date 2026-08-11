-- O modelo do e-mail de recuperação de carrinho, editável pela tela.
--
-- Uma linha só (id booleano travado em true): o texto do assunto, do título,
-- da mensagem e do botão. A moldura visual — preto e dourado, lista de itens,
-- cupom — é código; o que muda com a operação é o texto, e texto editável
-- não pode exigir deploy.
create table modelo_email_recuperacao (
  id            boolean primary key default true check (id),
  assunto       text not null,
  titulo        text not null,
  mensagem      text not null,
  texto_botao   text not null,
  atualizado_em timestamptz not null default now()
);

alter table modelo_email_recuperacao enable row level security;
create policy erp_leitura on modelo_email_recuperacao for select to authenticated using (true);
