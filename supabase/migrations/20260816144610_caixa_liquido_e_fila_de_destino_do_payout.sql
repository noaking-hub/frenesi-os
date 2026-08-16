-- TRÊS DECISÕES DO DONO DA OPERAÇÃO, VIRANDO REGRA.

-- ── 1. A tarifa do gateway não é saída de caixa ────────────────────────────
--
-- Ela nunca saiu da conta: o Mercado Pago credita já descontado. Lançá-la como
-- saída fazia o gráfico dizer "entrou 763,27 e saiu 1.059,43" num dia em que
-- entraram 669,73 e saíram 965,89. A matemática fechava e a leitura mentia.
--
-- A tarifa continua existindo como lançamento — a DRE precisa dela como custo,
-- e a receita bruta precisa continuar bruta. O que muda é só o CAIXA: ela é
-- abatida da entrada, em vez de somada à saída. É o mesmo tratamento que a
-- série do Dashboard já dava, e que o fluxo não dava.
create or replace function public.fluxo_de_caixa(p_de date, p_ate date)
returns table(dia date, entradas numeric, saidas numeric, realizado boolean)
language sql
stable
as $function$
  with dias as (select generate_series(p_de, p_ate, '1 day'::interval)::date as dia),
  -- Um lançamento entra no caixa se a categoria permite, se não tem categoria
  -- (a classificar não é "não aconteceu"), ou se é transferência ÓRFÃ — a que
  -- tem só a perna de saída e portanto tirou dinheiro que não voltou.
  elegiveis as (
    select l.*, coalesce(c.impacta_caixa, true) as categoria_conta
      from lancamentos l
      left join categorias_financeiras c on c.id = l.categoria_id
     where l.cancelado_em is null
  ),
  movimentos as (
    select e.*,
      case when e.baixado_em is not null then e.recebido else e.valor - e.recebido end as quanto,
      coalesce(e.baixado_em, e.vence_em) as quando
      from elegiveis e
     where e.categoria_conta
        or (e.transferencia_id is not null
            and not exists (
              select 1 from lancamentos o
               where o.transferencia_id = e.transferencia_id
                 and o.id <> e.id and o.tipo <> e.tipo and o.cancelado_em is null))
  )
  select
    d.dia,
    coalesce((
      select sum(case when m.tipo = 'entrada' then m.quanto else -m.quanto end)
        from movimentos m
       where m.quando = d.dia
         and (m.tipo = 'entrada' or m.categoria_id = 'taxas-de-pagamento')
    ), 0)::numeric(12,2) as entradas,
    coalesce((
      select sum(m.quanto)
        from movimentos m
       where m.quando = d.dia
         and m.tipo = 'saida' and m.categoria_id is distinct from 'taxas-de-pagamento'
    ), 0)::numeric(12,2) as saidas,
    d.dia <= current_date as realizado
  from dias d
  order by d.dia
$function$;

-- ── 2. A fila de destino dos payouts ───────────────────────────────────────
--
-- O Mercado Pago informa `payout` e nada mais: o Relatório de Liberações não
-- tem coluna de destino. O ERP assumia "transferência para conta própria" e
-- gravava uma perna só — dinheiro que sai do consolidado e não chega em lugar
-- nenhum. São 64 linhas, R$ 29.909,49 em 25 dias, e foi ali que uma despesa
-- real de Meta ADS desapareceu.
--
-- Adivinhar não é opção, então o ERP passa a PERGUNTAR. A coluna marca o que
-- está esperando decisão; a fila mostra; quem sabe responde.
alter table public.lancamentos
  add column if not exists aguarda_destino boolean not null default false;

comment on column public.lancamentos.aguarda_destino is
  'Saída cujo destino o ERP não tem como descobrir — payout de gateway. '
  'Enquanto true, ela conta como saída de caixa (o dinheiro saiu mesmo) e '
  'aparece na fila de destino. Falso depois que alguém disser para onde foi.';

create index if not exists lancamentos_aguarda_destino_idx
  on public.lancamentos (aguarda_destino) where aguarda_destino;

-- Marca as 64 existentes: transferência com perna única, vinda do extrato.
update public.lancamentos l
   set aguarda_destino = true
 where l.transferencia_id is not null
   and l.tipo = 'saida'
   and l.cancelado_em is null
   and l.conta_destino_id is null
   and not exists (
     select 1 from public.lancamentos o
      where o.transferencia_id = l.transferencia_id
        and o.id <> l.id and o.tipo <> l.tipo and o.cancelado_em is null);
