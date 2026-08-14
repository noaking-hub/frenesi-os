-- A ordem de produção sai do ERP.
--
-- Ela nunca foi usada: zero ordens em toda a história, zero saídas de lote
-- com origem em produção. E era um risco: o estoque baixa no FATURAMENTO
-- (baixar_estoque_do_pedido), então concluir uma ordem para o mesmo pedido
-- tiraria o mesmo mililitro duas vezes — dois caminhos de baixa para um
-- único evento físico, o envase.
--
-- No lugar entra a Fila de envase, que é DERIVADA das reservas e não
-- escreve nada: ela responde "o que fracionar agora", e quem move o saldo
-- continua sendo o faturamento, uma vez só.

drop function if exists concluir_ordem_producao(text, integer, text);
drop function if exists abrir_ordem_producao(text, smallint, integer, text, text);

-- A tabela está vazia (nenhuma ordem jamais registrada), então não há
-- histórico a preservar. `lote_saidas.ordem_id` fica: ele é texto solto,
-- sem chave estrangeira, e as saídas manuais já o deixam nulo.
drop table if exists ordens_producao;
drop sequence if exists ordens_id_seq;
drop type if exists status_ordem;

-- `recalcular_reservas` lia ordens_producao para descobrir quantas unidades
-- estavam envasadas. Sem produção formal, esse número não tem fonte: o
-- pré-envase, se um dia existir, virá de outro lugar. A função passa a
-- cuidar só do que sobrou — a reserva em ml, que é o que a operação usa.
create or replace function recalcular_reservas()
returns integer
language plpgsql
as $$
declare
  v jsonb;
begin
  -- Reserva de UNIDADE não existe mais: a reserva real é em ml, por pedido.
  update produtos_derivados set reservadas = 0 where reservadas <> 0;

  v := sincronizar_reservas();
  return coalesce((v->>'criadas')::int, 0) + coalesce((v->>'liberadas')::int, 0);
end;
$$;
