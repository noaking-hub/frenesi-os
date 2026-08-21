-- ═══════════════════════════════════════════════════════════════════════════
-- "Transferir entre contas" nunca funcionou.
--
-- O botão abre, o modal calcula os saldos futuros certinho, e ao confirmar
-- devolve isto:
--
--   new row for relation "categorias_financeiras" violates check constraint
--   "categorias_financeiras_natureza_check"
--
-- ── O caminho até o erro ───────────────────────────────────────────────────
--
-- `registrar_transferencia` começa procurando a categoria da transferência
-- assim:
--
--   select id from categorias_financeiras where natureza_gerencial = 'transferencia'
--
-- Nenhuma linha tem esse valor. A categoria existe — é `transferencias`, a
-- mesma que as 8 pernas de transferência já gravadas usam — mas está marcada
-- como `despesa_administrativa`. A busca não a enxerga.
--
-- Não achando, a função cai no ramo que CRIA a categoria, com
-- `natureza = 'Transferência'`. E o CHECK da tabela aceita quatro valores:
-- Receita, Custo variável, Despesa fixa, Despesa. 'Transferência' não é um
-- deles. A transação inteira morre ali.
--
-- Os dois defeitos se cobriam: enquanto o rótulo da categoria estivesse
-- errado a função sempre cairia no insert, e enquanto o insert fosse inválido
-- ninguém veria que o rótulo estava errado.
--
-- ── Por que passou despercebido ────────────────────────────────────────────
--
-- As transferências que existem no banco nasceram de migração, escritas em
-- SQL direto — o Porquinho do Mercado Pago, os payouts redirecionados. Pela
-- tela, nenhuma. O botão estava lá desde o começo e nunca completou uma.
--
-- ── O conserto ────────────────────────────────────────────────────────────
--
-- 1. `transferencias` recebe a natureza gerencial que sempre foi a dela.
--    Transferência não é despesa administrativa: dinheiro que muda de bolso
--    não é gasto, e o enum tem o valor exato para isso.
--
-- 2. A função passa a procurar primeiro pelo id conhecido e só depois pelo
--    rótulo, e o insert de emergência usa uma natureza que o CHECK aceita.
--    'Despesa' é o valor menos errado dos quatro permitidos, e ele não decide
--    nada: quem tira a transferência da DRE é `impacta_dre = false`.
--
-- `impacta_caixa` fica como está, em false. A transferência já é excluída do
-- fluxo por `transferencia_id`, e `saldo_disponivel` soma o que foi baixado
-- sem olhar essa coluna — então as duas pernas mexem no saldo das duas contas
-- normalmente, que é o comportamento desejado.
-- ═══════════════════════════════════════════════════════════════════════════

update categorias_financeiras
   set natureza_gerencial = 'transferencia',
       natureza = 'Despesa'
 where id = 'transferencias';

create or replace function registrar_transferencia(
  p_conta_origem text,
  p_conta_destino text,
  p_valor numeric,
  p_data date,
  p_descricao text default 'Transferência entre contas',
  p_operador text default 'ERP'
) returns text
language plpgsql
as $function$
declare
  v_id text := 'TR-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_categoria text;
begin
  if p_conta_origem = p_conta_destino then
    raise exception 'origem e destino são a mesma conta';
  end if;
  if p_valor <= 0 then
    raise exception 'valor da transferência precisa ser positivo';
  end if;

  -- O id conhecido primeiro: é ele que as transferências já gravadas usam, e
  -- procurar só pelo rótulo gerencial fazia a função ignorar a própria
  -- categoria da casa quando o rótulo estivesse fora do lugar.
  select id into v_categoria from categorias_financeiras where id = 'transferencias';

  if v_categoria is null then
    select id into v_categoria from categorias_financeiras
     where natureza_gerencial = 'transferencia' and ativa
     order by id
     limit 1;
  end if;

  if v_categoria is null then
    insert into categorias_financeiras
      (id, nome, natureza, natureza_gerencial, impacta_dre, impacta_caixa, ativa)
    values
      -- 'Despesa' porque o CHECK da coluna só aceita quatro valores e nenhum
      -- deles descreve uma transferência. O rótulo que vale é o gerencial; o
      -- que tira isto da DRE é `impacta_dre = false`, logo ao lado.
      ('transferencias', 'Transferências', 'Despesa', 'transferencia', false, false, true)
    returning id into v_categoria;
  end if;

  insert into lancamentos (
    id, ocorrido_em, competencia, vence_em, baixado_em, descricao, categoria,
    categoria_id, conta_id, conta_destino_id, tipo, valor, recebido, origem,
    transferencia_id, criado_por
  ) values (
    v_id || '-S', p_data, p_data, p_data, p_data, p_descricao, 'Transferências',
    v_categoria, p_conta_origem, p_conta_destino, 'saida', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  ), (
    v_id || '-E', p_data, p_data, p_data, p_data, p_descricao, 'Transferências',
    v_categoria, p_conta_destino, p_conta_origem, 'entrada', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  );

  return v_id;
end;
$function$;

comment on function registrar_transferencia(text, text, numeric, date, text, text) is
  'Grava as duas pernas ligadas de uma transferência entre contas próprias. A categoria é `transferencias`, fora da DRE — dinheiro que muda de bolso não é resultado.';
