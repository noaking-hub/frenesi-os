-- Corrigir uma saída lançada à mão, e apagar o lote que já tem uma.
--
-- A saída avulsa é digitada por uma pessoa — "5 ml vendidos antes do ERP" —
-- e quem digita erra: 5 vira 50, o motivo sai trocado, ou a saída foi parar
-- no lote errado. Até agora não havia como desfazer: o número ficava lá,
-- inflando o consumido do lote e distorcendo a perda apurada no encerramento.
--
-- Saída vinda de ORDEM DE PRODUÇÃO continua intocável por aqui. Ela tem
-- contrapartida em decants envasados e em produto derivado; mexer nela pelo
-- extrato do lote deixaria as duas pontas discordando. O caminho de correção
-- daquele caso é outro (a própria ordem).

create or replace function public.editar_saida_lote(
  p_saida_id uuid,
  p_ml       numeric,
  p_motivo   text,
  p_operador text default 'ERP'
) returns numeric
language plpgsql
as $$
declare
  v_saida       lote_saidas%rowtype;
  v_lote        lotes%rowtype;
  v_delta       numeric(12, 2);
  v_consumido   numeric(12, 2);
  v_saldo_lote  numeric(12, 2);
  v_volume_base numeric(12, 2);
  v_saldo       numeric(12, 2);
begin
  if p_ml is null or p_ml <= 0 then
    raise exception 'o volume da saída deve ser maior que zero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'informe o motivo da saída — sem ele a apuração do lote fica sem explicação';
  end if;

  select * into v_saida from lote_saidas where id = p_saida_id for update;
  if not found then
    raise exception 'esta saída não existe mais — a tela pode estar desatualizada';
  end if;
  if v_saida.ordem_id is not null then
    raise exception
      'esta saída veio da ordem de produção % e tem decants envasados do outro lado — corrija pela produção, não pelo extrato do lote',
      v_saida.ordem_id;
  end if;

  select * into v_lote from lotes where id = v_saida.lote_id for update;
  if v_lote.encerrado_em is not null then
    raise exception
      'o lote % já foi encerrado e a perda dele já entrou na conta — o extrato virou histórico',
      v_lote.id;
  end if;

  v_delta := round(p_ml, 2) - v_saida.ml;

  -- Aumentar a saída consome mais do frasco: o saldo teórico precisa aguentar.
  if v_delta > 0 then
    select coalesce(sum(ml), 0) into v_consumido from lote_saidas where lote_id = v_lote.id;
    v_saldo_lote := v_lote.volume_ml - v_consumido;
    if v_delta > v_saldo_lote then
      raise exception
        'o lote % tem % ml de saldo teórico; aumentar esta saída em % ml estouraria o frasco',
        v_lote.id, v_saldo_lote, v_delta;
    end if;

    select volume_ml into v_volume_base from perfumes_base where id = v_lote.base_id for update;
    if v_delta > v_volume_base then
      raise exception
        'a base tem % ml em estoque e a correção pede % ml a mais — acerte pelo Inventário primeiro',
        v_volume_base, v_delta;
    end if;
  end if;

  update lote_saidas
     set ml = round(p_ml, 2),
         motivo = trim(p_motivo)
   where id = p_saida_id;

  -- Só mexe no estoque quando o volume mudou; corrigir o texto do motivo não
  -- é movimentação e não deve virar linha na trilha.
  if v_delta <> 0 then
    update perfumes_base
       set volume_ml = volume_ml - v_delta
     where id = v_lote.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_lote.base_id, 'ajuste', now(), -v_delta, v_lote.id,
      format('Correção de saída lançada à mão · de %s ml para %s ml', v_saida.ml, round(p_ml, 2)),
      coalesce(nullif(trim(p_operador), ''), 'ERP'), v_saldo
    );
  end if;

  select coalesce(sum(ml), 0) into v_consumido from lote_saidas where lote_id = v_lote.id;
  return v_lote.volume_ml - v_consumido;
end;
$$;

comment on function public.editar_saida_lote is
  'Corrige volume e motivo de uma saída lançada à mão, devolvendo ou tirando a diferença do estoque.';

create or replace function public.estornar_saida_lote(
  p_saida_id uuid,
  p_operador text default 'ERP'
) returns numeric
language plpgsql
as $$
declare
  v_saida     lote_saidas%rowtype;
  v_lote      lotes%rowtype;
  v_consumido numeric(12, 2);
  v_saldo     numeric(12, 2);
begin
  select * into v_saida from lote_saidas where id = p_saida_id for update;
  if not found then
    raise exception 'esta saída não existe mais — a tela pode estar desatualizada';
  end if;
  if v_saida.ordem_id is not null then
    raise exception
      'esta saída veio da ordem de produção % — apagá-la deixaria decants envasados sem origem',
      v_saida.ordem_id;
  end if;

  select * into v_lote from lotes where id = v_saida.lote_id for update;
  if v_lote.encerrado_em is not null then
    raise exception 'o lote % já foi encerrado — o extrato dele é histórico', v_lote.id;
  end if;

  delete from lote_saidas where id = p_saida_id;

  -- O líquido volta ao frasco: ele nunca saiu de verdade.
  update perfumes_base
     set volume_ml = volume_ml + v_saida.ml
   where id = v_lote.base_id
   returning volume_ml into v_saldo;

  insert into movimentacoes (
    base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
  ) values (
    v_lote.base_id, 'ajuste', now(), v_saida.ml, v_lote.id,
    format('Estorno de saída lançada à mão · %s', coalesce(v_saida.motivo, 'sem motivo registrado')),
    coalesce(nullif(trim(p_operador), ''), 'ERP'), v_saldo
  );

  select coalesce(sum(ml), 0) into v_consumido from lote_saidas where lote_id = v_lote.id;
  return v_lote.volume_ml - v_consumido;
end;
$$;

comment on function public.estornar_saida_lote is
  'Apaga uma saída lançada à mão e devolve o volume ao estoque.';
