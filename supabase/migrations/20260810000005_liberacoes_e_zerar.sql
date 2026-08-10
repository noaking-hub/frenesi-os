-- ═══════════════════════════════════════════════════════════════════════════
-- Zerar o financeiro para recomeçar de uma fonte melhor.
--
-- A primeira leitura do extrato veio da busca de pagamentos, que não enxerga
-- saque nem transferência. Não há como corrigir linha a linha o que foi lido
-- de uma fonte incompleta — recomeçar é mais honesto que remendar.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Apaga extrato, lançamentos nascidos dele e a conciliação dos repasses.
 *
 * O que NÃO toca, de propósito:
 *  - pedidos, que são a receita e vêm da Yampi;
 *  - lançamentos digitados à mão, que ninguém mais reconstrói;
 *  - a linha do repasse em si; só o que foi conciliado nela.
 *
 * Devolve o que apagou, para a tela mostrar em vez de dizer "pronto".
 */
create function zerar_financeiro(p_confirmacao text)
returns jsonb
language plpgsql
as $$
declare
  v_extrato     integer;
  v_lancamentos integer;
  v_repasses    integer;
begin
  -- Uma palavra digitada separa "quero recomeçar" de um clique errado.
  if p_confirmacao <> 'ZERAR' then
    raise exception 'confirmação ausente: para zerar o financeiro, informe ZERAR';
  end if;

  update repasses
     set recebido = null, creditado_em = null, gateway_id = null,
         bruto_gateway = null, taxa_real = null, conciliado_por = null
   where recebido is not null;
  get diagnostics v_repasses = row_count;

  delete from lancamentos where origem like 'Extrato %';
  get diagnostics v_lancamentos = row_count;

  -- WHERE explícito em tudo: o Supabase mantém a proteção `safeupdate`, que
  -- recusa DELETE e UPDATE sem filtro. A proteção está certa — apagar tabela
  -- inteira sem dizer o que se apaga é o acidente que ela existe para
  -- impedir —, então o filtro é escrito, não contornado.
  delete from extrato_linhas where chave is not null;
  get diagnostics v_extrato = row_count;

  update contas_bancarias
     set saldo_informado = null, saldo_a_liberar = null, saldo_informado_em = null
   where saldo_informado is not null or saldo_informado_em is not null;

  return jsonb_build_object(
    'extrato', v_extrato,
    'lancamentos', v_lancamentos,
    'repasses', v_repasses
  );
end;
$$;

comment on function zerar_financeiro is
  'Apaga extrato, lançamentos vindos dele e a conciliação dos repasses. Não toca em pedidos nem em lançamento manual.';
