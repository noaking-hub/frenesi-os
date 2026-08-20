-- ═══════════════════════════════════════════════════════════════════════════
-- Saque do Mercado Pago não é despesa de mídia.
--
-- A gestão de tráfego pediu para conferir dois lançamentos de "Tráfego Pago"
-- que pareciam transferências. A conferência no extrato achou coisa maior: os
-- TREZE lançamentos dessa categoria eram todos `payout` do Mercado Pago —
-- descrição na origem "Transferência para o banco". Nenhum é pagamento à Meta
-- ou ao Google. Alguns tinham sido rebatizados na classificação ("Meta ADS",
-- "Google ADS"), mas o fato debaixo do rótulo é o mesmo: dinheiro saindo do
-- gateway para a conta do dono.
--
-- Somavam R$ 9.405,49 lançados como despesa. Dois estragos ao mesmo tempo:
--   1. a DRE contava como custo de mídia dinheiro que só mudou de bolso;
--   2. o saque saía do Mercado Pago e não entrava em conta nenhuma — o ERP
--      tinha a perna de saída e não a de entrada, então o dinheiro evaporava.
--
-- O destino veio do dono: todo saque do MP cai no Rafael (PF). Com isso, cada
-- um vira transferência de verdade pela função que já existe para isso,
-- `resolver_destino_do_payout`, que cria a perna que faltava.
--
-- ── A armadilha que este reparo encontrou ─────────────────────────────────
--
-- `resolver_destino_do_payout` insere a perna com `on conflict (id) do
-- nothing`, e dez das treze JÁ TINHAM uma perna com aquele id: sobras de uma
-- regra antiga ("saque vai para o Inter"), canceladas em 17/08 com o motivo
-- gravado — "o dono confirmou que nunca houve repasse ao Inter dessa forma".
-- O `do nothing` engoliu a inserção em silêncio e o reparo teria terminado com
-- dez transferências sem destino. Por isso a segunda parte: repontar as pernas
-- que já existiam, em vez de tentar criar de novo.
--
-- Sobram 52 pernas canceladas apontando para o Inter, dos demais saques do
-- período. Ficam como estão de propósito: a mesma pergunta de destino vale
-- para elas, e aplicar em massa uma regra de destino sem o dono ver o efeito
-- foi exatamente o erro de 17/08.
-- ═══════════════════════════════════════════════════════════════════════════

do $do$
declare
  v_l record;
  v_r jsonb;
begin
  for v_l in
    select id from lancamentos
     where categoria = 'Tráfego Pago' and cancelado_em is null and id like '%:payout:%'
     order by ocorrido_em
  loop
    -- A fila de destino é a porta de entrada da função, e estes saques nunca
    -- passaram por ela: a classificação os rotulou como despesa antes.
    update lancamentos
       set aguarda_destino = true,
           transferencia_id = coalesce(transferencia_id, 'transf-' || coalesce(chave_externa, id))
     where id = v_l.id;

    select resolver_destino_do_payout(
             v_l.id, 'rafael-pf', null,
             'Correção 21/08 — saque do MP classificado como mídia'
           ) into v_r;
    if not (v_r->>'ok')::boolean then
      raise warning 'payout % não resolvido: %', v_l.id, v_r->>'erro';
    end if;
  end loop;
end $do$;

-- As pernas que o `on conflict do nothing` deixou para trás: existiam
-- canceladas, apontando para o Inter. Repontar é o certo — o movimento é o
-- mesmo, só o destino estava errado.
update lancamentos d
   set conta_id = 'rafael-pf',
       conta_destino_id = o.conta_id,
       cancelado_em = null,
       cancelado_motivo = null,
       categoria = 'Transferências',
       categoria_id = 'transferencias',
       atualizado_em = now()
  from lancamentos o
 where d.id = o.id || ':destino'
   and o.categoria_id = 'transferencias'
   and o.conta_destino_id = 'rafael-pf'
   and o.id like '%:payout:%'
   and (d.cancelado_em is not null or d.conta_id <> 'rafael-pf');
