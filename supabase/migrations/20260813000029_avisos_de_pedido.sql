-- Silenciar todo o passado antes de ligar os avisos ao cliente.
--
-- A tabela `notificacoes_enviadas` já existia, desenhada e vazia: chave
-- derivada do FATO (`YP-123|pedido_enviado`), estados `enviando` → `enviado`
-- | `falhou`, e `dispensado` para o fato que não merece e-mail. Falta só a
-- carga que a torna segura de ligar.
--
-- Sem esta carga, ativar o módulo dispararia centenas de e-mails de uma vez,
-- avisando clientes sobre pedidos entregues semanas atrás. Seria a pior
-- estreia possível para uma funcionalidade cujo propósito é aumentar a
-- confiança na loja — e não teria como ser desfeito.
--
-- Cada fato já ocorrido entra como `dispensado`. O módulo passa a avisar
-- somente o que acontecer DEPOIS desta migração.

insert into notificacoes_enviadas
  (chave, pedido_id, evento, destinatario, assunto, estado, motivo, concluido_em)
select
  p.id || '|' || e.evento,
  p.id,
  e.evento,
  coalesce(c.email, ''),
  '(não enviado)',
  'dispensado',
  'histórico anterior à ativação do módulo de avisos',
  now()
from pedidos p
join clientes c on c.id = p.cliente_id
cross join lateral (
  select unnest(
    array_remove(array[
      case when p.pagamento = 'pago' then 'pedido_pago' end,
      case when p.envio in ('enviado', 'entregue') then 'pedido_enviado' end,
      case when p.envio = 'entregue' then 'pedido_entregue' end
    ], null)
  ) as evento
) e
on conflict (chave) do nothing;
