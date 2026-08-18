-- Lembretes com data do dono, entregues pelo Gerente.
--
-- "Sobre o checkout vamos conversar de novo no início do mês que vem" é um
-- compromisso com data — e compromisso guardado na cabeça de alguém não é
-- agendamento. A partir do dia marcado o lembrete entra na fila de
-- prioridades e vira alerta no sino do ERP; concluído, sai sozinho na
-- rodada seguinte da vigília.
create table if not exists gerente_lembretes (
  id bigint generated always as identity primary key,
  assunto text not null,
  detalhe text,
  a_partir_de date not null,
  criado_por text not null default 'Sistema',
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table gerente_lembretes enable row level security;

comment on table gerente_lembretes is
  'Lembretes com data: a partir de a_partir_de entram na fila do Gerente até serem concluídos.';

-- O primeiro: retomar a conversa do checkout próprio em 1º de setembro.
insert into gerente_lembretes (assunto, detalhe, a_partir_de, criado_por)
values (
  'Retomar a conversa do checkout próprio (Mercado Pago + ERP)',
  'Passo 1: medir na conciliação o custo real da Yampi por mês. Se a conta justificar, plano em fases — Pix primeiro, com parte do tráfego, medindo conversão contra a Yampi.',
  '2026-09-01',
  'Rafael A.'
);
