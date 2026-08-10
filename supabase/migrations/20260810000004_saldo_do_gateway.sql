-- ═══════════════════════════════════════════════════════════════════════════
-- O saldo é o que a conta diz que é.
--
-- Lição cara desta integração: somar pagamentos NÃO dá saldo. A busca de
-- pagamentos do Mercado Pago lista PAGAMENTOS RECEBIDOS — saque para o
-- banco, transferência, Pix enviado e conta paga não são pagamentos
-- recebidos e não aparecem nela.
--
-- Somando quase só o que entra, o ERP mostrou R$ 83.147,57 numa conta que
-- tinha R$ 10.788,55. A diferença é o dinheiro que saiu para o Sicoob e para
-- pagamentos — e que o extrato de pagamentos nunca ia mostrar.
--
-- Agora, quando a conta informa o próprio saldo, é ELE que vale. A nossa
-- soma vira o que sempre foi: leitura parcial, boa para explicar as vendas,
-- incapaz de fechar caixa sozinha. E a tela diz qual dos dois está vendo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table contas_bancarias
  add column if not exists saldo_informado    numeric(14, 2),
  add column if not exists saldo_a_liberar    numeric(14, 2),
  add column if not exists saldo_informado_em timestamptz;

comment on column contas_bancarias.saldo_informado is
  'Saldo que a própria conta informou. Quando existe, é ele que vale — nossa soma é parcial.';

create function registrar_saldo_conta(
  p_conta_id   text,
  p_disponivel numeric,
  p_a_liberar  numeric
) returns void
language plpgsql
as $$
begin
  update contas_bancarias
     set saldo_informado = p_disponivel,
         saldo_a_liberar = coalesce(p_a_liberar, 0),
         saldo_informado_em = now()
   where id = p_conta_id;

  if not found then
    raise exception 'conta % não existe', p_conta_id;
  end if;
end;
$$;

drop view if exists contas_conferencia;
drop view if exists contas_saldo cascade;

create view contas_saldo as
with do_extrato as (
  select conta_id,
         coalesce(sum(valor) filter (where tipo = 'entrada'), 0) as entradas,
         coalesce(sum(valor) filter (where tipo = 'saida'), 0)   as saidas,
         coalesce(sum(valor) filter (where tipo = 'entrada'
                    and ocorrido_em >= date_trunc('month', current_date)), 0) as entradas_mes,
         coalesce(sum(valor) filter (where tipo = 'saida'
                    and ocorrido_em >= date_trunc('month', current_date)), 0) as saidas_mes,
         count(*) as linhas
    from extrato_linhas
   where not ignorado
   group by conta_id
),
-- Lançamento nascido do extrato já está contado acima. Contar de novo
-- dobraria toda venda no dia em que ela fosse classificada.
manuais as (
  select conta_id,
         coalesce(sum(valor) filter (where tipo = 'entrada' and baixado_em is not null), 0) as entradas,
         coalesce(sum(valor) filter (where tipo = 'saida'   and baixado_em is not null), 0) as saidas,
         coalesce(sum(valor) filter (where tipo = 'entrada'
                    and baixado_em >= date_trunc('month', current_date)), 0) as entradas_mes,
         coalesce(sum(valor) filter (where tipo = 'saida'
                    and baixado_em >= date_trunc('month', current_date)), 0) as saidas_mes
    from lancamentos
   where origem not like 'Extrato %'
   group by conta_id
)
select
  c.id, c.nome, c.tipo, c.banco, c.uso, c.principal, c.ativa,
  coalesce(
    c.saldo_informado,
    coalesce(e.entradas, 0) + coalesce(m.entradas, 0)
      - coalesce(e.saidas, 0) - coalesce(m.saidas, 0)
  ) as saldo,
  c.saldo_informado,
  c.saldo_a_liberar,
  c.saldo_informado_em,
  coalesce(e.entradas, 0) + coalesce(m.entradas, 0)
    - coalesce(e.saidas, 0) - coalesce(m.saidas, 0) as movimento_lido,
  coalesce(e.entradas_mes, 0) + coalesce(m.entradas_mes, 0) as entradas_mes,
  coalesce(e.saidas_mes, 0)   + coalesce(m.saidas_mes, 0)   as saidas_mes,
  coalesce(e.linhas, 0) as linhas_extrato
from contas_bancarias c
left join do_extrato e on e.conta_id = c.id
left join manuais    m on m.conta_id = c.id;

comment on view contas_saldo is
  'Saldo da conta. O informado pelo gateway vale; a nossa soma é leitura parcial.';

create view contas_conferencia as
select
  c.id, c.nome, c.banco, c.saldo, c.saldo_informado, c.movimento_lido,
  coalesce(sum(e.valor) filter (where e.tipo = 'entrada' and not e.ignorado), 0)
    - coalesce(sum(e.valor) filter (where e.tipo = 'saida' and not e.ignorado), 0) as saldo_extrato,
  count(e.*) filter (
    where e.lancamento_id is null and not e.ignorado
      and (e.tipo = 'saida' or e.pedido_id is null)
  ) as a_classificar,
  count(e.*) as linhas_lidas,
  max(e.ocorrido_em) as ultima_leitura
from contas_saldo c
left join extrato_linhas e on e.conta_id = c.id
group by c.id, c.nome, c.banco, c.saldo, c.saldo_informado, c.movimento_lido;
