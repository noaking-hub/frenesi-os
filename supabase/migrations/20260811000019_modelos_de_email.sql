-- Central de e-mails da marca: um modelo por chave, na mesma tabela.
-- O de carrinho migra da tabela antiga; o de aniversário nasce no padrão do
-- código até alguém editar.
create table modelos_email (
  chave         text primary key check (chave in ('carrinho', 'giftback')),
  assunto       text not null,
  titulo        text not null,
  mensagem      text not null,
  texto_botao   text not null,
  html          text,
  atualizado_em timestamptz not null default now()
);

insert into modelos_email (chave, assunto, titulo, mensagem, texto_botao, html)
  select 'carrinho', assunto, titulo, mensagem, texto_botao, html
    from modelo_email_recuperacao;

drop table modelo_email_recuperacao;

alter table modelos_email enable row level security;
create policy erp_leitura on modelos_email for select to authenticated using (true);
