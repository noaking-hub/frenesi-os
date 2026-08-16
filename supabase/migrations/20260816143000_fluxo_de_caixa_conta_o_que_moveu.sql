-- Espelho da migration aplicada no banco em 16/08/2026.
--
-- O fluxo de caixa descartava dinheiro que se moveu de verdade: só em agosto
-- sumiram R$ 15.187,60. O resultado do período aparecia como +18.117,75 quando
-- o que de fato andou nas contas foi +2.930,15.
--
-- Dois filtros somados:
--
-- 1. `join categorias_financeiras` era INNER. Lançamento com categoria_id nulo
--    caía fora antes de qualquer regra — 101 no banco, sendo 62 conversões do
--    extrato do Mercado Pago que têm o NOME da categoria mas não a chave.
--    "Sem categoria" é a classificar, não é "não aconteceu".
--
-- 2. `impacta_caixa = false` na categoria 'transferencias' está certo para a
--    transferência COM AS DUAS PERNAS: sai de uma conta própria, entra em
--    outra, e contar as duas mexeria no consolidado sem nada ter mudado. O
--    problema é a ÓRFÃ — 64 payouts do Mercado Pago, R$ 29.909,49, convertidos
--    só com a perna de saída. Dinheiro que saiu e não chegou em lugar nenhum é
--    saída; tratá-lo como neutro afirma que o saldo não mudou quando mudou.
create or replace function public.fluxo_de_caixa(p_de date, p_ate date)
returns table(dia date, entradas numeric, saidas numeric, realizado boolean)
language sql
stable
as $function$
  with dias as (select generate_series(p_de, p_ate, '1 day'::interval)::date as dia)
  select
    d.dia,
    coalesce((
      select sum(case when l.baixado_em is not null then l.recebido else l.valor - l.recebido end)
        from lancamentos l
        left join categorias_financeiras c on c.id = l.categoria_id
       where l.tipo = 'entrada' and l.cancelado_em is null
         and (
           coalesce(c.impacta_caixa, true)
           -- O `is not null` na guarda é obrigatório: sem ele a comparação
           -- nunca casa para lançamento comum, o `not exists` vira verdadeiro
           -- e o `or` anula o impacta_caixa de TODA linha.
           or (l.transferencia_id is not null
               and not exists (
                 select 1 from lancamentos o
                  where o.transferencia_id = l.transferencia_id
                    and o.id <> l.id and o.tipo <> l.tipo and o.cancelado_em is null))
         )
         and coalesce(l.baixado_em, l.vence_em) = d.dia
    ), 0)::numeric(12,2) as entradas,
    coalesce((
      select sum(case when l.baixado_em is not null then l.recebido else l.valor - l.recebido end)
        from lancamentos l
        left join categorias_financeiras c on c.id = l.categoria_id
       where l.tipo = 'saida' and l.cancelado_em is null
         and (
           coalesce(c.impacta_caixa, true)
           or (l.transferencia_id is not null
               and not exists (
                 select 1 from lancamentos o
                  where o.transferencia_id = l.transferencia_id
                    and o.id <> l.id and o.tipo <> l.tipo and o.cancelado_em is null))
         )
         and coalesce(l.baixado_em, l.vence_em) = d.dia
    ), 0)::numeric(12,2) as saidas,
    d.dia <= current_date as realizado
  from dias d
  order by d.dia
$function$;
