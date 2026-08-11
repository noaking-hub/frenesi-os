-- Modo "HTML do zero" no e-mail de recuperação: quando a coluna html tem
-- conteúdo, ela É o documento inteiro (com placeholders {nome}, {itens},
-- {total}, {link} e o bloco [[cupom]]…[[/cupom]]); vazia, vale a moldura
-- da marca com os textos das outras colunas.
alter table modelo_email_recuperacao add column html text;
