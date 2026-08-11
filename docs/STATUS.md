# FRENESI ERP — o que é real, o que é vitrine, o que falta

> Levantado em 11/08/2026, tela por tela, contra o código — não contra a memória.
> Critério: **Real** = lê e grava no Supabase com dados da operação.
> **Demonstração** = a tela existe e funciona, mas mostra dados de exemplo
> (fixtures). **Parcial** = mistura os dois.

## O placar

| | telas |
|---|---|
| Reais, com dados da operação | **28** |
| Demonstração (fixtures) | **15** |
| Parciais | **2** (Dashboard, Relatórios) |

---

## Módulo a módulo

### ✅ Pedidos — 4/4 reais
Todos os pedidos, Rastreamento e entregas, Devoluções, Ocorrências.
Importação da Yampi (com transações de pagamento), espelho de envios na
Shopify, portal de devoluções ligado.

### ✅ Estoque — 7/7 reais
Perfumes base, Carga inicial, Derivados, Movimentações, Lotes e perda real,
Sincronia Shopify (leitura e escrita), Inventário com contagem e fechamento.

### ✅ Financeiro — 7/7 reais
- **Lançamentos**: criar, editar, excluir, recebimento parcial, recorrência
  que gera ocorrências futuras, categorias de receita e despesa filtradas
  por direção.
- **Contas**: criar, editar, remover, saldo digitado com data.
- **Extrato**: importação automática do Relatório de Liberações do Mercado
  Pago (pedido persistido no banco — sobrevive a F5), conciliação por id de
  transação da Yampi, filtros na URL, movimento interno fora da fila.
- **Conciliação**: automática por venda, com tarifa real; visões
  "Precisam de ação / Conciliadas / Antes de 22/07 / Todas"; legenda na tela.
- **DRE**: receita da loja + vendas fora da loja em linhas separadas,
  subtotais derivados, ponto de equilíbrio.
- **Categorias** e **Integração contábil** (exportação CSV).

### ✅ Produção — real
Ordens, conclusão com perda real por lote.

### 🟡 Produtos — 3/4
Catálogo (real, com edição e criação), Precificação (real, com preço do
concorrente e publicação na Shopify), Concorrentes (real, com coleta).
**Kits e combos: demonstração.**

### 🟡 Dashboard — parcial
Pendências e fila são reais; os cartões de receita do mês e o fechamento de
julho ainda vêm de números de exemplo (o fechamento real de julho não existe
no ERP — os pedidos importados começam em maio, mas o financeiro começa em
22/07).

### 🟡 Relatórios — parcial
Parâmetros reais; curva ABC e canais são exemplo.

### 🟡 CRM — 1/5
Clientes (real, derivado dos pedidos importados).
**Carrinhos abandonados, Campanhas, Giftback e cashback, E-mails e fluxos:
demonstração.** Carrinhos e giftback dependem de endpoints da Yampi ainda
não integrados.

### 🔴 Promoções — 0/3 — demonstração
Cupons, Rodízio de ofertas, Cupons de avaliação.

### 🔴 Atendimento — demonstração

### 🔴 Meu Assessor IA — 0/5 — demonstração
As cinco telas existem como especificação de produto; não há motor de IA
ligado.

### 🟡 Configurações — 3/7
Visão geral (real), Parâmetros de precificação (real), Integrações (os
diagnósticos de Shopify/Yampi/Mercado Pago são reais; a lista de status é
exemplo). **Usuários, Empresa, Notificações, Logs: demonstração.**

---

## Defeitos conhecidos e limitações honestas

1. **Latência do Mercado Pago.** O Relatório de Liberações é gerado por eles
   e já levou mais de 6 minutos. O ERP não trava mais nisso: o pedido fica
   registrado no banco e qualquer atualização posterior (tela, F5 ou rotina)
   importa sem pedir de novo. Mas extrato "em tempo real" não existe com essa
   API — o que existe é atraso de minutos, automático.
2. **Cron de hora em hora exige Vercel Pro.** No plano Hobby o agendador só
   roda uma vez por dia. A tela se atualiza sozinha ao abrir (quando a última
   leitura passou de 10 min), o que cobre o uso diário mesmo no Hobby.
3. **981 itens de pedido sem SKU casado** — estoque e consumo calculados
   sobre menos da metade dos itens vendidos. Causa: catálogo da Shopify
   desatualizado no ERP. Correção: reimportar o catálogo e reimportar
   pedidos.
4. **Crédito de R$ 11.719,80 em 22/07** classificável como venda ou aporte —
   decisão do operador, não do sistema.
5. **~25 vendas do extrato sem pedido** — pagamentos de antes da importação
   de pedidos ou sem transação na Yampi. Aparecem na fila como "entrada sem
   pedido".
6. **Sem autenticação de usuários.** O ERP confia no ambiente onde roda.
   Multiusuário com permissões é a tela de Usuários — hoje demonstração.

## Ordem sugerida para o que falta

1. Reimportar catálogo Shopify → resolver os 981 SKUs (destrava estoque real).
2. Promoções e CRM reais (cupons e giftback têm API na Yampi).
3. Dashboard 100% real (remover números de julho de exemplo).
4. Relatórios reais (curva ABC derivada dos pedidos).
5. Atendimento, Assessor IA, Usuários/permissões — decidir se entram no
   escopo ou saem do menu.
