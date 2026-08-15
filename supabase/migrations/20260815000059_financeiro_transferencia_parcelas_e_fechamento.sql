-- Transferência entre contas, parcelamento e trava de competência fechada.
--
-- Os três resolvem o mesmo tipo de erro: dinheiro que muda de lugar sendo
-- contado como resultado. Transferir do Mercado Pago para o Sicoob não é
-- receita nem despesa — e antes desta migração virava as duas coisas, porque
-- o operador lançava uma saída aqui e uma entrada ali sem nada ligando as
-- pontas.

create or replace function registrar_transferencia(
  p_conta_origem text,
  p_conta_destino text,
  p_valor numeric,
  p_data date,
  p_descricao text default 'Transferência entre contas',
  p_operador text default 'ERP'
) returns text
language plpgsql
as $$
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

  select id into v_categoria from categorias_financeiras
   where natureza_gerencial = 'transferencia' limit 1;
  if v_categoria is null then
    insert into categorias_financeiras
      (id, nome, natureza, natureza_gerencial, impacta_dre, impacta_caixa, ativa)
    values
      ('transferencia', 'Transferência entre contas', 'Transferência', 'transferencia', false, true, true)
    returning id into v_categoria;
  end if;

  -- As duas pernas nascem juntas e compartilham `transferencia_id`. É esse
  -- par que permite a DRE ignorar o movimento sem perder o rastro no extrato
  -- de cada conta.
  insert into lancamentos (
    id, ocorrido_em, competencia, vence_em, baixado_em, descricao, categoria,
    categoria_id, conta_id, conta_destino_id, tipo, valor, recebido, origem,
    transferencia_id, criado_por
  ) values (
    v_id || '-S', p_data, p_data, p_data, p_data, p_descricao, 'Transferência entre contas',
    v_categoria, p_conta_origem, p_conta_destino, 'saida', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  ), (
    v_id || '-E', p_data, p_data, p_data, p_data, p_descricao, 'Transferência entre contas',
    v_categoria, p_conta_destino, p_conta_origem, 'entrada', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  );

  return v_id;
end;
$$;

-- O centavo do arredondamento vai na PRIMEIRA parcela, não na última: quem
-- confere o boleto de hoje encontra a diferença agora, e não daqui a 11 meses.
create or replace function parcelar_lancamento(
  p_lancamento_id text,
  p_parcelas smallint,
  p_intervalo_dias int default 30
) returns integer
language plpgsql
as $$
declare
  v_pai record;
  v_valor numeric;
  v_resto numeric;
  v_criadas int := 0;
begin
  select * into v_pai from lancamentos where id = p_lancamento_id;
  if not found then raise exception 'lançamento % não existe', p_lancamento_id; end if;
  if p_parcelas < 2 then raise exception 'parcelamento exige ao menos 2 parcelas'; end if;
  if v_pai.baixado_em is not null then raise exception 'lançamento já baixado não parcela'; end if;

  v_valor := trunc(v_pai.valor / p_parcelas, 2);
  v_resto := v_pai.valor - (v_valor * p_parcelas);

  for i in 1..p_parcelas loop
    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id,
      centro_custo, conta_id, tipo, valor, recebido, origem, favorecido,
      documento, observacao, parcela, parcelas, pai_id, criado_por
    ) values (
      p_lancamento_id || '-' || i,
      v_pai.ocorrido_em,
      v_pai.competencia,
      coalesce(v_pai.vence_em, v_pai.competencia) + ((i - 1) * p_intervalo_dias),
      v_pai.descricao || ' (' || i || '/' || p_parcelas || ')',
      v_pai.categoria, v_pai.categoria_id, v_pai.centro_custo, v_pai.conta_id,
      v_pai.tipo,
      v_valor + case when i = 1 then v_resto else 0 end,
      0, 'Parcelamento', v_pai.favorecido, v_pai.documento, v_pai.observacao,
      i::smallint, p_parcelas, p_lancamento_id, v_pai.criado_por
    );
    v_criadas := v_criadas + 1;
  end loop;

  -- O pai é cancelado, não apagado: sem ele o histórico perderia a origem das
  -- parcelas, e o `pai_id` de cada uma apontaria para o nada.
  update lancamentos
     set cancelado_em = now(),
         cancelado_motivo = 'substituído por ' || p_parcelas || ' parcelas',
         parcelas = p_parcelas
   where id = p_lancamento_id;

  return v_criadas;
end;
$$;

-- Fechar a competência é uma promessa ao contador: os números de agosto não
-- mudam mais. A trava só barra o que altera resultado — baixar um pagamento
-- continua liberado, porque o caixa de setembro não reescreve a DRE de agosto.
create or replace function bloquear_competencia_fechada()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.competencia = new.competencia
     and competencia_esta_fechada(old.competencia)
     and (old.valor is distinct from new.valor
          or old.categoria_id is distinct from new.categoria_id
          or old.tipo is distinct from new.tipo) then
    raise exception 'competência % está fechada — reabra antes de alterar',
      to_char(old.competencia, 'YYYY-MM');
  end if;
  return new;
end;
$$;

drop trigger if exists bloquear_competencia_fechada on lancamentos;
create trigger bloquear_competencia_fechada
  before update on lancamentos
  for each row execute function bloquear_competencia_fechada();
