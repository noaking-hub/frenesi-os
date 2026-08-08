-- ═══════════════════════════════════════════════════════════════════════════
-- Seed de demonstração.
--
-- Todos os dados são FICTÍCIOS — clientes, CPFs, endereços, custos e preços.
-- Substituir pelos dados reais na implantação.
--
-- Nada aqui é KPI pré-calculado: só fatos. Consumo de lote, perda real,
-- unidades vendáveis e cobertura saem das views de `20260808000001_init.sql`.
-- ═══════════════════════════════════════════════════════════════════════════

insert into parametros_precificacao (criado_por) values ('seed');

-- ── Perfumes base ──────────────────────────────────────────────────────────

insert into perfumes_base (id, nome, marca, genero, custo_por_ml, volume_ml, consumo_diario_ml) values
  ('bac', 'Baccarat Rouge 540', 'Maison Francis',   'Unissex',   3.1000,  640, 51),
  ('blu', 'Bleu de Chanel',     'Chanel',           'Masculino', 2.9000,  760, 14),
  ('sau', 'Sauvage Elixir',     'Dior',             'Masculino', 2.6000, 1180, 30),
  ('erb', 'Erba Pura',          'Xerjoff',          'Unissex',   3.9500,  520, 25),
  ('ave', 'Aventus',            'Creed',            'Masculino', 4.1500,  410, 11),
  ('del', 'Delina',             'Parfums de Marly', 'Feminino',  3.8000,   90, 22),
  ('oud', 'Oud Wood',           'Tom Ford',         'Masculino', 4.4000,    0,  6),
  ('gg',  'Good Girl',          'Carolina Herrera', 'Feminino',  2.4500,  340,  3);

-- ── Decants já envasados ───────────────────────────────────────────────────

insert into produtos_derivados (base_id, variante, envasadas, reservadas, preco_praticado) values
  ('bac',  5,  8, 3,  79.90), ('bac', 10,  4, 1, 139.90),
  ('sau',  5, 14, 5,  54.90), ('sau', 15,  6, 2, 148.90),
  ('erb',  5,  7, 1,  86.90), ('erb', 10,  3, 0, 154.90),
  ('ave', 10,  5, 2, 164.90), ('ave',  3,  9, 0,  42.90),
  ('blu', 10,  6, 1, 118.90), ('blu',  3, 12, 3,  38.90),
  ('del',  5,  2, 2,  62.90), ('gg',   5,  4, 0,  58.90);

-- ── O que está publicado na Shopify hoje ───────────────────────────────────
-- O cliente sempre preenche 20 e decrementa à mão; estas são as leituras que
-- divergem do teto.

insert into shopify_publicado (base_id, variante, publicado) values
  ('del', 15, 20), ('del', 10, 20), ('gg', 10, 12), ('oud', 5, 20), ('bac', 15, 8);

-- Demais combinações permanecem no teto de 20.
insert into shopify_publicado (base_id, variante, publicado)
select b.id, v.variante, 20
from perfumes_base b
cross join (values (3::smallint), (5), (8), (10), (15)) as v (variante)
on conflict do nothing;

-- ── Lotes e extrato de saídas ──────────────────────────────────────────────

insert into lotes (id, base_id, fornecedor, volume_ml, entrada_em, encerrado_em) values
  ('LT-095', 'bac', 'Importadora Aurum',   1000, '2026-07-26', null),
  ('LT-096', 'sau', 'Importadora Aurum',   1500, '2026-07-02', null),
  ('LT-097', 'blu', 'Importadora Aurum',   1000, '2026-07-12', null),
  ('LT-098', 'erb', 'Nicho Distribuidora',  500, '2026-08-02', null),
  ('LT-094', 'gg',  'Nicho Distribuidora',  500, '2026-07-18', null),
  ('LT-093', 'ave', 'Importadora Aurum',    500, '2026-07-10', null),
  ('LT-091', 'erb', 'Nicho Distribuidora',  500, '2026-06-20', null),
  ('LT-092', 'del', 'Parfums Brasil',       500, '2026-06-15', null),
  -- Encerrados: aqui a perda real passa a ser mensurável.
  ('LT-088', 'bac', 'Importadora Aurum',    500, '2026-05-02', '2026-07-28'),
  ('LT-084', 'sau', 'Importadora Aurum',   1000, '2026-04-18', '2026-07-02'),
  ('LT-079', 'oud', 'Nicho Distribuidora',  250, '2026-04-05', '2026-08-01');

insert into lote_saidas (lote_id, ordem_id, ocorrida_em, unidades, variante) values
  ('LT-095', 'OP-2205', '2026-07-28', 20,  5),
  ('LT-095', 'OP-2208', '2026-07-30', 12, 10),
  ('LT-095', 'OP-2217', '2026-08-02',  4,  5),
  ('LT-095', 'OP-2214', '2026-08-03', 24,  5),
  ('LT-096', 'OP-2206', '2026-07-20', 10,  5),
  ('LT-096', 'OP-2212', '2026-08-03', 18, 15),
  ('LT-097', 'OP-2198', '2026-07-19', 16,  5),
  ('LT-097', 'OP-2203', '2026-07-27',  8, 10),
  ('LT-097', 'OP-2215', '2026-08-01', 10,  8),
  ('LT-094', 'OP-2202', '2026-07-25', 12,  5),
  ('LT-094', 'OP-2209', '2026-07-31', 10, 10),
  ('LT-093', 'OP-2200', '2026-07-24',  6, 10),
  ('LT-093', 'OP-2216', '2026-08-02', 10,  3),
  ('LT-091', 'OP-2180', '2026-07-02', 14,  5),
  ('LT-091', 'OP-2194', '2026-07-18',  8, 10),
  ('LT-091', 'OP-2201', '2026-07-26', 30,  5),
  ('LT-091', 'OP-2207', '2026-07-29',  6, 10),
  ('LT-091', 'OP-2210', '2026-07-31', 40,  3),
  ('LT-092', 'OP-2172', '2026-06-28', 30,  5),
  ('LT-092', 'OP-2192', '2026-07-17', 14, 10),
  ('LT-092', 'OP-2211', '2026-08-02', 15,  8),
  ('LT-088', 'OP-2088', '2026-05-12', 20,  5),
  ('LT-088', 'OP-2101', '2026-05-24', 12, 10),
  ('LT-088', 'OP-2140', '2026-06-09', 24,  3),
  ('LT-088', 'OP-2166', '2026-06-27', 10,  8),
  ('LT-088', 'OP-2190', '2026-07-14',  6, 15),
  ('LT-088', 'OP-2204', '2026-07-26',  4,  5),
  ('LT-084', 'OP-2061', '2026-04-29', 30,  5),
  ('LT-084', 'OP-2094', '2026-05-15', 24, 10),
  ('LT-084', 'OP-2128', '2026-06-03', 40,  3),
  ('LT-084', 'OP-2158', '2026-06-21', 18, 15),
  ('LT-084', 'OP-2178', '2026-07-01', 35,  5),
  ('LT-079', 'OP-2054', '2026-04-19', 10,  5),
  ('LT-079', 'OP-2090', '2026-05-11',  8, 10),
  ('LT-079', 'OP-2134', '2026-06-08', 10,  3),
  ('LT-079', 'OP-2196', '2026-07-22', 10,  8);

-- ── Clientes e pedidos ─────────────────────────────────────────────────────

insert into clientes (id, nome, email, cpf, telefone, cidade, uf) values
  ('11111111-1111-4111-8111-111111111111', 'Camila Rocha',    'camila.rocha@email.com',   '30412877010', '11 98421-0032', 'São Paulo',      'SP'),
  ('22222222-2222-4222-8222-222222222222', 'Rafael Andrade',  'rafael.andrade@email.com', '18855204093', '19 99120-8874', 'Campinas',       'SP'),
  ('33333333-3333-4333-8333-333333333333', 'Juliana Prado',   'ju.prado@email.com',       '04133092122', '31 98003-1177', 'Belo Horizonte', 'MG'),
  ('44444444-4444-4444-8444-444444444444', 'Beatriz Lima',    'bia.lima@email.com',       '11204877035', '21 98554-9021', 'Rio de Janeiro', 'RJ'),
  ('55555555-5555-4555-8555-555555555555', 'Ana Clara Mota',  'ana.mota@email.com',       '77310455021', '11 97001-5540', 'São Paulo',      'SP');

insert into pedidos (
  id, cliente_id, canal, valor, frete, cashback, pagamento, envio,
  comprado_em, entregue_em, destino, cep, logradouro, peso, dimensoes, gateway, rastreio
) values
  ('#10482', '11111111-1111-4111-8111-111111111111', 'shopify', 389.00, 24.90, 24.90, 'pago',       'aguardando_envio',
   '2026-08-03 09:12-03', null, 'São Paulo · SP', '05435-000', 'Rua Harmonia, 482 · Vila Madalena', '0,42 kg', '18 × 12 × 9 cm', 'frenet', null),
  ('#10481', '22222222-2222-4222-8222-222222222222', 'yampi',   245.00, 24.90,  0.00, 'pago',       'enviado',
   '2026-08-03 08:04-03', null, 'Campinas · SP', '13024-110', 'Av. Andrade Neves, 1204 · Centro', '0,28 kg', '16 × 10 × 8 cm', 'melhor_envio', 'OS4471120BR'),
  ('#10480', '33333333-3333-4333-8333-333333333333', 'shopify', 612.50, 41.20,  0.00, 'divergente', 'retido',
   '2026-08-02 19:37-03', null, 'Belo Horizonte · MG', '30140-071', 'Rua Pernambuco, 907 · Savassi', '0,61 kg', '22 × 14 × 10 cm', 'melhor_envio', 'OS9981204BR'),
  -- Entregue há 5 dias: dentro dos 7, elegível para devolução.
  ('#10478', '44444444-4444-4444-8444-444444444444', 'shopify', 513.60, 26.70, 26.70, 'pago',       'entregue',
   '2026-07-26 11:48-03', '2026-07-30 14:20-03', 'Rio de Janeiro · RJ', '22071-020', 'Rua Bulhões de Carvalho, 145 · Copacabana', '0,45 kg', '19 × 12 × 9 cm', 'frenet', 'LGG88214077'),
  -- Entregue há mais de 30 dias: fora do prazo.
  ('#10402', '44444444-4444-4444-8444-444444444444', 'shopify', 168.80, 22.40,  0.00, 'pago',       'entregue',
   '2026-06-28 10:02-03', '2026-07-03 16:40-03', 'Rio de Janeiro · RJ', '22071-020', 'Rua Bulhões de Carvalho, 145 · Copacabana', '0,29 kg', '16 × 11 × 8 cm', 'frenet', 'AZ4471120'),
  -- Ainda em trânsito: o relógio da devolução nem começou.
  ('#10486', '44444444-4444-4444-8444-444444444444', 'shopify', 289.90, 24.90,  0.00, 'pago',       'enviado',
   '2026-08-02 09:15-03', null, 'Rio de Janeiro · RJ', '22071-020', 'Rua Bulhões de Carvalho, 145 · Copacabana', '0,38 kg', '18 × 12 × 9 cm', 'frenet', 'LGG55120904');

-- ── Movimentações de estoque ───────────────────────────────────────────────
-- Nas saídas, `liquido_ml` é o que entrou no frasco e `volume_ml` o que saiu do
-- estoque: a diferença é a perda técnica, derivada e nunca lançada à parte.
-- Nos ajustes, `ref` diz a origem — `LT-` encerramento de lote, `INV-`
-- divergência de contagem.

insert into movimentacoes (base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, descricao, responsavel, saldo_ml) values
  ('bac', 'saida',     '2026-08-03 09:12-03', -123.60, 120.00, 'OP-2214', 'Ordem de produção OP-2214 · 24 un de 5 ml',            'Pedro A.',     640),
  ('sau', 'saida',     '2026-08-03 08:20-03', -278.10, 270.00, 'OP-2212', 'Ordem de produção OP-2212 · 18 un de 15 ml',           'Marina F.',   1180),
  ('erb', 'entrada',   '2026-08-02 17:44-03',  500.00, null,   'NF-4482', 'Compra de perfume base · nota 4482',                   'João Marcelo', 520),
  ('del', 'saida',     '2026-08-02 11:05-03', -123.60, 120.00, 'OP-2211', 'Ordem de produção OP-2211 · 15 un de 8 ml',            'Pedro A.',      90),
  ('oud', 'ajuste',    '2026-08-01 16:30-03',  -10.00, null,   'LT-079',  'Frasco declarado vazio · perda real apurada no lote',  'João Marcelo',   0),
  ('gg',  'devolucao', '2026-08-01 10:22-03',    5.00, null,   'DEV-1038','Decant lacrado devolvido por erro de expedição',       'Marina F.',    340),
  ('erb', 'saida',     '2026-07-31 15:48-03', -123.60, 120.00, 'OP-2210', 'Ordem de produção OP-2210 · 40 un de 3 ml',            'Marina F.',     20),
  ('ave', 'ajuste',    '2026-07-31 09:10-03',  -12.00, null,   'INV-0726','Inventário · divergência encontrada na contagem',      'Pedro A.',     410);

-- ── Inventário de agosto, ainda aberto ─────────────────────────────────────
-- Good Girl não foi contada: `contado_ml` nulo é diferente de contar zero.

insert into inventarios (id, competencia) values ('INV-0808', '2026-08-01');

insert into inventario_contagens (inventario_id, base_id, sistema_ml, contado_ml, responsavel, contado_em) values
  ('INV-0808', 'bac',  640,  640, 'Pedro A.',  '2026-08-08 07:40-03'),
  ('INV-0808', 'sau', 1180, 1174, 'Pedro A.',  '2026-08-08 07:52-03'),
  ('INV-0808', 'erb',  520,  520, 'Marina F.', '2026-08-08 08:05-03'),
  ('INV-0808', 'blu',  760,  768, 'Marina F.', '2026-08-08 08:18-03'),
  ('INV-0808', 'ave',  410,  398, 'Pedro A.',  '2026-08-08 08:30-03'),
  ('INV-0808', 'del',   90,   90, 'Marina F.', '2026-08-08 08:41-03'),
  ('INV-0808', 'gg',   340, null, null,        null),
  ('INV-0808', 'oud',    0,    0, 'Pedro A.',  '2026-08-08 08:52-03');

insert into pedido_itens (pedido_id, base_id, descricao, variante, preco) values
  ('#10482', 'bac', 'Baccarat Rouge 540', 10, 289.00),
  ('#10482', 'del', 'Delina',              5, 100.00),
  ('#10481', 'oud', 'Oud Wood',           15, 220.10),
  ('#10480', 'bac', 'Baccarat Rouge 540', 10, 268.50),
  ('#10480', 'erb', 'Erba Pura',          15, 214.00),
  ('#10480', 'gg',  'Good Girl',           5,  88.80),
  ('#10478', 'bac', 'Baccarat Rouge 540',  5,  79.90),
  ('#10478', 'oud', 'Oud Wood',           10, 169.90),
  ('#10478', 'del', 'Delina',              3,  48.90),
  ('#10478', 'ave', 'Aventus',            15, 214.90),
  ('#10402', 'erb', 'Erba Pura',           5,  86.90),
  ('#10402', 'sau', 'Sauvage Elixir',      8,  81.90),
  ('#10486', 'blu', 'Bleu de Chanel',     10, 118.90),
  ('#10486', 'gg',  'Good Girl',          15, 171.00);
