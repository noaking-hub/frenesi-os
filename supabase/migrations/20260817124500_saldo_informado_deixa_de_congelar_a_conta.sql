-- O saldo informado congelava a conta para sempre.
--
-- A view calculava assim:
--
--   saldo_disponivel = COALESCE(saldo_informado, <soma dos lançamentos baixados>)
--
-- COALESCE, não soma. No instante em que alguém informava um saldo manual,
-- aquela conta parava naquele número e nenhum lançamento — de ontem, de hoje ou
-- de daqui a um mês — voltava a mexer nele. A tela exibia lado a lado
-- "SAÍDAS (30D) R$ 965,89" e um saldo que não sentiu essas saídas.
--
-- Três das quatro contas ativas estão em modo informado (Inter, Sicoob, Rafael
-- PF); só o Mercado Pago é calculado. Ou seja: o SALDO CONSOLIDADO do topo do
-- Financeiro, e o LIVRE DEPOIS DE PAGAR que sai dele, eram três números
-- congelados somados a um vivo.
--
-- O conserto NÃO é trocar COALESCE por soma cega. Saldo informado existe porque
-- o ERP não tem o histórico inteiro daquele banco: o Inter tem R$ 29.355,45 de
-- movimento conhecido e saldo real de R$ 915,76, e somar as duas coisas seria
-- inventar vinte e oito mil reais. O informado é um PONTO DE PARTIDA, e o que
-- falta é o ERP saber a partir de QUANDO ele vale.
--
-- Daí a coluna nova. `saldo_informado_em` é a hora do clique — dado de
-- auditoria, não de negócio. `saldo_informado_para` é a DATA A QUE O SALDO SE
-- REFERE, escolhida por quem informa: "no fechamento de 15/08 eu tinha
-- R$ 2.622,38". Tudo que foi baixado DEPOIS dessa data soma por cima.
--
-- A distinção não é preciosismo. Sem ela, informar o saldo hoje de manhã e
-- lançar à tarde um pagamento de ontem dá um resultado indefensável: pela hora
-- do clique o pagamento é "anterior" e some; pela intenção de quem digitou,
-- ele deveria descontar. Com a data de referência explícita, quem responde é o
-- dono do dinheiro, não um carimbo de relógio.
alter table public.contas_bancarias
  add column if not exists saldo_informado_para date;

comment on column public.contas_bancarias.saldo_informado_para is
  'A data A QUE o saldo informado se refere (fechamento do dia). Movimentos '
  'baixados DEPOIS dela somam por cima. Diferente de saldo_informado_em, que é '
  'só a hora em que alguém clicou em salvar.';

-- Preenche o que já existe com a data do clique. É a leitura conservadora:
-- mantém cada conta exatamente no número que ela mostra hoje, e ninguém vê
-- saldo mudar sozinho por causa desta migration. Quem quiser que o histórico
-- volte a contar muda a data na tela, que é uma decisão de negócio.
update public.contas_bancarias
   set saldo_informado_para = (saldo_informado_em at time zone 'America/Sao_Paulo')::date
 where saldo_informado is not null
   and saldo_informado_em is not null
   and saldo_informado_para is null;

create or replace view public.saldos_das_contas as
select
  id, nome, tipo, banco, uso, finalidade, principal, ativa, origem_saldo,
  sincronizado_em, sincronizacao_status, cor,
  coalesce(saldo_informado, 0::numeric)::numeric(12,2) as saldo_informado,
  coalesce(saldo_a_liberar, 0::numeric)::numeric(12,2) as saldo_a_liquidar,
  coalesce(saldo_bloqueado, 0::numeric)::numeric(12,2) as saldo_bloqueado,

  -- O ledger inteiro, sem o informado. Continua servindo à tela que compara
  -- "o que o ERP viu" com "o que o banco diz" — é dessa diferença que sai o
  -- alerta de conta desencontrada.
  coalesce((select sum(case when l.tipo = 'entrada' then l.recebido else -l.recebido end)
              from lancamentos l
             where l.conta_id = c.id and l.baixado_em is not null and l.cancelado_em is null), 0)::numeric(12,2)
    as saldo_calculado,

  -- O saldo que a operação usa para decidir.
  --
  -- Sem informado: o ledger, como sempre foi.
  -- Com informado: o ponto de partida MAIS tudo que foi baixado depois da data
  -- de referência. `> saldo_informado_para` é estrito de propósito — o saldo é
  -- o de FECHAMENTO daquele dia, então o que aconteceu no próprio dia já está
  -- dentro dele. Usar `>=` contaria duas vezes o movimento da data informada.
  case
    when c.saldo_informado is null then
      coalesce((select sum(case when l.tipo = 'entrada' then l.recebido else -l.recebido end)
                  from lancamentos l
                 where l.conta_id = c.id and l.baixado_em is not null and l.cancelado_em is null), 0)
    else
      c.saldo_informado
      + coalesce((select sum(case when l.tipo = 'entrada' then l.recebido else -l.recebido end)
                    from lancamentos l
                   where l.conta_id = c.id and l.cancelado_em is null
                     and l.baixado_em is not null
                     -- Referência nula (conta antiga que nunca passou pela tela
                     -- nova) não pode virar "conta tudo desde o começo": isso
                     -- somaria o histórico inteiro por cima do informado e
                     -- inflaria o caixa. Sem data, nada soma — e a tela mostra
                     -- o pedido para informá-la.
                     and c.saldo_informado_para is not null
                     and l.baixado_em > c.saldo_informado_para), 0)
  end::numeric(12,2) as saldo_disponivel,

  coalesce((select sum(l.recebido) from lancamentos l
             where l.conta_id = c.id and l.tipo = 'entrada'
               and l.baixado_em >= (current_date - 30) and l.cancelado_em is null), 0)::numeric(12,2)
    as entradas_30d,
  coalesce((select sum(l.recebido) from lancamentos l
             where l.conta_id = c.id and l.tipo = 'saida'
               and l.baixado_em >= (current_date - 30) and l.cancelado_em is null), 0)::numeric(12,2)
    as saidas_30d,

  -- As duas colunas novas existem para a TELA poder explicar o número em vez de
  -- só exibi-lo. "Registro manual" não dizia nada; "Saldo de 15/08 · 3
  -- movimentos desde então" diz de onde vem cada centavo — e é o que teria
  -- evitado este bug passar meses sem ser notado.
  saldo_informado_para,
  (select count(*) from lancamentos l
    where l.conta_id = c.id and l.cancelado_em is null
      and l.baixado_em is not null
      and c.saldo_informado_para is not null
      and l.baixado_em > c.saldo_informado_para)::integer as movimentos_desde_o_informado
from contas_bancarias c;

alter view public.saldos_das_contas set (security_invoker = on);

comment on view public.saldos_das_contas is
  'Saldo por conta. Conta com saldo informado parte dele e soma o que foi '
  'baixado DEPOIS de saldo_informado_para; conta sem informado usa o ledger '
  'inteiro. Antes era COALESCE — o informado congelava a conta para sempre.';
