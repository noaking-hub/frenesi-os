-- Edição do catálogo no ERP.
--
-- Nome, marca e imagem são da Shopify e a importação os atualiza. O gênero
-- também vem da loja quando ela diz — mas se o operador corrigir à mão, a
-- correção precisa sobreviver à próxima importação. Esta coluna registra
-- isso: importação nunca sobrescreve gênero marcado como manual.

alter table perfumes_base
  add column genero_manual boolean not null default false;

comment on column perfumes_base.genero_manual is
  'Gênero foi definido à mão no ERP — a importação da Shopify não sobrescreve.';
