# FRENESI OS

ERP interno da FRENESI Perfumes e Portal de Devoluções do cliente, implementados
a partir do handoff de design `design_handoff_frenesi_erp`.

O problema central do negócio: **o estoque real é medido em mililitros de perfume
base, mas a venda acontece em unidades por variante na Shopify.** O sistema
traduz um no outro, apura a perda técnica real do fracionamento e mantém as duas
plataformas coerentes.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** estrito
- **Tailwind CSS v4** (tokens do handoff em `src/app/globals.css`)
- **Supabase** (Postgres) — schema e views em `supabase/migrations`
- **Vitest** para o modelo de domínio

## Rodando

```bash
npm install
npm run dev        # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm test` | Testes do modelo de domínio |
| `npm run typecheck` | `tsc --noEmit` |

Sem variáveis de ambiente o app roda com os **dados fictícios** de
`src/data/fixtures.ts` e a sidebar mostra "Dados de demonstração". Para apontar
para o Supabase, crie `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role>
```

O projeto **FRENESI OS** (`sa-east-1`) já está provisionado com as migrations
e o seed aplicados. A chave `service_role` sai em Supabase → Project Settings →
API; ela nunca pode ser prefixada com `NEXT_PUBLIC_`, que a exporia no bundle do
navegador. A chave anon/publishable não serve: as policies liberam leitura
apenas para `authenticated`, então ela devolveria listas vazias.

Para recriar o banco do zero em outro projeto:

```bash
supabase db push                             # supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql    # dados de demonstração
```

O `src/data/repository.ts` detecta as variáveis e troca a origem sozinho —
nenhuma tela muda.

## Rotas

| Rota | Tela |
|---|---|
| `/` | Dashboard |
| `/pedidos` | Todos os pedidos + drawer com a ficha completa |
| `/pedidos/envios` | Rastreamento e entregas · baixa na Shopify |
| `/pedidos/devolucoes` | Devoluções · triagem, reverso e resolução |
| `/pedidos/ocorrencias` | Ocorrências de entrega |
| `/estoque` | Perfumes base · quando o estoque acaba |
| `/estoque/derivados` | Produtos derivados · decants prontos por variante |
| `/estoque/movimentacoes` | Movimentações de estoque |
| `/estoque/lotes` | Lotes e perda real |
| `/estoque/sincronia` | Sincronia Shopify |
| `/estoque/inventario` | Inventário físico |
| `/producao` | Produção · ordens e simulação de impacto |
| `/financeiro` | Conciliação de repasses |
| `/financeiro/lancamentos` | Lançamentos · a pagar, vencidos e previstos |
| `/financeiro/contas` | Contas da operação |
| `/financeiro/dre` | DRE com subtotais derivados |
| `/financeiro/categorias` | Categorias · para onde vai o dinheiro |
| `/financeiro/contabil` | Integração contábil · fechamento e arquivos |
| `/produtos` | Catálogo · status derivado de estoque e margem |
| `/produtos/precificacao` | Precificação e composição do preço |
| `/produtos/concorrentes` | Concorrentes · posicionamento com piso de margem |
| `/produtos/kits` | Kits e combos · disponibilidade derivada das bases |
| `/devolucoes` | **Portal público do cliente**, 6 passos, mobile |

As demais telas do handoff estão na navegação e caem numa página que declara o
que falta e aponta para as telas prontas do mesmo grupo. Nada finge existir.

## Arquitetura

```
src/
  domain/       Regras de negócio puras, sem React e sem I/O. Testadas.
  data/         Repositório (Supabase ou fixtures) e consultas derivadas.
  components/   Design system do ERP (escuro) e do portal (claro).
  app/          Rotas. (erp) é o shell interno; /devolucoes é público.
supabase/       Migrations, views derivadas e seed de demonstração.
```

A dependência só aponta para dentro: `app` → `components` → `data` → `domain`.
O domínio não conhece nem React nem Supabase, por isso é testável e é a mesma
fonte para as duas interfaces.

## As regras que o código guarda

Estas vieram do handoff e são a diferença entre um ERP confiável e um que o
operador para de acreditar. Cada uma tem endereço no código.

**Nada de número escrito à mão.** Todo KPI, hint, contagem e badge é derivado da
fonte de dados. Quando duas telas mostram a mesma grandeza, elas chamam a mesma
função de `src/data/consultas.ts` — é por isso que o Dashboard e a tela de Lotes
nunca discordam sobre a perda real.

**Estoque em ml, venda em unidades.** `unidadesPossiveis` soma os decants
prontos com `floor(volume ÷ variante)`. Na Shopify o cliente controla estoque à
mão, sempre preenchendo 20 e decrementando; `sincronizarVariante` corrige nos
dois sentidos — esgota, reduz ou repõe ao teto — e **nunca sobe acima de 20**,
que é política do cliente.
→ `src/domain/estoque.ts`

**Perda técnica: parâmetro vs. medida real.** Enquanto o lote está aberto, a
diferença entre comprado e envasado é *saldo teórico*; só quando o operador
declara o frasco vazio ela vira *perda real*. `consumido` e `unidades` são
sempre derivados do extrato de saídas, nunca campos independentes. Se a perda
real média passa do parâmetro, todo preço calculado está com custo subestimado —
e o sistema diz isso em três lugares.
→ `src/domain/lotes.ts`, view `lote_apuracao`

**Uma ação, um lançamento.** Encerrar um lote *gera* a movimentação de estoque
(mesma data, mesma quantidade, `ref` = id do lote). Confirmar o inventário
*gera* um ajuste por divergência, com `ref` = id do inventário. Não existem dois
registros para o mesmo fato — e é pela `ref` que a tela de Movimentações
distingue encerramento de lote de divergência de contagem, sem precisar de um
campo à parte que pudesse discordar dela.
→ `encerrar_lote()` e `fechar_inventario()` nas migrations, `origemDoAjuste`
em `src/domain/movimentacoes.ts`

**Perda técnica também aparece lançamento a lançamento.** Numa saída de
produção, `volume_ml` é o que saiu do estoque e `liquido_ml` o que entrou no
frasco; a perda é a diferença. É a mesma grandeza que os lotes apuram no fim.
→ `perdaTecnica` em `src/domain/movimentacoes.ts`

**Não contado não é contado zero.** No inventário, uma base sem contagem tem
`contado_ml` nulo e não entra nas divergências nem na diferença líquida —
tratá-la como zero inventaria uma perda que ninguém observou.
→ `apurarInventario`, constraint `contagem_tem_autor`

**Invariante verificável.** A soma dos saldos teóricos dos lotes abertos deve
igualar o volume total em estoque. O rodapé da tela de Lotes confere isso a cada
render e denuncia a divergência em vez de escondê-la.
→ `conciliarLotesAbertos`, view `conciliacao_lotes`

**Precificação.** Preço ideal a partir do custo para atingir a margem alvo,
sempre terminando em `,90`. O piso de margem fica 10 pontos abaixo da alvo e
nenhum desconto automático pode furá-lo.
→ `src/domain/precificacao.ts`

**Cópia derivada da regra.** No portal, o motivo "frasco danificado" dispensa o
lacre intacto — então a segunda foto vira opcional **e o texto que a explica
muda junto**. O sistema nunca afirma "as duas fotos são obrigatórias" quando
aceita uma.
→ `fotosCompletas` em `src/domain/devolucoes.ts`

**Prazo de devolução: 7 dias corridos da marcação de entrega.** Antes da entrega
o relógio não começa — o pedido fica "aguardando entrega", que não é a mesma
coisa que "fora do prazo". Portal e ERP leem a mesma `statusDevolucao`.

**A entrega não chega sozinha na Shopify.** A Yampi recebe o rastreio dos
gateways mas não reporta a entrega, então o pedido fica aberto lá. Capturar a
entrega confirmada e dar baixa é a razão de existir da integração.
→ `aguardaBaixaShopify` em `src/domain/entregas.ts`

**Produção mostra o impacto antes de confirmar.** A ordem consome
`quantidade × variante × (1 + perdaPct/100)` — envasar 24 decants de 5 ml tira
123,6 ml do estoque, não 120. Se o volume não sustenta a quantidade, a
confirmação trava e a mensagem diz o máximo possível já com a perda embutida.
→ `simularOrdem` em `src/domain/producao.ts`

**Triagem de devolução: 10% é o limite, mas não decide sozinho.** Aceita-se até
10% abaixo do volume fracionado. Abaixo disso o decant foi usado — e isso só
recusa quando o motivo é arrependimento; em frasco danificado ou erro de envio
a perda é esperada. O reverso sai sempre na mesma plataforma que emitiu a
etiqueta de ida.
→ `aferirItem` e `triarDevolucao` em `src/domain/devolucoes.ts`

**Subtotal do DRE não se digita.** Receita líquida, margem de contribuição e
resultado saem da soma das linhas primitivas — `montarDre` os deriva, e o ponto
de equilíbrio vem da estrutura fixa dividida pela margem de contribuição.
→ `montarDre` e `pontoEquilibrio` em `src/domain/financeiro.ts`

**O status da conciliação sai dos números.** `conciliarRepasse` compara o que
caiu na conta com o esperado menos a taxa do intermediador: bateu com taxa é
conciliado, sem taxa é confirmado, não caiu é pendente, caiu outra coisa é
divergente com a diferença exata. Um repasse a menos e outro a mais não se
anulam — cada direção é somada separada.
→ `conciliarRepasse` em `src/domain/financeiro.ts`

**Competir tem piso.** A recomendação contra concorrente mira dez centavos
abaixo do menor preço, mas nunca fura o piso de margem — quando acompanhar o
mercado não cobre o mínimo, a recomendação é manter o ideal e perder a guerra
de preço de propósito.
→ `analisarMercado` em `src/domain/mercado.ts`

**Kit bloqueia sozinho.** A disponibilidade de um kit não é um campo: deriva do
estoque das bases que o compõem. Oud Wood zerado bloqueia o Kit Amadeirados no
mesmo instante em que o Catálogo o marca esgotado — uma fonte, dois efeitos.
→ `avaliarKit` em `src/domain/mercado.ts`

**Vocabulário do usuário, não do sistema.** "Estoque acaba em 12 dias", não
"ruptura". E o critério interno de aceitação (tolerância de 10% abaixo do volume
fracionado) existe no domínio e **nunca** aparece para o cliente.

## Design

Tokens, tipografia, raios e sombras são os valores finais do handoff, declarados
uma vez em `src/app/globals.css`.

- **Cormorant Garamond** — títulos de seção e nomes de produto
- **Manrope** — interface, corpo, rótulos
- **IBM Plex Mono** — todo número: valores, volumes, percentuais, códigos

O losango 7×7 rotacionado é o ornamento da marca, usado como marcador e nunca
como ícone genérico. Não há biblioteca de ícones: os poucos ornamentos são
formas CSS.

A logomarca (`public/assets/frenesi-logo.png`) é usada vertical e inteira, sem
tagline — o slogan antigo foi descontinuado.

## Dados

Todos os dados de demonstração são **fictícios**: clientes, CPFs, endereços,
custos e preços. Substituir pelos reais na implantação. As fotos dos perfumes do
catálogo estão pendentes do cliente; no portal aparecem como slots.
