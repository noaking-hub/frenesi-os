-- ═══════════════════════════════════════════════════════════════════════════
-- Excluir o lançamento que nunca deveria ter existido.
--
-- O ERP só sabia CANCELAR, e o comentário de `cancelarCompromisso` defende
-- isso com razão: "excluir some com a linha e com a explicação; cancelado some
-- da fila de trabalho e continua respondendo o que aconteceu com aquele
-- boleto". Só que essa frase vale para o compromisso que EXISTIU e morreu — o
-- boleto que foi renegociado, a compra que caiu. Não vale para o erro de
-- digitação.
--
-- O dono tentou lançar compras de cartão parceladas usando "repetir mensal",
-- viu que não era aquilo, e ficou com três linhas erradas no caixa e nenhuma
-- forma de tirá-las: cancelar deixaria três "cancelados" para sempre no
-- histórico, explicando um fato que nunca aconteceu.
--
-- Então: excluir existe, é para engano, e a linha não some sem deixar rastro —
-- ela é copiada inteira para `financeiro_auditoria` antes de morrer. O que a
-- casa não queria perder (a explicação) fica; o que polui a operação (a linha
-- falsa) sai.
--
-- As travas dizem o que NÃO se apaga, e cada uma tem um porquê:
--   · nascido do extrato   → o saldo da conta vem dele; apagar criaria buraco,
--                            e a conversão recriaria a linha na rodada seguinte
--   · amarrado a um pedido → é a perna financeira de uma venda; some o dinheiro
--                            de uma venda que continua existindo
--   · perna de transferência → deixaria a outra ponta órfã, dinheiro saindo de
--                            uma conta e não entrando em nenhuma
--   · competência fechada  → é o mês que já foi para o contador
--   · conciliado no extrato → tem linha de extrato apontando para ele
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.excluir_lancamento(
  p_id text,
  p_operador text default 'ERP',
  p_motivo text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_raiz text;
  v_l lancamentos;
  v_apagados integer := 0;
begin
  if not exists (select 1 from lancamentos where id = p_id) then
    raise exception 'Este lançamento não existe mais.';
  end if;

  -- A série inteira, e não a parcela solta: `parcelar_lancamento` grava as
  -- filhas como `<pai>-1`, `<pai>-2`… e deixa o pai cancelado. Apagar só a
  -- parcela 3 de 6 deixaria um parcelamento que não soma o total — pior que o
  -- engano original.
  v_raiz := p_id;
  if p_id ~ '-[0-9]+$' then
    v_raiz := regexp_replace(p_id, '-[0-9]+$', '');
    if not exists (select 1 from lancamentos where id = v_raiz) then
      v_raiz := p_id;
    end if;
  end if;

  for v_l in
    select * from lancamentos where id = v_raiz or id like v_raiz || '-%'
  loop
    if v_l.origem like 'Extrato %' then
      raise exception 'Este lançamento nasceu do extrato da conta e responde pelo saldo dela. Para tirá-lo do caixa, ignore a linha na tela de Extrato.';
    end if;
    if v_l.pedido_id is not null then
      raise exception 'Este lançamento é o dinheiro do pedido %. Apagá-lo faria a venda existir sem o caixa dela.', v_l.pedido_id;
    end if;
    if v_l.transferencia_id is not null then
      raise exception 'Este lançamento é uma perna de transferência entre contas. Apagar só um lado deixaria o dinheiro saindo de uma conta e não entrando em nenhuma.';
    end if;
    -- Pelo helper da casa, e não comparando as colunas direto:
    -- `competencias_fechadas.competencia` é TEXT ('AAAA-MM') e
    -- `lancamentos.competencia` é DATE. A comparação crua levantava
    -- "operator does not exist: text = date" na cara de quem clicava em
    -- Excluir. `competencia_esta_fechada` é a mesma função que o trigger
    -- `bloquear_competencia_fechada` usa — uma regra, uma implementação.
    if competencia_esta_fechada(v_l.competencia) then
      raise exception 'A competência % está fechada. Reabra o mês antes de mexer nele.', to_char(v_l.competencia, 'MM/YYYY');
    end if;
    if exists (select 1 from extrato_linhas e where e.lancamento_id = v_l.id) then
      raise exception 'Este lançamento está conciliado com uma linha do extrato. Desfaça a conciliação antes de excluir.';
    end if;
  end loop;

  -- O rastro vai ANTES da linha morrer: `to_jsonb(l)` guarda o lançamento
  -- inteiro, com valor, conta, categoria e datas. É o que responde depois
  -- "o que era aquilo que sumiu do dia 20".
  insert into financeiro_auditoria (entidade, entidade_id, acao, valor_anterior, operador, justificativa)
  select 'lancamentos', l.id, 'excluido', to_jsonb(l), p_operador, nullif(trim(coalesce(p_motivo, '')), '')
    from lancamentos l
   where l.id = v_raiz or l.id like v_raiz || '-%';

  delete from lancamentos where id = v_raiz or id like v_raiz || '-%';
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$function$;

revoke all on function public.excluir_lancamento(text, text, text)
  from public, anon, authenticated;
grant execute on function public.excluir_lancamento(text, text, text) to service_role;

comment on function public.excluir_lancamento(text, text, text) is
  'Apaga um lançamento manual lançado por engano, e a série inteira quando ele foi parcelado. Copia cada linha para financeiro_auditoria antes de apagar. Recusa o que nasceu do extrato, o que pertence a um pedido, perna de transferência, mês fechado e o que já está conciliado.';
