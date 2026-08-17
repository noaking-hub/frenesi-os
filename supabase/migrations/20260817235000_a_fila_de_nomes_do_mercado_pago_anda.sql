-- A fila que procura o nome do outro lado nunca saía do lugar.
--
-- `enriquecerContrapartes` pega as 90 linhas SEM contraparte mais recentes e
-- pergunta ao Mercado Pago quem pagou. Quando a resposta não traz nome — e
-- boa parte dos movimentos não traz: reserva, liberação, ajuste — a linha
-- continua sem contraparte de propósito, para poder ser tentada de novo se o
-- dado aparecer depois.
--
-- O efeito colateral é que a rodada seguinte pega exatamente as MESMAS 90.
-- Uma janela ordenada por data, com um teto menor que a quantidade de linhas
-- sem nome, é uma esteira que gira sem avançar: 475 das 525 linhas do Mercado
-- Pago seguem anônimas, e nenhuma anterior a 09/08 jamais foi consultada.
--
-- O carimbo resolve sem fechar a porta: a linha continua elegível para sempre,
-- mas vai para o fim da fila depois de cada tentativa. Quem nunca foi tentado
-- passa na frente (`nulls first`), e a esteira anda.
alter table public.extrato_linhas
  add column if not exists contraparte_buscada_em timestamptz;

comment on column public.extrato_linhas.contraparte_buscada_em is
  'Quando o nome da contraparte foi procurado pela última vez. Ordena a fila do enriquecimento: sem carimbo primeiro, depois o mais antigo. Sem isto a rotina reconsultava as mesmas 90 linhas recentes a cada hora.';

-- Índice na ordem exata da fila: só as linhas do Mercado Pago ainda sem nome.
create index if not exists extrato_linhas_fila_de_nomes
  on public.extrato_linhas (contraparte_buscada_em nulls first)
  where origem = 'mercadopago' and contraparte = '' and not ignorado;
