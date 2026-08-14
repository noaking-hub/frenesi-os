-- Pagamento cancelado/estornado ANTES do envio cancela a operação também.
--
-- O caso real: pedido de R$ 1.041 aprovado e cancelado em seguida na Yampi.
-- O ERP marcou o pagamento como divergente (saiu da receita, do CRM e dos
-- relatórios) — mas a situação operacional seguia "pago", e o pedido ficou
-- na fila de expedição com SLA correndo, a um clique de ser despachado de
-- graça. Divergente é veredito FINANCEIRO; quem tira o pedido da esteira é
-- a situação operacional, e ela não estava ouvindo.
--
-- A regra: dinheiro devolvido + nada despachado = cancelado. Quem já foi
-- enviado ou entregue não entra — a mercadoria está na rua, e esse caso é
-- de ocorrência/devolução, não de cancelamento retroativo.
create or replace function marcar_estornados() returns integer
language plpgsql
as $$
declare
  v_marcados integer;
begin
  with alvo as (
    update pedidos p
       set pagamento = 'divergente'
     where p.canal = 'yampi'
       and p.pagamento = 'pago'
       and (
         exists (
           select 1 from extrato_linhas e
            where e.pedido_id = p.id
              and e.tipo = 'saida'
              and (e.descricao ilike '%estorno%'
                   or e.descricao ilike '%chargeback%'
                   or e.descricao ilike '%devolu%')
         )
         or exists (
           select 1 from pedido_transacoes t
            where t.pedido_id = p.id
              and (t.status ilike '%refund%'
                   or t.status ilike '%estorn%'
                   or t.status ilike '%chargeback%'
                   or t.status ilike '%devolv%')
         )
       )
     returning p.id
  )
  select count(*) into v_marcados from alvo;

  -- O segundo passo roda em TODA importação, então pega também o pedido cujo
  -- pagamento o importador já graduou como divergente/cancelado direto.
  update pedidos
     set situacao = 'cancelado'
   where pagamento in ('divergente', 'cancelado')
     and situacao in ('pago', 'em_producao', 'faturado')
     and envio in ('nao_iniciado', 'aguardando_envio');

  return v_marcados;
end;
$$;

-- Repara agora os 4 que estavam na esteira com o dinheiro já devolvido.
select marcar_estornados();
