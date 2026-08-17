-- O repasse da Pagaleve chegava ao caixa sem nome e sem dono.
--
-- A Pagaleve é Pix parcelado: o cliente divide em até 4x com 15 dias entre
-- parcelas, e o dinheiro chega em DEPÓSITOS AGRUPADOS que não correspondem a
-- nenhum pedido — o depósito de um dia soma parcelas de vendas diferentes. O
-- ERP importa as vendas e o cronograma de parcelas desde sempre; o que faltava
-- era a outra ponta, a do dinheiro.
--
-- Sem ela, cada depósito caía no extrato do Mercado Pago como "Venda recebida"
-- sem pedido, virava um lançamento chamado "Crédito a classificar" e ficava
-- FORA da DRE. Medido antes do conserto: 12 depósitos, R$ 984,29, casando ao
-- centavo com a soma das parcelas previstas para o mesmo dia.
--
--   17/08  R$ 172,28  ← 3 parcelas    13/08  R$  72,48  ← 2 parcelas
--   14/08  R$  61,93  ← 2 parcelas    12/08  R$  80,31  ← 2 parcelas
--   04/08  R$ 172,76  ← 6 parcelas    …
--
-- O casamento é por VALOR EXATO e DATA: o depósito do dia é a soma dos
-- líquidos das parcelas previstas para aquele dia. Não é heurística frouxa —
-- são doze acertos ao centavo em doze tentativas.
--
-- A trava contra repetir é o ESTADO DO LANÇAMENTO: só entra quem ainda está
-- sem categoria. A primeira versão desta função usava "parcela ainda em
-- aberto" como trava, e errou por uma razão instrutiva — a baixa do recebível
-- já funcionava, e roda antes. Quando o lançamento chega aqui, a parcela
-- correspondente há muito foi liquidada; usar isso como condição só alcançava
-- o depósito do próprio dia e deixava os onze anteriores exatamente como
-- estavam. A pergunta certa não é "o recebível está aberto?", é "este dinheiro
-- já tem nome?".
--
-- A venda entra pelo BRUTO e a tarifa sai como despesa, exatamente como o
-- conversor já faz com a venda do Mercado Pago. O efeito no saldo da conta é o
-- líquido, que é o que de fato entrou; a diferença é que a tarifa passa a ser
-- visível em vez de embutida numa receita menor.
create or replace function public.casar_repasses_pagaleve()
returns table(repasses integer, parcelas_baixadas integer, valor numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_baixadas integer;
  v_repasses integer := 0;
  v_parcelas integer := 0;
  v_valor numeric := 0;
begin
  for r in
    select e.chave, e.ocorrido_em, e.conta_id, e.valor, c.nome as conta_nome,
           p.qtd, p.bruto, p.tarifa
    from extrato_linhas e
    join contas_bancarias c on c.id = e.conta_id
    join (
      select prevista_para,
             count(*)               as qtd,
             round(sum(bruto), 2)   as bruto,
             round(sum(tarifa), 2)  as tarifa,
             round(sum(liquido), 2) as liquido
      from pagaleve_parcelas
      where liquido <> 0
      group by prevista_para
    ) p on p.prevista_para = e.ocorrido_em and p.liquido = e.valor
    -- Só o dinheiro que ainda não tem nome. É esta condição que impede a
    -- função de reescrever, na rodada seguinte, o que ela mesma classificou.
    join lancamentos l on l.chave_externa = e.chave
                      and l.cancelado_em is null
                      and l.categoria_id is null
    where e.tipo = 'entrada'
      and e.pedido_id is null
      and not e.ignorado
    order by e.ocorrido_em
  loop
    -- Fecha o recebível, se ainda houver o que fechar. A importação da
    -- Pagaleve normalmente já baixou; quando o depósito chega antes dela, esta
    -- é a baixa.
    update pagaleve_parcelas
       set liquidada_em = r.ocorrido_em
     where prevista_para = r.ocorrido_em and liquidada_em is null and liquido <> 0;
    get diagnostics v_baixadas = row_count;

    -- O lançamento deixa de ser "Crédito a classificar" e vira a venda que ele
    -- sempre foi, pelo bruto.
    update lancamentos
       set descricao = 'Repasse Pagaleve – ' || r.qtd || ' parcela'
                       || case when r.qtd > 1 then 's' else '' end,
           categoria = 'Vendas',
           categoria_id = 'vendas',
           valor = r.bruto,
           recebido = r.bruto,
           atualizado_em = now()
     where chave_externa = r.chave and cancelado_em is null;

    -- A tarifa da Pagaleve, com chave própria — mesma forma da tarifa do
    -- gateway no conversor, para o `on conflict` proteger a repetição.
    if r.tarifa > 0 then
      insert into lancamentos (
        id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
        tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por)
      values (
        'ext-taxa-pagaleve-' || r.chave, r.ocorrido_em,
        date_trunc('month', r.ocorrido_em)::date,
        'Tarifa Pagaleve – repasse de ' || to_char(r.ocorrido_em, 'DD/MM'),
        'Taxas de pagamento', 'taxas-de-pagamento', r.conta_id,
        'saida', r.tarifa, r.tarifa, r.ocorrido_em, false,
        'Extrato ' || r.conta_nome, 'taxa-pagaleve-' || r.chave, 'conversão automática')
      on conflict (chave_externa) do nothing;
    end if;

    v_repasses := v_repasses + 1;
    v_parcelas := v_parcelas + v_baixadas;
    v_valor := v_valor + r.valor;
  end loop;

  return query select v_repasses, v_parcelas, round(v_valor, 2);
end
$function$;

comment on function public.casar_repasses_pagaleve() is
  'Casa o depósito da Pagaleve no extrato com a soma das parcelas previstas do dia: baixa o recebível e nomeia o lançamento, que antes ficava como "Crédito a classificar" fora da DRE.';
