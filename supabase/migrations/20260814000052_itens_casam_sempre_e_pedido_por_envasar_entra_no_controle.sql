-- Três defeitos que só aparecem juntos: um pedido pago, ainda por envasar,
-- de um perfume cujo lote foi lançado DEPOIS da venda.
--
-- 1. O casamento item ↔ catálogo só acontecia no instante da importação.
--    Quem foi importado antes de o catálogo ter aquele SKU ficou com
--    `base_id` e `variante` nulos para sempre — 774 dos 1.393 itens, 56%.
--    Item sem base não reserva, não consome insumo e não baixa ml: some do
--    controle inteiro, em silêncio. O casamento vira derivação mantida.
--
-- 2. A virada do controle de estoque carimbou `estoque_fora_do_controle` em
--    TODO pedido sem baixa. Fazia sentido para o que já tinha saído — aquele
--    decant veio de outro frasco. Mas pegou junto os pedidos pagos que ainda
--    não foram envasados, e esses vão sair do frasco de agora, o que o ERP
--    controla. Fora do controle é sobre o passado, não sobre a pendência.
--
-- 3. A reconciliação das reservas existia e não era chamada por ninguém.
--    Nenhum job, nenhuma rota. Reserva nascia no papel e nunca conferia.

-- ── 1. Casamento por SKU como manutenção, não como evento ──────────────────
--
-- O SKU é a ponte entre a Yampi (que vende) e o catálogo (que sabe o que é).
-- Rodar de novo não muda nada quando já está certo, e passa a valer para o
-- item antigo assim que o produto entra no catálogo.
create or replace function casar_itens_por_sku()
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  update pedido_itens i
     set base_id = d.base_id, variante = d.variante
    from produtos_derivados d
   where d.sku = i.sku
     and i.sku is not null
     and (i.base_id is null or i.variante is null);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function casar_itens_por_sku is
  'Liga item de pedido ao catálogo pelo SKU; roda sempre, vale para o histórico';

-- O tamanho do decant está no fim do SKU ("HPEUWHECF-3ml"). Produto que saiu
-- do ar não casa mais com o catálogo, mas o tamanho vendido continua legível
-- — e é melhor lê-lo do que a tela exibir um palpite.
create or replace function variante_do_sku(p_sku text)
returns smallint
language sql
immutable
as $$
  select case
    when p_sku ~* '-([0-9]+)ml$'
     and (regexp_replace(p_sku, '^.*-([0-9]+)ml$', '\1', 'i'))::int in (3, 5, 8, 10, 15)
    then (regexp_replace(p_sku, '^.*-([0-9]+)ml$', '\1', 'i'))::smallint
    else null
  end
$$;

create or replace function preencher_variante_orfa()
returns integer
language plpgsql
as $$
declare
  v_n integer;
begin
  -- Só a variante: sem base_id o item segue fora do controle de estoque, como
  -- deve — isto é informação de tamanho para a tela, não entrada de saldo.
  update pedido_itens
     set variante = variante_do_sku(sku)
   where variante is null
     and sku is not null
     and variante_do_sku(sku) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── 2. Pendência de envase volta para dentro do controle ───────────────────
--
-- Pedido pago que ainda não foi envasado será atendido pelo frasco atual.
-- Manter esse pedido fora do controle era esconder da fila de envase um
-- decant que a bancada tem mesmo que preparar.
update pedidos
   set estoque_fora_do_controle = false
 where estoque_fora_do_controle
   and estoque_baixado_em is null
   and situacao = 'pago'
   and envio in ('nao_iniciado', 'aguardando_envio');

comment on column pedidos.estoque_fora_do_controle is
  'Pedido cujo decant saiu de frasco anterior ao controle — nunca baixa ml. '
  'Não vale para pedido pago ainda por envasar: esse sai do frasco de agora.';

-- ── 3. Manutenção do estoque em uma chamada só ─────────────────────────────
--
-- O pulso de 5 minutos passa a chamar isto. As três etapas têm ordem: casar
-- primeiro (senão a reserva não enxerga o item), preencher tamanho órfão
-- depois, reconciliar por último.
create or replace function manutencao_do_estoque()
returns jsonb
language plpgsql
as $$
declare
  v_casados integer;
  v_tamanhos integer;
  v_reservas jsonb;
begin
  v_casados := casar_itens_por_sku();
  v_tamanhos := preencher_variante_orfa();
  v_reservas := sincronizar_reservas();

  return jsonb_build_object(
    'itens_casados', v_casados,
    'tamanhos_preenchidos', v_tamanhos,
    'reservas', v_reservas
  );
end;
$$;

comment on function manutencao_do_estoque is
  'Casa itens pelo SKU e reconcilia reservas; chamada pelo pulso de 5 minutos';

select manutencao_do_estoque();
