-- CONCILIAÇÃO IMPOSSÍVEL TEM DE TER NOME
--
-- Sobraram 79 vendas de 22/05 a 08/06, R$ 14.534,73, que nunca vão conciliar:
-- são anteriores a 09/06, dia em que a conta do gateway foi aberta. Não existe
-- extrato desse período em lugar nenhum — nem no gateway antigo, que ainda não
-- existia, nem no Mercado Pago, que só começou em 22/07. O dinheiro entrou; o
-- comprovante não existe mais.
--
-- Deixá-las como "pago sem crédito" seria mentir duas vezes: sugere que falta
-- fazer algo, e mistura o impossível com o pendente de verdade. Marcá-las como
-- conciliadas seria pior — inventaria uma conferência que ninguém fez.
--
-- Daí a dispensa: um estado próprio, com data e MOTIVO escrito. Sai da fila de
-- trabalho, continua contando no faturamento, e quem abrir daqui a um ano lê
-- por que ela está ali em vez de deduzir.
alter table repasses add column if not exists dispensado_em timestamptz;
alter table repasses add column if not exists dispensa_motivo text;

comment on column repasses.dispensa_motivo is
  'Por que esta venda não pode ser conciliada. Preenchido junto com dispensado_em.';

-- Dispensa o que é anterior ao primeiro extrato disponível da operação.
--
-- O corte não é escolhido: é a data do movimento mais antigo que existe em
-- `extrato_linhas`. Se um dia entrar extrato mais velho, o corte anda sozinho
-- e estas vendas voltam a ser conciliáveis pela rotina normal.
create or replace function dispensar_conciliacao_sem_extrato()
returns table (dispensados integer, corte date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte date;
  v_n integer;
begin
  select min(ocorrido_em) into v_corte from extrato_linhas where not ignorado;
  if v_corte is null then
    return query select 0, null::date;
    return;
  end if;

  update repasses r
     set dispensado_em = now(),
         dispensa_motivo = 'Anterior a ' || to_char(v_corte, 'DD/MM/YYYY')
                        || ', primeiro dia com extrato disponível'
    from pedidos p
   where p.id = r.pedido_id
     and r.recebido is null
     and r.dispensado_em is null
     and (p.comprado_em at time zone 'America/Sao_Paulo')::date < v_corte;
  get diagnostics v_n = row_count;

  return query select v_n, v_corte;
end;
$$;
