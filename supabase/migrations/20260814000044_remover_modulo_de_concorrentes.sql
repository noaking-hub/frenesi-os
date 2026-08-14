-- O módulo de Concorrentes sai do ERP para ser refeito do zero.
--
-- Ele nunca ficou confiável: o casamento de títulos misturava flankers
-- (Intense/Elixir entravam como o perfume comum) e a leitura da vitrine
-- gravava preço de card de carrossel como se fosse da página — o Erba Pura
-- apareceu com "10 ml por R$ 86,90" numa loja que só vende 2 e 5 ml. Preço
-- de mercado errado empurra preço de VENDA errado, então o módulo inteiro
-- sai do ar até ser reescrito.
--
-- O agendador para aqui: nenhuma tela lê essas leituras, e continuar
-- raspando loja de terceiro sem ninguém olhar o resultado é custo e risco
-- sem contrapartida.
select cron.unschedule('coletar-concorrentes')
  where exists (select 1 from cron.job where jobname = 'coletar-concorrentes');

-- As tabelas (concorrentes, concorrente_precos, concorrente_apelidos,
-- concorrente_mudancas, concorrente_precos_coleta) FICAM, órfãs de
-- propósito: apagar é irreversível e o desenho novo é quem decide o que
-- aproveitar — a lista de lojas cadastradas e os apelidos ensinados à mão
-- são trabalho humano que talvez valha migrar. Os preços lidos, não: são o
-- resultado da leitura que se provou errada.
