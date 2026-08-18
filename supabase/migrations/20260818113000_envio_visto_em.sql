-- Quando o ERP SOUBE que o pedido saiu — não quando ele foi comprado.
--
-- A janela dos avisos olha `comprado_em`, e um envio descoberto tarde (pedido
-- de julho postado em agosto pelo Melhor Envio) ficava mudo para sempre: o
-- fato era novo, mas a compra era velha. Com esta coluna, a descoberta carimba
-- o momento em que o código chegou e o aviso sai pela data do FATO.
alter table public.pedidos
  add column if not exists envio_visto_em timestamptz;
