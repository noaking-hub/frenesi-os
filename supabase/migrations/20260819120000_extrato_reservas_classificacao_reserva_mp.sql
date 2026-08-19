-- A bagunça do extrato, atacada pela causa (19/08).
--
-- Quatro defeitos, um por bloco:
--
-- 1. "Reserva de pagamento" é movimento INTERNO do Mercado Pago: ele retém o
--    valor e o devolve ao pagar a etiqueta — as duas pernas se anulam e o
--    pagamento real é a linha "payment". A regra de categoria ("etiqueta →
--    Frete") casava com as duas pernas e criou 18 pares de despesa + receita
--    fantasmas. As regras passam a ignorar linha interna/Reserva, as linhas
--    ficam dispensadas com motivo, e os fantasmas são cancelados.
--
-- 2. O depósito da Pagaleve agrupa parcelas de DIAS diferentes (o de R$163,26
--    de 18/08 somava as parcelas de 18/08 e duas previstas para 19/08). O
--    casamento exigia mesmo dia + valor exato e nunca casava. Nasce o RPC que
--    aplica um casamento por conjunto exato de parcelas, chamado pela rotina
--    que resolve o subconjunto.
--
-- 3. A conta "Reserva Mercado Pago" (Porquinho, 120% do CDI) passa a existir:
--    aplicar ali é transferência entre contas próprias — move o caixa, não é
--    despesa, não entra na DRE. Os R$5.000 de 18/08 são convertidos.
--
-- (O 4º defeito — a descoberta de destino dos saques morrer de fome por tempo
--  atrás da importação do extrato — é resolvido no código: etapa própria
--  `classificacao` com agendamento próprio.)

-- ── 1a. Regras nunca mais tocam linha interna ─────────────────────────────
create or replace function public.aplicar_regras_categoria(p_operador text default 'Regra automática'::text)
returns jsonb
language plpgsql
as $function$
declare
  v_linha record;
  v_aplicadas integer := 0;
begin
  for v_linha in
    select e.origem, e.chave, r.categoria, r.padrao
      from extrato_linhas e
      join regras_categoria r
        on (e.descricao || ' ' || e.contraparte || ' ' || e.documento || ' ' ||
            coalesce(e.bruto::text, ''))
           ilike '%' || r.padrao || '%'
     where e.lancamento_id is null
       and not e.ignorado
       and e.pedido_id is null
       -- Linha interna do gateway (reserva, transferência entre saldos) não é
       -- despesa nem receita: regra de categoria não pode alcançá-la.
       and not e.interno
       and e.descricao not like 'Reserva%'
  loop
    perform classificar_extrato(
      v_linha.origem,
      v_linha.chave,
      v_linha.categoria,
      v_linha.padrao,
      p_operador
    );
    v_aplicadas := v_aplicadas + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_aplicadas);
end;
$function$;

-- ── 1b. Fantasmas de reserva cancelados; linhas dispensadas com motivo ────
update lancamentos l
   set cancelado_em = now(),
       cancelado_motivo = 'Reserva interna do gateway (as duas pernas se anulam) — classificada por engano pela regra de categoria.'
 where l.cancelado_em is null
   and exists (select 1 from extrato_linhas e
                where e.lancamento_id = l.id and e.descricao like 'Reserva%');

update extrato_linhas
   set lancamento_id = null,
       ignorado = true,
       motivo_ignorado = 'Reserva interna do Mercado Pago: o valor é retido e devolvido pelo próprio gateway; o pagamento real é a linha "payment".'
 where descricao like 'Reserva%'
   and (lancamento_id is not null or not ignorado);

-- ── 2. Casamento por conjunto exato de parcelas Pagaleve ──────────────────
create or replace function public.casar_repasse_pagaleve_exato(
  p_chave text,
  p_parcelas jsonb,
  p_operador text default 'conciliação automática (agrupado)'::text
) returns jsonb
language plpgsql
as $function$
declare
  v_linha extrato_linhas%rowtype;
  v_qtd integer;
  v_bruto numeric;
  v_tarifa numeric;
  v_liquido numeric;
  v_conta_nome text;
begin
  select * into v_linha from extrato_linhas where chave = p_chave;
  if not found then
    raise exception 'linha % não existe no extrato', p_chave;
  end if;
  if v_linha.ignorado then
    raise exception 'a linha % está dispensada', p_chave;
  end if;

  select count(*), round(sum(p.bruto), 2), round(sum(p.tarifa), 2), round(sum(p.liquido), 2)
    into v_qtd, v_bruto, v_tarifa, v_liquido
  from pagaleve_parcelas p
  join jsonb_to_recordset(p_parcelas) as x(checkout_id text, numero int)
    on p.checkout_id = x.checkout_id and p.numero = x.numero
  where p.liquidada_em is null and p.liquido <> 0;

  -- A trava que mantém isto determinístico: ou o conjunto fecha no centavo
  -- com a linha do extrato, ou nada acontece.
  if coalesce(v_qtd, 0) = 0 or v_liquido is distinct from v_linha.valor then
    raise exception 'as parcelas indicadas não somam o valor da linha (% × %)', v_liquido, v_linha.valor;
  end if;

  update pagaleve_parcelas p
     set liquidada_em = v_linha.ocorrido_em, atualizada_em = now()
    from jsonb_to_recordset(p_parcelas) as x(checkout_id text, numero int)
   where p.checkout_id = x.checkout_id and p.numero = x.numero
     and p.liquidada_em is null;

  update lancamentos
     set descricao = 'Repasse Pagaleve – ' || v_qtd || ' parcela' || case when v_qtd > 1 then 's' else '' end,
         categoria = 'Vendas',
         categoria_id = 'vendas',
         valor = v_bruto,
         recebido = v_bruto,
         atualizado_em = now()
   where chave_externa = p_chave and cancelado_em is null;

  if v_tarifa > 0 then
    select c.nome into v_conta_nome from contas_bancarias c where c.id = v_linha.conta_id;
    insert into lancamentos (
      id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
      tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por)
    values (
      'ext-taxa-pagaleve-' || p_chave, v_linha.ocorrido_em,
      date_trunc('month', v_linha.ocorrido_em)::date,
      'Tarifa Pagaleve – repasse de ' || to_char(v_linha.ocorrido_em, 'DD/MM'),
      'Taxas de pagamento', 'taxas-de-pagamento', v_linha.conta_id,
      'saida', v_tarifa, v_tarifa, v_linha.ocorrido_em, false,
      'Extrato ' || coalesce(v_conta_nome, v_linha.conta_id),
      'taxa-pagaleve-' || p_chave, p_operador)
    on conflict (chave_externa) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'parcelas', v_qtd, 'bruto', v_bruto, 'tarifa', v_tarifa);
end;
$function$;

revoke execute on function public.casar_repasse_pagaleve_exato(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.casar_repasse_pagaleve_exato(text, jsonb, text) to service_role;

-- ── 3. A Reserva do Mercado Pago (Porquinho) é uma conta própria ──────────
insert into contas_bancarias (id, nome, tipo, banco, uso, principal, ativa, recebe_repasses)
values ('reserva-mp', 'Reserva Mercado Pago', 'Investimento', 'Mercado Pago',
        'Porquinho (RESERVA) — rende 120% do CDI; aplicar/resgatar é transferência entre contas próprias',
        false, true, false)
on conflict (id) do nothing;

update lancamentos
   set descricao = 'Transferência para a Reserva (Porquinho)',
       categoria = 'Transferências',
       categoria_id = 'transferencias',
       transferencia_id = 'transf-' || chave_externa,
       conta_destino_id = 'reserva-mp',
       aguarda_destino = false,
       favorecido = 'Reserva Mercado Pago',
       observacao = 'Aplicação no Porquinho do Mercado Pago (RESERVA, 120% do CDI) feita em 18/08.',
       atualizado_em = now()
 where id = 'ext-2026-08-18:174535123542:payment:-500000:1'
   and cancelado_em is null;

-- A perna de entrada na Reserva nasce agora (mesma rotina da conversão).
do $do$ begin
  perform * from converter_extrato_em_caixa();
end $do$;
