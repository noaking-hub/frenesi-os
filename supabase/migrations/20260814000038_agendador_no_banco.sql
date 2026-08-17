-- O agendador sai da Netlify e vem para o banco.
--
-- As quatro funções agendadas da Netlify estavam registradas e nunca
-- dispararam de fato: nenhuma sincronia automática jamais aconteceu — todo
-- carimbo "automático" era clique manual. Três deploys de diagnóstico
-- depois (CRON_SEGREDO criado, bundles refeitos), o agendador de lá seguiu
-- mudo. pg_cron chama as MESMAS rotas HTTP já em produção, e cada execução
-- fica em cron.job_run_details — auditável com uma consulta, nunca mais em
-- silêncio.
--
-- ATENÇÃO: esta é a cópia de REGISTRO. A migração aplicada no projeto leva
-- o valor real de $CRON_SEGREDO no header Authorization — que não pode
-- viver aqui, porque este repositório é público. Para reaplicar, troque o
-- placeholder pelo valor do painel da Netlify (a rota confere exatamente o
-- mesmo segredo).
--
-- As funções em netlify/functions/ ficam como estão: se o agendador de lá
-- um dia acordar, as rotas são idempotentes e a rodada extra é inócua.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- O pulso dos pedidos: de 5 em 5 minutos, pedidos novos + gotejo do espelho.
select cron.schedule(
  'pulso-pedidos',
  '*/5 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/pedidos/pulso',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

-- A manutenção horária, em QUATRO etapas e não numa corrente só.
--
-- A rotina única morria de timeout em TODA rodada — o histórico do pg_net
-- mostrava "Timeout of 30000 ms" hora após hora, sem exceção. Dezoito etapas
-- em sequência não cabem nos ~26 segundos de função síncrona da Netlify, e o
-- que ficava de fora era sempre a mesma ponta: rastreio, Melhor Envio,
-- conciliação, estoque. Em silêncio, porque o corte de tempo acontece fora do
-- `try` de cada etapa.
--
-- Minutos afastados de propósito: cada etapa tem a função inteira para si.
select cron.schedule(
  'sincronizar-vendas',
  '2 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/financeiro/sincronizar?etapa=vendas',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

select cron.schedule(
  'sincronizar-logistica',
  '17 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/financeiro/sincronizar?etapa=logistica',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

select cron.schedule(
  'sincronizar-financeiro',
  '32 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/financeiro/sincronizar?etapa=financeiro',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

select cron.schedule(
  'sincronizar-operacao',
  '47 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/financeiro/sincronizar?etapa=operacao',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

-- Espelho diário do CRM (cashback + aniversários) — 7h30 UTC, 4h30 em SP.
select cron.schedule(
  'espelhar-crm',
  '30 7 * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/crm/espelhar',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

-- Coleta diária dos preços de concorrente — 9h UTC, 6h em SP.
select cron.schedule(
  'coletar-concorrentes',
  '0 9 * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/concorrentes/coletar',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

-- Os avisos ao cliente, de dez em dez minutos. Rotina PRÓPRIA porque eles
-- moravam no fim da sincronia horária, atrás de extrato, rastreio, conciliação
-- e estoque — e essa corrente não cabe no tempo de função da Netlify. Quando
-- estourava, o que ficava de fora era sempre a ponta: o e-mail do cliente, em
-- silêncio. Continua desligada até AVISOS_DE_PEDIDO=1.
select cron.schedule(
  'avisar-clientes',
  '*/10 * * * *',
  $$select net.http_post(
    url := 'https://erp.frenesiperfumes.com.br/api/pedidos/avisos',
    headers := jsonb_build_object('Authorization', 'Bearer $CRON_SEGREDO'),
    timeout_milliseconds := 30000
  )$$
);

-- O histórico do agendador é sinal vital, não acervo: uma semana basta.
select cron.schedule(
  'limpar-historico-do-agendador',
  '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
