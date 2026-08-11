# FRENESI ERP — estado do sistema

> Atualizado em 11/08/2026, ao fim do checkup completo da plataforma.
> Critério de "real": a tela lê e grava dados da operação (Supabase, Yampi,
> Shopify ou Mercado Pago). Telas que só mostravam números de exemplo foram
> **removidas do sistema** — menu que promete o que não existe ensina o
> operador a desconfiar do que existe.

## O placar

**30 telas, todas reais.** Zero telas de demonstração — o selo "números de
demonstração" foi aposentado junto com elas.

---

## Módulo a módulo

### Dashboard
Tudo derivado da operação: vendas do mês saem do DRE, caixa do saldo
consolidado das contas, pendências dos pedidos e do extrato reais. Alertas
agregados — uma linha por assunto.

### Pedidos — 4 telas
Todos os pedidos (importação da Yampi com transações de pagamento, sincronia
automática ao abrir e de hora em hora), Rastreamento e entregas (espelho de
envios na Shopify), Devoluções (portal ligado), Ocorrências (varredura
automática na rotina).

### Produtos — 3 telas
Catálogo (edição e criação), Precificação (preço do concorrente + publicação
na Shopify), Concorrentes (coleta de preços).

### Estoque — 7 telas
Perfumes base, Carga inicial, Derivados, Movimentações, Lotes e perda real,
Sincronia Shopify, Inventário. A sincronia agora é de mão dupla e automática:
o catálogo reimporta sozinho ao abrir a tela (12 h de validade) e o estoque
calculado é **aplicado na loja pela rotina de hora em hora** — o botão só
existe para quem não quer esperar. Base sem carga inicial fica fora da
escrita de propósito (zero ali significa "não sei", não "acabou").

### Produção
Ordens de envase, conclusão com perda real por lote.

### Financeiro — 7 telas
- **Lançamentos**: criar, editar, excluir, recebimento parcial, recorrência.
- **Contas**: criar, editar, remover, saldo informado com data.
- **Extrato**: importação automática do Relatório de Liberações do Mercado
  Pago (pedido persistido — sobrevive a F5), conciliação por id de transação
  da Yampi, filtros por período na URL, movimento interno fora da fila.
- **Conciliação**: automática, com tarifa real; visões por URL.
- **DRE**: receita da loja + vendas fora da loja, ponto de equilíbrio.
- **Categorias** (entrada e saída) e **Integração contábil** (CSV).

### CRM — 2 telas
- **Clientes**: derivado dos pedidos importados, com filtros e exportação
  CSV real.
- **Carrinhos abandonados**: lidos **ao vivo** do checkout da Yampi;
  prioridade por valor × recência; botão que abre o WhatsApp com a mensagem
  de recuperação pronta. Carrinho recuperado some sozinho.

### Cupons
Lidos ao vivo da Yampi (`/pricing/promocodes`): vigência, usos contra o
limite, alerta de expiração em 7 dias, cupom sem freio. Criar e pausar é no
painel da Yampi — a tela é o retrato fiel.

### Relatórios
Curva ABC por perfume (tamanhos de frasco agrupados) e vendas por canal,
derivados dos pedidos pagos.

### Configurações — 3 telas
Visão geral (estado real das conexões), Parâmetros de precificação,
Integrações (diagnóstico de Shopify, Yampi e Mercado Pago).

---

## O que saiu do sistema (e por quê)

Atendimento, Meu Assessor IA (5 telas), Kits e combos, Campanhas, E-mails e
fluxos, Giftback e cashback, Rodízio de ofertas, Cupons de avaliação,
Usuários e permissões, Dados da empresa, Notificações, Logs e auditoria.

Eram especificações de produto com números inventados — úteis como maquete,
perigosas como tela de decisão. O código de domínio (puro e testado) ficou;
se um módulo desses ganhar motor de verdade, a tela volta lendo dados reais.

## Automação — o que roda sozinho

| Quando | O quê |
|---|---|
| Rotina de hora em hora (`/api/financeiro/sincronizar`) | Pedidos da Yampi → estoque aplicado na Shopify → extrato do Mercado Pago (espera o relatório ficar pronto) → varredura de ocorrências |
| Ao abrir Pedidos | Sincroniza se a última leitura passou de 30 min |
| Ao abrir Extrato | Atualiza se passou de 10 min |
| Ao abrir Sincronia Shopify | Reimporta o catálogo se passou de 12 h |
| A cada importação de pedidos | Reservas recalculadas, extrato ligado às vendas por id de transação |

## Defeitos conhecidos e limitações honestas

1. **Latência do Mercado Pago.** O Relatório de Liberações é gerado por eles
   e já levou mais de 6 minutos. O pedido fica registrado no banco e qualquer
   atualização posterior importa sem pedir de novo — mas extrato "em tempo
   real" não existe com essa API.
2. **Cron de hora em hora exige Vercel Pro.** No Hobby o agendador roda uma
   vez por dia; a atualização ao abrir as telas cobre o uso diário.
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
