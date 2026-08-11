-- Destinatário recorrente não deveria pedir clique: o motoboy de toda
-- semana, o imposto do estado, a fatura do Google. A regra guarda o padrão
-- de texto e a categoria; a cada importação do extrato as linhas ainda sem
-- destino que casarem com um padrão viram lançamento sozinhas.

create table regras_categoria (
  id        uuid primary key default gen_random_uuid(),
  -- Trecho de texto procurado (sem distinção de maiúsculas) na descrição,
  -- na contraparte, no documento e na resposta crua da origem.
  padrao    text not null,
  categoria text not null references categorias_financeiras (nome),
  criado_em timestamptz not null default now(),
  unique (padrao)
);

-- As categorias que as regras iniciais usam e ainda não existem.
insert into categorias_financeiras (nome, natureza)
values
  ('Embalagens', 'Custo variável'),
  ('Google ADS - Tráfego Pago', 'Despesa'),
  ('Meta ADS - Tráfego Pago', 'Despesa')
on conflict (nome) do nothing;

insert into regras_categoria (padrao, categoria)
values
  ('Ricardo H Souza Mello', 'Motoboy'),
  ('Aline da Silva Carvalho Araujo', 'Embalagens'),
  ('Estado de Minas Gerais', 'Imposto'),
  ('Lithium Software', 'Frete'),
  ('Vindi Pagamentos', 'Frete'),
  ('Google Brasil Internet', 'Google ADS - Tráfego Pago'),
  ('Facebook Serviços Online do Brasil', 'Meta ADS - Tráfego Pago')
on conflict (padrao) do nothing;

/**
 * Classifica sozinha as linhas que casam com alguma regra.
 *
 * Só mexe em linha livre: sem lançamento, não dispensada e sem pedido — a
 * venda conciliada tem dono e a regra não passa por cima. A classificação
 * usa a mesma classificar_extrato do clique manual: um caminho, um
 * comportamento.
 */
create function aplicar_regras_categoria(p_operador text default 'Regra automática')
returns jsonb
language plpgsql
as $$
declare
  v_linha record;
  v_aplicadas integer := 0;
begin
  for v_linha in
    select e.origem, e.chave, r.categoria, r.padrao
      from extrato_linhas e
      join regras_categoria r
        on (e.descricao || ' ' || e.contraparte || ' ' || e.documento || ' ' ||
            coalesce(e.bruto::text, ''))
           ilike '%' || r.padrao || '%'
     where e.lancamento_id is null
       and not e.ignorado
       and e.pedido_id is null
  loop
    perform classificar_extrato(
      v_linha.origem,
      v_linha.chave,
      v_linha.categoria,
      v_linha.padrao,
      p_operador
    );
    v_aplicadas := v_aplicadas + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_aplicadas);
end;
$$;
