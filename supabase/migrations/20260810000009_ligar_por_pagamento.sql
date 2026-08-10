-- ═══════════════════════════════════════════════════════════════════════════
-- Ligar a linha do extrato ao pedido pelo id do pagamento.
--
-- Duas fontes falam da mesma venda e cada uma sabe metade:
--
--   Relatório de liberações   sabe QUANDO o dinheiro entrou e QUANTO, e traz
--                             o id do pagamento na coluna SOURCE_ID.
--   Busca de pagamentos       sabe a QUAL PEDIDO o pagamento pertence, porque
--                             lê a referência externa que a loja mandou.
--
-- O id do pagamento é o que as duas têm em comum, e ligá-las por ele é exato.
-- Até aqui a ligação era feita por valor e data, que é um palpite: dois
-- decants de R$ 129,41 no mesmo dia — que é o caso comum, não a exceção —
-- fazem o casamento recusar, e a venda fica na fila "precisam de você" sem ter
-- nada a decidir.
--
-- Ligar por id resolve também o caso lento: quando o pedido só é importado
-- depois, a próxima sincronia liga a linha antiga sem ninguém reprocessar
-- nada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function ligar_extrato_ao_pedido(p_origem text, p_pares jsonb)
returns integer
language plpgsql
as $$
declare
  v_par     jsonb;
  v_ligadas integer := 0;
  v_n       integer;
begin
  if jsonb_typeof(p_pares) <> 'array' then
    raise exception 'os pares pagamento→pedido precisam vir em uma lista';
  end if;

  for v_par in select * from jsonb_array_elements(p_pares) loop
    -- O pedido precisa existir: gravar um id solto quebraria a chave
    -- estrangeira e, pior, faria a linha parecer resolvida.
    update extrato_linhas e
       set pedido_id = v_par ->> 'pedido'
     where e.origem = p_origem
       and e.pedido_id is null
       and e.documento = v_par ->> 'gateway'
       and nullif(e.documento, '') is not null
       and exists (select 1 from pedidos p where p.id = v_par ->> 'pedido');
    get diagnostics v_n = row_count;
    v_ligadas := v_ligadas + v_n;
  end loop;

  return v_ligadas;
end;
$$;

comment on function ligar_extrato_ao_pedido is
  'Liga linhas do extrato ao pedido pelo id do pagamento no gateway. Exato, ao contrário do casamento por valor e data.';
