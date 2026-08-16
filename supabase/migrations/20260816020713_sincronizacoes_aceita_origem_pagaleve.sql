-- A Pagaleve virou origem de sincronização e a restrição não sabia disso.
--
-- O registro da rodada existe para responder "a rotina alcançou a Pagaleve?",
-- pergunta que o banco não respondia porque uma execução correta preserva as
-- datas informadas e não altera linha nenhuma. Com a origem barrada pelo CHECK,
-- o insert falhava e a pergunta continuava sem resposta.
alter table public.sincronizacoes drop constraint if exists sincronizacoes_origem_check;

alter table public.sincronizacoes
  add constraint sincronizacoes_origem_check
  check (origem = any (array['shopify', 'yampi', 'pulso', 'pagaleve', 'mercadopago']));

comment on column public.sincronizacoes.origem is
  'De onde veio a rodada. Ampliar aqui é obrigatório antes de uma nova integração registrar execução.';
