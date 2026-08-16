# FRENESI ERP — estado do sistema

> Atualizado em 11/08/2026, ao fim do checkup completo da plataforma.
> Critério de "real": a tela lê e grava dados da operação (Supabase, Yampi,
> Shopify ou Mercado Pago). Telas que só mostravam números de exemplo foram
> **removidas do sistema** — menu que promete o que não existe ensina o
> operador a desconfiar do que existe.

## O placar

**27 telas, todas reais.** Zero telas de demonstração — o selo "números de
demonstração" foi aposentado junto com elas.

---

## Módulo a módulo

### Dashboard
Tudo derivado da operação: vendas do mês e dos últimos 7 dias (com o gráfico
por dia) saem dos pedidos pagos, caixa do saldo consolidado das contas,
pendências dos pedidos e do extrato reais. Alertas agregados — uma linha por
assunto.

### Pedidos — 4 telas
Todos os pedidos (importação da Yampi com transações de pagamento, sincronia
automática ao abrir e de hora em hora), Rastreamento e entregas (espelho de
envios na Shopify), Devoluções (portal ligado), Ocorrências (varredura
automática na rotina). **Só venda entra**: cancelados e pendentes ficam na
Yampi — a exceção é o estornado com dinheiro no extrato, que aparece como
divergente porque a conciliação precisa dele.

### Produtos — 3 telas
Catálogo (edição e criação), Precificação (preço do concorrente + publicação
na Shopify), Concorrentes (coleta de preços).

### Estoque — 6 telas
Perfumes base, Derivados, Movimentações, Lotes e perda real, Sincronia
Shopify, Inventário. A carga inicial saiu por decisão do operador: o
controle de estoque nasce das compras novas, frasco a frasco — base sem
compra registrada fica fora da sincronia (estado normal, não pendência).
A sincronia é de mão dupla e automática: o catálogo reimporta sozinho ao
abrir a tela (12 h de validade) e o estoque calculado é **aplicado na loja
pela rotina de hora em hora** — o botão só existe para quem não quer
esperar.

### Produção
Ordens de envase, conclusão com perda real por lote.

### Financeiro — 10 telas
Reconstruído sobre uma distinção que o módulo anterior não tinha: **caixa** é
quando o dinheiro se move, **competência** é quando o fato econômico acontece.
A venda de 30 de agosto que o gateway paga em 15 de setembro é resultado de
agosto e caixa de setembro — misturar os dois era o que fazia a mesma venda
ser contada duas vezes.

- **Visão Financeira** (landing): 6 indicadores, alertas que abrem a fila que
  acusaram, fluxo projetado, composição das saídas e resumo da DRE.
- **Lançamentos**: contas a pagar e a receber com situação derivada (nunca
  gravada), filtros na URL, baixa com multa/juros/desconto separados do
  principal, parcelamento e cancelamento com motivo.
- **Contas e caixas**: saldo com a ORIGEM declarada (integração, informado ou
  calculado), divergência contra o extrato, concentração do caixa e
  transferência entre contas em duas pernas ligadas.
- **Extrato**: importação automática do Relatório de Liberações do Mercado
  Pago (pedido persistido — sobrevive a F5), conciliação por id de transação
  da Yampi, filtros por período na URL, movimento interno fora da fila,
  contraparte preenchida pela API de pagamentos e **regras de categoria**
  que classificam sozinhas o destinatário recorrente.
- **Conciliação**: venda por venda, com a regra que esvaziou o alarme falso —
  taxa cobrada corretamente é custo, não divergência; divergência é entre a
  taxa REAL e a esperada.
- **Fluxo de caixa**: projeção dia a dia com horizonte de 15/30/60/90 dias. O
  número que decide não é o saldo final, é o MENOR saldo do caminho.
- **DRE gerencial**: resultado por competência, com % sobre a receita
  LÍQUIDA, variação contra o mês anterior, evolução de 6 meses e ponto de
  equilíbrio (que some quando a margem de contribuição é negativa).
- **Categorias**: o plano de contas gerencial. A natureza escolhida aqui
  decide em qual linha da DRE cada pagamento cai.
- **Integração contábil**: CSV pela conta contábil de cada categoria.
- **Configurações**: fechamento de competência (congela valor, categoria e
  tipo; reabrir exige motivo e fica registrado), centros de custo e trilha de
  auditoria.

### CRM — 2 telas
- **Clientes**: derivado dos pedidos importados, com filtros e exportação
  CSV real.
- **Carrinhos abandonados**: lidos **ao vivo** do checkout da Yampi, em
  tabela com filtros de período (7/30 dias/tudo), "só com WhatsApp" e
  ordenação; prioridade por valor × recência; botão que abre o WhatsApp com a
  mensagem de recuperação pronta. Carrinho recuperado some sozinho.

### Cupons
Lidos ao vivo da Yampi (`/pricing/promocodes`): vigência, usos contra o
limite, alerta de expiração em 7 dias, cupom sem freio. O ERP também CRIA
cupom direto no checkout (código, % ou R$, validade, limite de usos).

### Relatórios
Curva ABC por perfume (tamanhos de frasco agrupados) e vendas por canal,
derivados dos pedidos pagos, com filtro de período (7/30 dias, mês, tudo) e
ordenação por receita, unidades ou nome — tudo na URL.

### Configurações — 2 telas
Parâmetros de precificação (com a embalagem aberta em frasco, válvula,
etiqueta, caixa e plástico bolha) e Integrações (diagnóstico de Shopify,
Yampi e Mercado Pago).

---

## O que saiu do sistema (e por quê)

Atendimento, Kits e combos, Campanhas, E-mails e fluxos, Rodízio de ofertas,
Cupons de avaliação, Usuários e permissões, Dados da empresa, Notificações —
maquetes com números inventados. E o **DRE da plataforma**, por decisão do
operador: a plataforma não faz DRE (o DRE gerencial do Financeiro é outro, e
esse existe).

Meu Assessor, Giftback e cashback voltaram: hoje leem dados reais.

## Meu Assessor — o que está ligado e o que depende de você

| Fase | Estado |
|---|---|
| 1 · Leitura blindada | No ar. Policy Engine, orçamento de custo, envelope contra prompt injection, `trace_id` e auditoria obrigatória. |
| 2 · Simulação | No ar. Compra de base e impacto no caixa, sempre marcados como cenário. |
| 3 · Escrita financeira | No ar, **desligada por padrão**. Categorização com prévia, confirmação assinada, idempotência e desfazer. Liga em Meu Assessor → Configurações. |
| 4 · Escrita operacional | No ar, mesma trava. Recomendação de reposição e solicitação interna de compra. Pagamento bancário é classe D e não existe como ferramenta. |
| 5 · WhatsApp | Código pronto, **inativo**: falta `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` e `WHATSAPP_VERIFY_TOKEN`, e cadastrar os números autorizados. |
| 6 · Vigília proativa | No ar, roda de hora em hora. |
| 7 · Assistente contextual | No ar em toda tela do ERP (botão flutuante ou `Ctrl+J`). A tela em que você está vai como contexto, visível num chip e removível com um clique. |
| 8 · Relatórios exportáveis | No ar. Toda consulta que virou tabela ganha "baixar CSV"; o arquivo é gerado relendo o dado na hora do clique, e o download entra na auditoria como qualquer outra leitura. |

Interruptor de emergência: `GERENTE_ESCRITA=desligada` força modo leitura sem
esperar build, e vence a configuração da tela.

Eram especificações de produto com números inventados — úteis como maquete,
perigosas como tela de decisão. O código de domínio (puro e testado) ficou;
se um módulo desses ganhar motor de verdade, a tela volta lendo dados reais.

## Automação — o que roda sozinho

| Quando | O quê |
|---|---|
| Rotina de hora em hora (`/api/financeiro/sincronizar`, agendada em `netlify/functions/`) | Pedidos da Yampi → **Pagaleve** (busca vendas novas, agenda parcelas, casa pelo `checkout_id` da transação e concilia) → estoque aplicado na Shopify → extrato do Mercado Pago (espera o relatório ficar pronto) → varredura de ocorrências |
| Vigília do Gerente, de hora em hora (`/api/assessor/vigilia`) | Recalcula a fila de prioridades e sincroniza alertas: o que é novo entra, o que repete tem a contagem atualizada, o que sumiu da fila é resolvido com data |
| Ao abrir Pedidos | Sincroniza se a última leitura passou de 30 min |
| Ao abrir Extrato | Atualiza se passou de 10 min |
| Ao abrir Sincronia Shopify | Reimporta o catálogo se passou de 12 h |
| A cada importação de pedidos | Reservas recalculadas, extrato ligado às vendas por id de transação |

## Defeitos conhecidos e limitações honestas

1. **Latência do Mercado Pago.** O Relatório de Liberações é gerado por eles
   e já levou mais de 6 minutos. O pedido fica registrado no banco e qualquer
   atualização posterior importa sem pedir de novo — mas extrato "em tempo
   real" não existe com essa API.
2. **Deploy é na Netlify.** `netlify.toml` + funções agendadas em
   `netlify/functions/` substituem o Vercel Cron. Se a plataforma cortar a
   execução antes do relatório do Mercado Pago ficar pronto, a rodada
   seguinte importa o arquivo já gerado — o pedido persistido no banco tolera
   o corte.
3. **981 itens de pedido sem SKU casado** — reimportar o catálogo da Shopify
   e depois os pedidos resolve (agora o catálogo reimporta sozinho ao abrir a
   tela de Sincronia).
4. **Crédito de R$ 11.719,80 em 22/07** aguardando classificação do operador
   (venda ou aporte).
5. **~25 vendas do extrato sem pedido** — pagamentos de antes da importação
   de pedidos. Aparecem na fila como "entrada sem pedido".
6. **Cupons e carrinhos dependem da Yampi no ar** — as telas leem ao vivo e
   avisam quando a API não responde, em vez de mostrar cópia velha.
7. **Sem autenticação de usuários.** O ERP confia no ambiente onde roda.
