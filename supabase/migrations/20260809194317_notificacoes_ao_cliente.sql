-- ═══════════════════════════════════════════════════════════════════════════
-- Notificações ao cliente, com o ERP como remetente único.
-- ═══════════════════════════════════════════════════════════════════════════

create table notificacoes_regras (
  evento    text primary key,
  ativa     boolean not null default false,
  assunto   text not null default '',
  -- Quem realmente dispara hoje. Enquanto for 'yampi', o ERP não manda nada:
  -- ligar os dois ao mesmo tempo daria dois e-mails do mesmo fato, e o
  -- cliente desconfia mais do segundo que do primeiro.
  remetente text not null default 'yampi' check (remetente in ('yampi', 'erp', 'ninguem')),
  atualizado_em timestamptz not null default now()
);

/**
 * Log de envio — e trava de duplicata na mesma tabela.
 *
 * `chave` deriva do FATO (`YP-1234|pedido_enviado`), não do instante em que a
 * rotina rodou. Rodar duas vezes, reimportar pedidos ou reiniciar no meio do
 * processo não pode gerar um segundo e-mail: a chave primária recusa.
 */
create table notificacoes_enviadas (
  chave       text primary key,
  pedido_id   text references pedidos (id) on delete set null,
  evento      text not null,
  destinatario text not null,
  assunto     text not null default '',
  -- 'enviando' marca a tentativa ANTES de chamar o provedor. Se o processo
  -- morrer no meio, a linha fica como testemunha em vez de sumir e o e-mail
  -- ser mandado de novo na rodada seguinte.
  estado      text not null default 'enviando'
    check (estado in ('enviando', 'enviado', 'falhou', 'dispensado')),
  -- Dispensado: o fato já era antigo quando o ERP assumiu. Fica registrado
  -- para o histórico do cliente não ter buraco, sem sair e-mail.
  motivo      text not null default '',
  provedor_id text,
  criado_em   timestamptz not null default now(),
  concluido_em timestamptz
);

create index on notificacoes_enviadas (pedido_id);
create index on notificacoes_enviadas (evento);
create index on notificacoes_enviadas (criado_em desc);

alter table notificacoes_regras   enable row level security;
alter table notificacoes_enviadas enable row level security;
create policy erp_leitura on notificacoes_regras   for select to authenticated using (true);
create policy erp_leitura on notificacoes_enviadas for select to authenticated using (true);

-- Nasce tudo desligado e atribuído à Yampi, que é quem manda hoje. Ligar é
-- decisão consciente, uma a uma — e cada linha ligada aqui precisa ser
-- desligada lá, senão o cliente recebe em dobro.
insert into notificacoes_regras (evento, assunto, remetente) values
  ('pedido_pago',        'Pagamento confirmado · pedido {pedido}',   'yampi'),
  ('pedido_faturado',    'Nota fiscal emitida · pedido {pedido}',    'yampi'),
  ('pedido_enviado',     'Seu pedido saiu para entrega · {pedido}',  'yampi'),
  ('pedido_entregue',    'Seu pedido chegou · {pedido}',             'yampi'),
  ('devolucao_recebida', 'Recebemos sua devolução · {pedido}',       'ninguem'),
  ('cashback_creditado', 'Você ganhou cashback na Frenesi',          'yampi'),
  ('cashback_expirando', 'Seu cashback está perto de expirar',       'yampi')
on conflict (evento) do nothing;
