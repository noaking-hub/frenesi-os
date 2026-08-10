-- ═══════════════════════════════════════════════════════════════════════════
-- Reler e religar: consertar uma LEITURA errada.
--
-- A importação do extrato é idempotente pela chave do fato, que é a coisa
-- certa enquanto o fato não muda. Mas quando a nossa LEITURA estava errada —
-- direção do dinheiro trocada, campo lido do lugar errado —, ressincronizar
-- não conserta nada: a linha já existe e é preservada.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Apaga o que foi lido e ainda não virou nada, para reler do zero.
 *
 * Só alcança o que não carrega trabalho humano: linha já classificada ou
 * dispensada fica. Se o conserto precisar chegar nelas, é decisão consciente
 * de quem desfaz o lançamento antes.
 */
create function descartar_leitura(p_origem text, p_conta_id text)
returns integer
language plpgsql
as $$
declare
  v_apagadas integer;
begin
  delete from extrato_linhas
   where origem = p_origem
     and conta_id = p_conta_id
     and lancamento_id is null
     and not ignorado;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

comment on function descartar_leitura is
  'Apaga linhas ainda não classificadas de uma origem, para reler do zero quando a leitura estava errada.';

/**
 * Liga uma linha de extrato ao pedido descoberto depois.
 *
 * O caso real: a linha de fevereiro não achou pedido porque o pedido de
 * fevereiro ainda não tinha sido importado. Sem isto, a única saída seria
 * apagar e reler o extrato inteiro só para refazer o casamento.
 */
create function religar_extrato(p_origem text, p_chave text, p_pedido_id text)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'pedido % não existe', p_pedido_id;
  end if;

  update extrato_linhas
     set pedido_id = p_pedido_id
   where origem = p_origem and chave = p_chave and pedido_id is null;
end;
$$;

comment on function religar_extrato is
  'Liga a linha ao pedido importado depois da leitura. Não sobrescreve ligação existente.';
