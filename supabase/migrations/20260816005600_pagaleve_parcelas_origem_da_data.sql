-- A data prevista tem duas procedências, e a diferença importa.
--
-- Em 44 dos 53 créditos já ocorridos, o dinheiro caiu exatamente na data que
-- a Pagaleve tinha informado. A previsão dela é melhor que qualquer conta
-- nossa — então a data informada sempre vence a calculada, e a tela precisa
-- poder dizer qual das duas está mostrando.

alter table public.pagaleve_parcelas
  add column if not exists origem_da_data text not null default 'estimada'
    check (origem_da_data in ('informada', 'estimada')),
  add column if not exists modalidade text
    check (modalidade in ('quinzenal', 'mensal')),
  add column if not exists cliente text,
  add column if not exists pedido_varejista text;

comment on column public.pagaleve_parcelas.origem_da_data is
  'informada = a Pagaleve publicou a data; estimada = calculada pelo ERP enquanto ela não publica.';

-- O a receber por dia, separando o que já passou da data sem dinheiro.
create or replace view public.pagaleve_a_receber as
select
  prevista_para,
  count(*)                        as parcelas,
  count(distinct checkout_id)     as vendas,
  round(sum(liquido), 2)          as liquido,
  (prevista_para < current_date)  as ja_venceu,
  bool_and(origem_da_data = 'informada') as data_confirmada
from public.pagaleve_parcelas
where liquidada_em is null
group by prevista_para
order by prevista_para;
