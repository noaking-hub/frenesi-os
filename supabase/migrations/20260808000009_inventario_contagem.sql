-- ═══════════════════════════════════════════════════════════════════════════
-- Inventário: abrir a contagem, contar e cancelar.
-- ═══════════════════════════════════════════════════════════════════════════

-- O fechamento já existia (`fechar_inventario`), mas não havia como CRIAR uma
-- contagem — a tela abria sempre em "0 de 0" e o botão de confirmar não tinha
-- o que confirmar.

create sequence inventarios_id_seq start 1;

/**
 * Abre uma contagem, congelando o volume de sistema de cada base.
 *
 * O congelamento é o ponto: comparar a contagem com o volume ATUAL mascararia
 * qualquer movimentação ocorrida enquanto o operador conta as prateleiras.
 *
 * Por padrão só entram bases com volume, porque contar centenas de frascos
 * vazios importados da Shopify não é inventário, é ruído.
 */
create function abrir_inventario(
  p_operador           text,
  p_somente_com_volume boolean default true
) returns text
language plpgsql
as $$
declare
  v_id     text;
  v_linhas integer;
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está abrindo a contagem';
  end if;
  if exists (select 1 from inventarios where fechado_em is null) then
    raise exception 'já existe uma contagem em andamento — feche ou cancele antes de abrir outra';
  end if;

  v_id := 'INV-' || to_char(current_date, 'MMDD') || '-'
          || lpad(nextval('inventarios_id_seq')::text, 2, '0');

  insert into inventarios (id, competencia) values (v_id, current_date);

  insert into inventario_contagens (inventario_id, base_id, sistema_ml)
  select v_id, b.id, b.volume_ml
    from perfumes_base b
   where b.ativo
     and (not p_somente_com_volume or b.volume_ml > 0);

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'nenhuma base ativa % para contar',
      case when p_somente_com_volume then 'com volume em estoque' else '' end;
  end if;

  return v_id;
end;
$$;

comment on function abrir_inventario is
  'Abre a contagem congelando o volume de sistema de cada base ativa. Retorna o id.';

/**
 * Registra a contagem física de uma base. Contar zero é uma contagem; não
 * contar é ausência — por isso o valor nulo nunca é gravado aqui.
 */
create function registrar_contagem(
  p_inventario_id text,
  p_base_id       text,
  p_contado_ml    numeric,
  p_operador      text
) returns void
language plpgsql
as $$
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem contou';
  end if;
  if p_contado_ml is null or p_contado_ml < 0 then
    raise exception 'o volume contado não pode ser negativo';
  end if;
  if not exists (
    select 1 from inventarios where id = p_inventario_id and fechado_em is null
  ) then
    raise exception 'a contagem % não está aberta', p_inventario_id;
  end if;

  update inventario_contagens
     set contado_ml  = round(p_contado_ml, 2),
         responsavel = p_operador,
         contado_em  = now()
   where inventario_id = p_inventario_id
     and base_id = p_base_id;

  if not found then
    raise exception 'a base % não faz parte da contagem %', p_base_id, p_inventario_id;
  end if;
end;
$$;

comment on function registrar_contagem is
  'Grava o volume físico contado de uma base, com autor e horário.';

/**
 * Cancela uma contagem aberta. Só existe para desfazer uma abertura errada:
 * contagem fechada é histórico e não se apaga.
 */
create function cancelar_inventario(p_inventario_id text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from inventarios where id = p_inventario_id and fechado_em is null
  ) then
    raise exception 'a contagem % não está aberta', p_inventario_id;
  end if;
  delete from inventarios where id = p_inventario_id;
end;
$$;

comment on function cancelar_inventario is
  'Apaga uma contagem ainda aberta. Contagem fechada é histórico e não é removida.';
