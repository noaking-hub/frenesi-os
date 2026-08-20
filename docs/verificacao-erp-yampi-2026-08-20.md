# Verificação — pedidos Yampi / ERP · 10 a 19 de agosto de 2026

**Respondido por:** ERP FRENESI (base própria, espelho da Yampi)
**Data da resposta:** 20/08/2026
**Fonte:** tabela `pedidos` do ERP · fuso America/São_Paulo · data de criação do pedido
**Filtro de origem:** nenhum — total da loja, como pedido

---

## 0. Leia antes: o que esta base pode e o que não pode responder

**O ERP só guarda pedido PAGO.** A importação da Yampi aceita apenas pedidos com pagamento
aprovado (ou divergente) e apaga do banco os demais — é uma decisão antiga, tomada para o
estoque e o caixa não trabalharem em cima de PIX que nunca foi pago.

Consequência direta para esta verificação:

| Coluna pedida | Esta base responde? |
|---|---|
| Pedidos **pagos** / Receita — pagos | **Sim**, com autoridade |
| Pedidos **criados** / Receita — criados | **Não.** Pedido não pago nunca entrou aqui |
| Forma de pagamento (cartão/PIX/boleto) | **Não.** O campo vem vazio da Yampi neste espelho |

A coluna "criados" é justamente a que testa a hipótese principal do documento (o pixel dispara no
fechamento, não no pagamento). **Ela precisa sair do export da Yampi** — é o item 2 da seção "Como
responder", e continua valendo. Tudo o mais abaixo está fechado.

---

## 1. BLOCO 1 — Pedidos por dia

Todos os canais da loja, sem filtro de origem.

| Data | Pedidos criados | Pedidos **pagos** | Receita — criados (R$) | Receita — **pagos** (R$) |
|---|---|---|---|---|
| 10/08/2026 (seg) | _ver Yampi_ | 8 | _ver Yampi_ | 1.102,69 |
| 11/08/2026 (ter) | _ver Yampi_ | 10 | _ver Yampi_ | 868,55 |
| 12/08/2026 (qua) | _ver Yampi_ | 12 | _ver Yampi_ | 2.185,14 |
| 13/08/2026 (qui) | _ver Yampi_ | 18 | _ver Yampi_ | 2.585,97 |
| 14/08/2026 (sex) | _ver Yampi_ | 6 | _ver Yampi_ | 814,94 |
| 15/08/2026 (sáb) | _ver Yampi_ | 3 | _ver Yampi_ | 408,66 |
| 16/08/2026 (dom) | _ver Yampi_ | 15 | _ver Yampi_ | 2.102,78 |
| 17/08/2026 (seg) | _ver Yampi_ | 7 | _ver Yampi_ | 1.086,51 |
| 18/08/2026 (ter) | _ver Yampi_ | 10 | _ver Yampi_ | 1.145,29 |
| 19/08/2026 (qua) | _ver Yampi_ | 8 | _ver Yampi_ | 1.696,01 |
| **TOTAL** | — | **97** | — | **13.996,54** |

Receita = valor total do pedido, frete incluído, líquido do desconto dado ao cliente (é o que ele
efetivamente pagou). Conferido item a item numa amostra: `valor = itens + frete − desconto`.

Um pedido do período não é da Yampi (venda manual de balcão, R$ 216,00 em 12/08). Ele entra nos
totais "todos os canais" do Bloco 2 e está fora da linha Yampi acima.

---

## 2. BLOCO 2 — Receita total da loja e investimento em mídia

| | 10 a 15/08 (6 dias) | 17 a 19/08 (3 dias) | Variação **por dia** |
|---|---|---|---|
| Receita total da loja — todos os canais (R$) | 8.181,95 | 3.927,81 | **−4,0 %** |
| Número total de pedidos pagos | 58 | 25 | **−13,8 %** |
| Receita por dia (R$) | 1.363,66 | 1.309,27 | — |
| Pedidos pagos por dia | 9,67 | 8,33 | — |
| Investimento em mídia registrado no ERP (R$) | 1.700,00 | 500,00 | — |

As janelas têm tamanhos diferentes (6 dias × 3 dias), por isso a comparação que vale é **por dia**.

**Sobre o investimento:** o ERP enxerga o que saiu da conta, não o gasto diário da plataforma. No
período constam Meta ADS R$ 1.200,00 (11/08), Google ADS R$ 500,00 (13/08), Meta ADS R$ 1.205,49
(16/08) e Google ADS R$ 500,00 (17/08). São pagamentos em bloco — não servem para comparar dia a dia
com o relatório da Meta, só para dimensionar a ordem de grandeza.

> Observação de contabilidade, à parte desta verificação: duas transferências para conta bancária
> (R$ 1.000,00 em 05/08 e R$ 500,00 em 14/08) estão classificadas como "Tráfego Pago" no ERP. Não são
> mídia. Vale reclassificar.

---

## 3. BLOCO 3 — Clientes novos × recorrentes

Sobre os pedidos **pagos**. Critério de recorrente: mesmo cliente com pedido pago anterior a esta
compra, em qualquer data. O ERP unifica cliente por **e-mail** na importação — foi esse o critério
usado.

| | 10 a 15/08 | 17 a 19/08 |
|---|---|---|
| Pedidos de clientes **novos** (primeira compra) | 47 | 20 |
| Pedidos de clientes **recorrentes** | 10 | 5 |
| % recorrentes | 17,5 % | 20,0 % |
| Ticket médio — novos (R$) | 140,29 | 162,66 |
| Ticket médio — recorrentes (R$) | 137,25 | 134,93 |

**Leitura:** a proporção de recorrentes praticamente não mudou entre as duas janelas (17,5 % → 20,0 %,
diferença de 1 pedido). A hipótese "o anúncio passou a colher venda de cliente antigo" **não se
sustenta nos dados** — a base de 17–19 continua sendo de cliente novo, na mesma proporção de antes.

---

## 4. BLOCO 4 — Duplicidade e pedidos de teste (16 a 19/08)

| Verificação | Resultado |
|---|---|
| Pedidos duplicados (mesmo cliente, mesmo valor, menos de 30 min) | **0** |
| Pedidos de teste internos (valor até R$ 5,00) | **0** |
| Pedidos cancelados ou estornados depois de criados | **0** |
| Devoluções abertas de pedidos do período | **0** |

**O dia 19/08 teve algo fora do normal?** No ERP, não. Foram 8 pedidos pagos, de 8 clientes
distintos, somando R$ 1.696,01, maior pedido R$ 472,00, nenhuma duplicidade e nenhum cancelamento.
O que é atípico no dia 19/08 está do lado da Meta, não da loja — ver a seção 5.

---

## 5. Confronto com os números da Meta

### 5.1 Dia a dia

| Data | Meta — compras | ERP — pagos | Meta — receita (R$) | ERP — receita (R$) |
|---|---|---|---|---|
| 10/08 | 4 | 8 | 473,54 | 1.102,69 |
| 11/08 | 6 | 10 | 655,40 | 868,55 |
| 12/08 | 7 | 12 | 694,12 | 2.185,14 |
| 13/08 | 10 | 18 | 1.824,82 | 2.585,97 |
| 14/08 | 7 | 6 | 666,22 | 814,94 |
| 15/08 | 3 | 3 | 739,03 | 408,66 |
| 16/08 | 7 | 15 | 2.007,68 | 2.102,78 |
| 17/08 | 5 | 7 | 626,99 | 1.086,51 |
| 18/08 | 8 | 10 | 1.021,91 | 1.145,29 |
| **19/08** | **15** | **8** | **2.729,78** | **1.696,01** |
| **TOTAL** | **72** | **97** | **11.439,49** | **13.996,54** |

Como o próprio documento adverte, o dia a dia não fecha por causa da janela de atribuição. A leitura
válida é o total e a comparação entre janelas.

### 5.2 O que os números dizem

**a) A campanha reivindica quase toda a loja.** No total de 10 dias, a Meta atribui 72 compras a UMA
campanha, contra 97 pedidos pagos da loja inteira, em todos os canais — 74 % de tudo. Em receita,
R$ 11.439,49 contra R$ 13.996,54 da loja inteira: 82 %.

**b) Na janela 17–19/08, a Meta reporta MAIS venda do que a loja fez.** É o achado mais duro:

| 17 a 19/08 | Meta | Loja inteira (real) | Meta / real |
|---|---|---|---|
| Compras | 28 | 25 | **112 %** |
| Receita | R$ 4.378,68 | R$ 3.927,81 | **111 %** |

Uma campanha não pode gerar mais compras do que a loja inteira recebeu, em todos os canais somados.

**c) A loja não cresceu — encolheu de leve — enquanto a Meta reportou alta forte.** É exatamente o
sinal que o documento aponta como o mais importante:

| Por dia | 10–15/08 | 17–19/08 | Variação |
|---|---|---|---|
| Compras reportadas pela Meta | 6,17 | 9,33 | **+51 %** |
| Receita reportada pela Meta | R$ 842,19 | R$ 1.459,56 | **+73 %** |
| Pedidos pagos reais da loja | 9,67 | 8,33 | **−14 %** |
| Receita real da loja | R$ 1.363,66 | R$ 1.309,27 | **−4 %** |
| Investimento diário Meta | R$ 160,76 | R$ 168,56 | +5 % |

Com investimento praticamente igual, a plataforma passou a reportar 51 % mais compras enquanto a
loja vendeu 14 % menos por dia.

**d) O dia 19/08 sozinho.** Meta: 15 compras, R$ 2.729,78. Loja inteira: 8 pedidos pagos,
R$ 1.696,01 — 188 % das compras e 161 % da receita, sem nenhuma duplicidade, cancelamento ou pedido
de teste do lado da loja.

---

## 6. Conclusão

**O gatilho de alerta do documento foi atingido, e pelo caminho mais forte previsto nele:** a receita
real da loja ficou parada (de fato caiu 4 % por dia) enquanto a Meta passou a reportar 73 % mais
receita por dia, com o mesmo investimento diário. E, na janela 17–19/08, o volume reportado **excede
o total da loja em todos os canais** — 112 % das compras e 111 % da receita.

As explicações que dependiam da loja estão descartadas: não houve duplicidade, pedido de teste,
cancelamento ou estorno no período (Bloco 4), e a proporção de clientes recorrentes praticamente não
mudou (Bloco 3), o que afasta a hipótese de o anúncio estar colhendo recompra que aconteceria de
qualquer jeito.

Sobra o rastreamento. As duas causas compatíveis com o quadro:

1. **Falha de deduplicação entre Pixel e API de Conversões** no checkout externo da Yampi — a mesma
   compra contada duas vezes. É a hipótese que melhor explica reportar mais compras do que existem.
2. **Compras contadas no fechamento do pedido, não no pagamento** — PIX e boleto gerados e não pagos
   entrariam para a Meta e não para o caixa.

**As duas podem estar acontecendo juntas, e uma delas ainda não dá para separar com esta base.** Para
fechar o diagnóstico falta um único número, que só a Yampi tem: **quantos pedidos foram CRIADOS por
dia, pagos ou não**, de 10 a 19/08. Se os criados forem próximos de 72 e os pagos são 97 — hipótese 2
explica. Se os criados também ficarem bem abaixo de 72 — é deduplicação, hipótese 1.

**Recomendação:** manter o aumento de orçamento congelado até o export da Yampi com `data_criacao`,
`data_pagamento`, `status`, `valor_total`, `forma_pagamento` e `email_cliente` para o período. É uma
exportação de dez dias, e fecha a conta.

---

*Números apurados diretamente na base do ERP em 20/08/2026. Toda a apuração é reproduzível: os
pedidos estão em Pedidos → Todos os pedidos, filtrando o período de 10 a 19/08.*
