-- ═══════════════════════════════════════════════════════════════════════════
-- Conclusão de devolução com prova.
--
-- "Concluída" era só um carimbo: a resolução escolhida na tela não era
-- gravada, e o reembolso acontecia fora do sistema sem deixar rastro. Agora a
-- conclusão registra O QUE foi feito (reembolso, troca ou cupom), quanto, por
-- qual forma, quando — e guarda o COMPROVANTE no bucket, para a ficha, o
-- portal e o e-mail do cliente. O reembolso em si segue manual (decisão da
-- operação): o sistema comprova, não movimenta dinheiro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table solicitacoes_devolucao add column if not exists resolucao text;
alter table solicitacoes_devolucao add column if not exists reembolso_valor numeric;
alter table solicitacoes_devolucao add column if not exists reembolso_forma text
  check (reembolso_forma in ('pix', 'estorno-cartao') or reembolso_forma is null);
alter table solicitacoes_devolucao add column if not exists reembolso_em timestamptz;
alter table solicitacoes_devolucao add column if not exists comprovante_reembolso text;
alter table solicitacoes_devolucao add column if not exists troca_pedido_id text;

comment on column solicitacoes_devolucao.resolucao is
  'Resolução registrada na conclusão: Reembolso integral, Troca por outro perfume ou Cupom + bônus.';
comment on column solicitacoes_devolucao.comprovante_reembolso is
  'Caminho no bucket devolucoes do comprovante do reembolso (PDF ou imagem do banco/gateway).';
comment on column solicitacoes_devolucao.troca_pedido_id is
  'Número do novo pedido quando a resolução é troca/reenvio.';

-- O comprovante costuma ser PDF; o bucket aceitava só imagem (fotos do portal).
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
     'application/pdf'
   ]
 where id = 'devolucoes';
