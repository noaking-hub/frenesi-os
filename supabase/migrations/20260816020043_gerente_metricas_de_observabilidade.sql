-- Observabilidade do Gerente — §12 e §27 do escopo.
--
-- Um assistente que consome API paga e lê o financeiro inteiro precisa ter
-- custo, latência e taxa de erro visíveis. Sem isso, a primeira notícia de que
-- algo saiu do controle é a fatura no fim do mês — ou pior, ninguém percebe
-- que uma ferramenta está falhando há dias e as respostas seguem saindo com um
-- buraco no meio, plausíveis e erradas.
--
-- A view agrega por dia porque é a granularidade em que a pergunta faz sentido
-- ("está mais caro esta semana?"), e por canal porque ERP e WhatsApp têm
-- perfis de uso diferentes — misturar os dois esconderia o que muda em cada um.
create or replace view public.gerente_metricas_por_dia as
select
  (criada_em at time zone 'America/Sao_Paulo')::date as dia,
  coalesce(canal, 'erp')                             as canal,
  count(*)                                           as interacoes,
  count(*) filter (where erro is not null)           as com_erro,
  -- Parada por limite não é erro, mas também não é sucesso: é resposta
  -- truncada, e precisa ser contada à parte para não se esconder na média.
  count(*) filter (where parou_por is not null and parou_por <> 'concluiu') as truncadas,
  round(avg(duracao_ms))                             as duracao_media_ms,
  max(duracao_ms)                                    as duracao_maxima_ms,
  sum(tokens_entrada)                                as tokens_entrada,
  sum(tokens_saida)                                  as tokens_saida,
  round(avg(jsonb_array_length(coalesce(ferramentas, '[]'::jsonb))), 2) as ferramentas_por_interacao
from public.assessor_auditoria
group by 1, 2
order by 1 desc, 2;

comment on view public.gerente_metricas_por_dia is
  'Latência, custo em tokens, erro e truncamento por dia e canal (§27).';

-- Quais ferramentas o Gerente realmente usa, e quais falham.
--
-- A taxa de erro POR FERRAMENTA é o que a média geral esconde: uma integração
-- quebrada some numa taxa global de 2% e aparece aqui como 100%.
create or replace view public.gerente_uso_das_ferramentas as
select
  f->>'nome'                                            as ferramenta,
  coalesce(f->>'modo', '—')                             as modo,
  count(*)                                              as chamadas,
  count(*) filter (where f->>'erro' is not null)        as falhas,
  count(*) filter (where f->>'bloqueio' is not null)    as bloqueadas,
  round(avg((f->>'ms')::numeric))                       as ms_medio,
  max((f->>'ms')::numeric)                              as ms_maximo,
  max(a.criada_em)                                      as ultima_vez
from public.assessor_auditoria a
cross join lateral jsonb_array_elements(coalesce(a.ferramentas, '[]'::jsonb)) f
group by 1, 2
order by count(*) desc;

comment on view public.gerente_uso_das_ferramentas is
  'Ferramentas mais usadas, latência e falhas por ferramenta — a média geral esconde a integração quebrada.';
