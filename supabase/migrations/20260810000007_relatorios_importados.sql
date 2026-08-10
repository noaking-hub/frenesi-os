-- ═══════════════════════════════════════════════════════════════════════════
-- Memória de qual relatório de liberações já entrou.
--
-- Pedir o relatório e importá-lo são dois momentos separados: o Mercado Pago
-- leva minutos para gerar o arquivo, e esperar dentro da requisição já falhou
-- em produção. Com dois passos, a tela lista o que está pronto e a pessoa
-- escolhe — o que traz de volta o risco de importar o mesmo arquivo duas
-- vezes, sem nenhum erro aparecer.
--
-- As chaves de extrato são estáveis (data + operação + posição), então uma
-- reimportação não duplicaria saldo. Mas a tela precisa dizer, antes do
-- clique, o que já foi lido — "já importado" é a diferença entre conferir e
-- torcer.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists relatorios_importados (
  arquivo      text primary key,
  linhas       integer not null default 0,
  importado_em timestamptz not null default now()
);

comment on table relatorios_importados is
  'Relatórios de liberações do Mercado Pago já lidos, pelo nome do arquivo que a API devolve.';

comment on column relatorios_importados.linhas is
  'Quantas linhas de extrato o arquivo gerou. Zero é sinal de formato não reconhecido, não de mês parado.';
