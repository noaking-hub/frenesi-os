-- ═══════════════════════════════════════════════════════════════════════════
-- Movimentações com autoria e saldo, e o inventário físico.
-- ═══════════════════════════════════════════════════════════════════════════

-- Quem lançou e qual era o saldo da base logo depois. Sem isso o extrato não
-- responde "quem fez" nem "como o estoque chegou aqui".
alter table movimentacoes
  add column responsavel text,
  add column saldo_ml numeric(12, 2);

comment on column movimentacoes.saldo_ml is
  'Saldo da base imediatamente após esta movimentação, congelado no lançamento.';

-- ── Inventário físico ──────────────────────────────────────────────────────
-- Uma contagem por período; cada linha é uma base contada contra o sistema.

create table inventarios (
  id           text primary key,
  competencia  date not null,
  aberto_em    timestamptz not null default now(),
  fechado_em   timestamptz,
  fechado_por  text
);

create table inventario_contagens (
  inventario_id text not null references inventarios (id) on delete cascade,
  base_id       text not null references perfumes_base (id),
  -- Congelado na abertura da contagem: comparar com o volume atual mascararia
  -- movimentações ocorridas durante a contagem.
  sistema_ml    numeric(12, 2) not null,
  -- Null enquanto ninguém contou. Não é o mesmo que contar zero.
  contado_ml    numeric(12, 2),
  responsavel   text,
  contado_em    timestamptz,
  primary key (inventario_id, base_id),
  constraint contagem_tem_autor check (
    (contado_ml is null and responsavel is null)
    or (contado_ml is not null and responsavel is not null)
  )
);

comment on constraint contagem_tem_autor on inventario_contagens is
  'Contagem sem responsável é contagem que ninguém fez.';

create view inventario_apuracao as
select
  c.inventario_id,
  c.base_id,
  b.nome as perfume,
  c.sistema_ml,
  c.contado_ml,
  c.responsavel,
  c.contado_em,
  c.contado_ml is not null as contado,
  coalesce(c.contado_ml - c.sistema_ml, 0) as diferenca_ml,
  c.contado_ml is not null and c.contado_ml <> c.sistema_ml as divergente
from inventario_contagens c
join perfumes_base b on b.id = c.base_id;

-- ── Fechamento do inventário ───────────────────────────────────────────────
-- Uma ação, um lançamento: confirmar o inventário GERA um ajuste por
-- divergência, com ref = id do inventário. É por essa ref que a tela de
-- Movimentações distingue divergência de contagem de encerramento de lote.

create function fechar_inventario(p_inventario_id text, p_operador text)
returns integer
language plpgsql
as $$
declare
  v_linha record;
  v_ajustes integer := 0;
  v_saldo numeric(12, 2);
begin
  if not exists (select 1 from inventarios where id = p_inventario_id) then
    raise exception 'Inventário % não existe', p_inventario_id;
  end if;
  if exists (select 1 from inventarios where id = p_inventario_id and fechado_em is not null) then
    raise exception 'Inventário % já foi fechado', p_inventario_id;
  end if;
  if exists (
    select 1 from inventario_contagens
    where inventario_id = p_inventario_id and contado_ml is null
  ) then
    raise exception 'Inventário % tem bases sem contagem', p_inventario_id;
  end if;

  for v_linha in
    select base_id, diferenca_ml
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
      'Inventário · divergência encontrada na contagem', p_operador, v_saldo
    );

    v_ajustes := v_ajustes + 1;
  end loop;

  update inventarios
     set fechado_em = now(), fechado_por = p_operador
   where id = p_inventario_id;

  return v_ajustes;
end;
$$;

comment on function fechar_inventario is
  'Confirma a contagem e lança um ajuste por divergência. Retorna quantos ajustes gerou.';

alter table inventarios          enable row level security;
alter table inventario_contagens enable row level security;

create policy erp_leitura on inventarios          for select to authenticated using (true);
create policy erp_leitura on inventario_contagens for select to authenticated using (true);
