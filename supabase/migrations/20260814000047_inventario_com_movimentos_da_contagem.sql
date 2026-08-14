-- Fase 4: o inventário passa a considerar o que se moveu DURANTE a contagem.
--
-- O modelo antigo congelava o saldo na abertura e comparava o contado contra
-- esse número. Se um pedido fosse faturado enquanto alguém contava a
-- prateleira, o ml saía do sistema e não da mão de quem contava: aparecia
-- divergência que não existia, e o ajuste "corrigia" o saldo para um valor
-- errado.
--
-- Agora:
--   esperado = snapshot + movimentos ocorridos depois do snapshot
--   divergência = contado − esperado
--
-- O snapshot continua guardado: é ele que dá a referência auditável de onde
-- a contagem começou.

-- Recriada do zero: a view antiga tinha outra ordem de colunas, e o
-- Postgres não deixa um `create or replace` renomear coluna existente.
drop view if exists inventario_apuracao;
create view inventario_apuracao as
select
  c.inventario_id,
  c.base_id,
  b.nome as perfume,
  c.sistema_ml,
  -- Só o que mexe no FÍSICO entra: reserva e liberação não tiram líquido do
  -- frasco e não podem alterar o que a contagem deveria encontrar.
  coalesce((
    select sum(m.volume_ml)
      from movimentacoes m
     where m.base_id = c.base_id
       and m.tipo in ('entrada', 'saida', 'ajuste', 'devolucao', 'perda', 'estorno')
       and m.ocorrida_em > i.aberto_em
       and (i.fechado_em is null or m.ocorrida_em <= i.fechado_em)
  ), 0) as movimentos_ml,
  c.sistema_ml + coalesce((
    select sum(m.volume_ml)
      from movimentacoes m
     where m.base_id = c.base_id
       and m.tipo in ('entrada', 'saida', 'ajuste', 'devolucao', 'perda', 'estorno')
       and m.ocorrida_em > i.aberto_em
       and (i.fechado_em is null or m.ocorrida_em <= i.fechado_em)
  ), 0) as esperado_ml,
  c.contado_ml,
  c.responsavel,
  c.contado_em,
  case when c.contado_ml is null then null
       else c.contado_ml - (c.sistema_ml + coalesce((
         select sum(m.volume_ml)
           from movimentacoes m
          where m.base_id = c.base_id
            and m.tipo in ('entrada', 'saida', 'ajuste', 'devolucao', 'perda', 'estorno')
            and m.ocorrida_em > i.aberto_em
            and (i.fechado_em is null or m.ocorrida_em <= i.fechado_em)
       ), 0))
  end as diferenca_ml,
  case when c.contado_ml is null then false
       else c.contado_ml <> (c.sistema_ml + coalesce((
         select sum(m.volume_ml)
           from movimentacoes m
          where m.base_id = c.base_id
            and m.tipo in ('entrada', 'saida', 'ajuste', 'devolucao', 'perda', 'estorno')
            and m.ocorrida_em > i.aberto_em
            and (i.fechado_em is null or m.ocorrida_em <= i.fechado_em)
       ), 0))
  end as divergente
from inventario_contagens c
join inventarios i on i.id = c.inventario_id
join perfumes_base b on b.id = c.base_id;

-- O fechamento passa a ajustar contra o esperado, e a movimentação de ajuste
-- diz o que aconteceu — inclusive quando houve venda no meio da contagem.
create or replace function fechar_inventario(
  p_inventario_id text,
  p_operador text,
  p_parcial boolean default false
) returns integer
language plpgsql
as $$
declare
  v_linha       record;
  v_ajustes     integer := 0;
  v_sem_contar  integer;
  v_saldo       numeric(12, 2);
begin
  if not exists (select 1 from inventarios where id = p_inventario_id) then
    raise exception 'Inventário % não existe', p_inventario_id;
  end if;
  if exists (select 1 from inventarios where id = p_inventario_id and fechado_em is not null) then
    raise exception 'Inventário % já foi fechado', p_inventario_id;
  end if;

  select count(*) into v_sem_contar
    from inventario_contagens
   where inventario_id = p_inventario_id and contado_ml is null;

  if v_sem_contar > 0 and not p_parcial then
    raise exception 'Inventário % tem % base(s) sem contagem', p_inventario_id, v_sem_contar;
  end if;
  if v_sem_contar > 0 then
    delete from inventario_contagens
     where inventario_id = p_inventario_id and contado_ml is null;
  end if;
  if not exists (
    select 1 from inventario_contagens where inventario_id = p_inventario_id
  ) then
    raise exception 'Inventário % não tem nenhuma base contada', p_inventario_id;
  end if;

  for v_linha in
    select base_id, diferenca_ml, movimentos_ml, sistema_ml, esperado_ml, contado_ml
      from inventario_apuracao
     where inventario_id = p_inventario_id and divergente
  loop
    update perfumes_base
       set volume_ml = greatest(0, volume_ml + v_linha.diferenca_ml)
     where id = v_linha.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_linha.base_id, 'ajuste', now(), v_linha.diferenca_ml, p_inventario_id,
      -- A descrição diz de onde veio a conta: sem isso, quem lê o ledger não
      -- distingue erro de contagem de venda ocorrida durante a contagem.
      case when v_linha.movimentos_ml = 0
        then 'Inventário · divergência encontrada na contagem'
        else 'Inventário · contado ' || v_linha.contado_ml || ' ml contra ' ||
             v_linha.esperado_ml || ' ml esperados (' || v_linha.sistema_ml ||
             ' ml no início · ' || v_linha.movimentos_ml || ' ml movimentados durante a contagem)'
      end,
      p_operador, v_saldo
    );

    v_ajustes := v_ajustes + 1;
  end loop;

  update inventarios
     set fechado_em = now(), fechado_por = p_operador
   where id = p_inventario_id;

  return v_ajustes;
end;
$$;
