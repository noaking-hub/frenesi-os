-- ═══════════════════════════════════════════════════════════════════════════
-- O custo de manter a operação digital de pé ganha nome próprio.
--
-- Netlify, Supabase, Shopify, Yampi, Resend, domínio, IA — tudo isso caía em
-- "Administrativo", centro de custo "Financeiro", junto com honorário de
-- contador e tarifa de banco. A pergunta "quanto custa por mês manter a loja e
-- o ERP no ar" não tinha como ser respondida pela DRE.
--
-- CENTRO DE CUSTO "Tecnologia": centro responde A SERVIÇO DE QUÊ, e nenhum dos
-- sete que existiam respondia "manter a plataforma funcionando".
--
-- CATEGORIA "Inteligência artificial", separada de "Ferramentas e SaaS", e a
-- separação é o ponto: hospedagem é custo FIXO — o mesmo número todo mês, e
-- previsível. IA é custo POR USO — sobe com o quanto se usa e pode dobrar num
-- mês sem ninguém decidir nada. Na mesma linha, a única das duas que pode
-- disparar fica escondida atrás da que não se mexe. É a repetição exata do que
-- aconteceu com Meta e Google dentro de "Tráfego Pago", onde 44% do
-- investimento ficou invisível por estarem somados.
--
-- Nenhuma categoria nova leva nome de FORNECEDOR ("Netlify", "Anthropic"):
-- fornecedor tem campo próprio, `favorecido`. Categoria batizada com nome de
-- empresa mente no dia em que a empresa é trocada, e o histórico fica ambíguo.
--
-- "Ferramentas e SaaS" não é criada aqui — já existia, com zero lançamentos.
-- O que faltava não era a categoria, era alguém usá-la.
-- ═══════════════════════════════════════════════════════════════════════════

insert into centros_custo (id, nome, ativo)
values ('tecnologia', 'Tecnologia', true)
on conflict (id) do update set nome = excluded.nome, ativo = true;

insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, conta_contabil,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, ativa
) values (
  'inteligencia-artificial', 'Inteligência artificial', 'Despesa fixa', 'despesa_fixa',
  '3.1.03.006 · inteligência artificial',
  true, true, false, true, true
)
on conflict (id) do update
   set nome = excluded.nome,
       natureza = excluded.natureza,
       natureza_gerencial = excluded.natureza_gerencial,
       conta_contabil = excluded.conta_contabil,
       ativa = true;

-- ── O que já estava lançado no lugar errado ────────────────────────────────
--
-- Um lançamento só: ChatGPT/OpenAI de agosto, R$ 110,16, hoje em
-- "Administrativo" com centro "Financeiro". Reclassificar é seguro porque
-- categoria e centro não tocam em caixa — o valor, a data e a conta seguem
-- exatamente onde estão; muda a coluna em que ele aparece na DRE.
--
-- Escrito por `id`, e não por `descricao ilike '%chatgpt%'`: um LIKE aqui
-- pegaria qualquer lançamento futuro que mencione a palavra, inclusive um que
-- não seja assinatura de IA.
update lancamentos
   set categoria = 'Inteligência artificial',
       categoria_id = 'inteligencia-artificial',
       centro_custo = 'tecnologia'
 where id = 'LC-MT24JMA1-FNSC'
   and categoria_id = 'administrativo';

-- A "Assinatura Dropshipping" (Go Perfumaria) fica onde está DE PROPÓSITO:
-- é assinatura de fornecedor de mercadoria, não de ferramenta da plataforma.
-- Movê-la para Tecnologia faria o custo de manter a loja no ar incluir uma
-- despesa que existiria mesmo se a loja fosse de papel.
