# FRENESI · ERP — Rastreamento de pedidos

Como a informação de entrega chega da Yampi e das transportadoras ao ERP, o que ela contém de fato, e onde ainda há buraco.

| | |
|---|---|
| **Documento** | v7 · 13/08/2026 · **interno** |
| **Origem dos dados** | Yampi API v2 (dooki) + Frenet |
| **Banco do ERP** | PostgreSQL 17 · Supabase |
| **Base atual** | 602 pedidos · 395 com código |

> **O que mudou na v7**
>
> Este documento deixou de ser um contrato com o site e virou documentação interna. As versões v3 a v6 propunham e detalhavam um endpoint público para a loja consumir; **essa ponte foi descartada em 13/08/2026** — o cliente acompanha pelo Rastreio.net, que já roda na conta Yampi. O código foi removido; ver §7.
>
> O que **permanece**, e é o assunto daqui em diante: o ERP lê os escaneamentos da transportadora, guarda junto do pedido e mostra em Pedidos → Envios. §8 lista o que ainda falta para nenhum pedido em trânsito ficar sem acompanhamento.

---

## §1 · O caminho da informação

Seis etapas, nesta ordem. Todas em produção.

| # | Etapa | O que acontece |
|---|---|---|
| 01 | Venda no checkout | A Yampi registra o pedido, o pagamento e o endereço. |
| 02 | Etiqueta manual | A operação emite na Frenet ou no Melhor Envio. O código volta para a Yampi. |
| 03 | Entrega confirmada | A Yampi marca `delivered` e grava a data. |
| 04 | ERP importa | Rotina de hora em hora grava tudo no banco do ERP. |
| 05 | Eventos da transportadora | O ERP consulta a Frenet e guarda cada escaneamento junto do pedido (§3b). |
| 06 | Cliente acompanha | Pelo Rastreio.net, que já roda na conta Yampi. O ERP não serve rastreio ao site (§7). |

> **Por que passar pelo ERP e não consultar a Yampi direto**
>
> As credenciais da Yampi dão acesso de escrita a pedidos, cupons e clientes — elas não podem circular numa integração de vitrine. O ERP já detém essas credenciais com segurança, normaliza os estados e é quem cruza o pedido da loja com o pedido da Yampi. O site fala com o ERP; só o ERP fala com a Yampi.

---

## §2 · Leitura na Yampi ✅ no ar

O ERP é cliente da API v2 da Yampi (dooki). Autenticação por par de chaves de conta, nunca por usuário final:

```http
GET https://api.dooki.com.br/v2/{alias}/orders
     ?include=customer,items,status,shipping_address,transactions,payments
     &date=created_at:{de}|{ate}
     &limit=50&page={n}

Headers:
  User-Token:      <YAMPI_USER_TOKEN>
  User-Secret-Key: <YAMPI_SECRET_KEY>
```

### Cadência

- **De hora em hora**, por rotina agendada (Netlify Scheduled Function → `POST /api/financeiro/sincronizar`), com janela dos **últimos 10 dias** de pedidos.
- **Sob demanda**, ao abrir as telas de Pedidos e Financeiro no ERP.
- Reimportar é seguro: o pedido tem chave própria (`YP-{número}`) e a gravação é um *upsert*.

**Consequência prática:** o que o ERP mostra tem no máximo ~1 hora de atraso em relação à Yampi. Para o rastreio da transportadora existe o botão "Atualizar agora" em Pedidos → Envios, que pergunta na hora.

### Campos de entrega que a Yampi devolve

| Campo Yampi | Significado | Vira, no ERP |
|---|---|---|
| `number` | Número do pedido na Yampi | `id = "YP-{number}"` |
| `track_code` | Código de rastreio da transportadora | `rastreio` |
| `shipment_service` | Serviço/plataforma do frete contratado | `servico_frete` |
| `delivered` | Booleano de entrega concluída | `envio = 'entregue'` |
| `date_delivery` | Data da confirmação de entrega | `entregue_em` |
| `status.data.alias` | Estado do pedido (pago, enviado, entregue…) | `pagamento`, `envio` |
| `shipping_address` | Cidade, UF, CEP, logradouro | `destino`, `cep`, `logradouro` |
| `marketplace_sale_number` | Número do pedido na loja de origem | `shopify_numero` |

---

## §3 · Quem tem os eventos da transportadora ✅ resolvido

> ⚠️ **O ponto de partida**
>
> A Yampi entrega **o código de rastreio e a confirmação de entrega** — ela **não** devolve o histórico de escaneamentos da transportadora ("objeto postado", "saiu para entrega", "em trânsito para CTE Curitiba"). Essa parte vem de quem emitiu a etiqueta, e é o que o ERP passou a buscar sozinho — ver §3b.

O **Rastreio.net** (Empreender), instalado na conta Yampi, coleta esses escaneamentos e notifica o cliente por e-mail, WhatsApp e SMS. É ele que atende o cliente, e continua assim.

> ⚠️ **O que o Rastreio.net não pode ser: fonte de dados do ERP**
>
> A central de ajuda deles responde (artigo de 24/03/2026): *"não é possível conectar seu sistema de produção interno no Rastreio.Net via API. É necessário que você integre uma plataforma de ecommerce para utilizar o aplicativo."*
>
> Ele é consumidor de dados, não fornecedor. Ótimo para avisar o cliente; inútil para a operação saber que um objeto está parado há seis dias.

Daí a decisão: **o ERP lê direto dos gateways** — Frenet e Melhor Envio, que emitiram 100% das etiquetas (§6). Sem custo novo, porque as duas contas já existem para gerar etiqueta. É essa base que alimenta a fila de ocorrências.

### O que os gateways expõem

| Gateway | Leitura | Push | Autenticação |
|---|---|---|---|
| Frenet | `POST /tracking/trackinginfo`: ocorrências de Correios e J&T. Jadlog volta vazia — ver §3b | ❌ Indisponível nesta operação — ver §3c | Header com token da conta |
| Melhor Envio | Endpoint de rastreio dos envios da conta | Webhooks disponíveis — confirmar cobertura de eventos de rastreio | OAuth2 (token de 30 dias, renovado por refresh) |

O webhook da Frenet seria o desenho ideal — cada evento chegando empurrado em vez de o ERP perguntar por centenas de códigos. **Ele está fora de alcance por um motivo estrutural, não por falta de cadastro**; §3c explica. Sem ele, a varredura de hora em hora é o que sustenta a leitura, e o botão "Atualizar agora" cobre a pressa.

O que essa leitura produz na prática, com números medidos, está em §3b.

---

## §3b · A timeline, na prática ✅ no ar

O ERP consulta `POST https://api.frenet.com.br/tracking/trackinginfo`, guarda cada ocorrência na tabela `rastreio_eventos` e confirma a entrega no pedido quando ela aparece. Roda de hora em hora, e há um botão de consulta imediata na tela de Envios. **Nenhuma dessas leituras exige que o cliente digite qualquer coisa** — o ERP já sabe o código de cada pedido.

### Duas armadilhas que valem para qualquer um que integrar a Frenet

- **O `ShippingServiceCode` não é o que a Yampi grava.** A Yampi devolve `FRENET_SEDEX_03220`; a Frenet quer `03220`. Os códigos válidos saem de `GET /shipping/info` — nesta conta: `03220` (Sedex), `03298` (PAC), `F_3` (Jadlog Package), `JTE_INT` (J&T).
- **Serviço errado não dá erro HTTP.** A resposta vem `200` com `{"ErrorMessage": "…"}` e zero ocorrências — idêntica, para quem só conta o tamanho da lista, a "o objeto ainda não foi escaneado". Quem integrar precisa testar o campo `ErrorMessage` explicitamente.

### Cobertura real, por transportadora

| Transportadora | Serviço | Histórico | Observação |
|---|---|---|---|
| Correios | `03220` · `03298` | ✅ completo | Da postagem à entrega, com local de cada escaneamento. Datas em `dd/MM/aaaa HH:mm`. |
| J&T Express | `JTE_INT` | ✅ completo | Responde mesmo quando a etiqueta saiu pelo Melhor Envio. Datas em ISO — os dois formatos convivem na mesma conta. |
| Jadlog | `F_3` | ❌ indisponível | A Frenet reconhece o objeto e devolve `TrackingEvents: []` — inclusive em pedido já entregue. O que existe é a página pública, que o ERP guarda em `rastreio_url`. |
| Não identificada | `ME_STANDARD_35` | ⏳ pendente | Códigos `TXAQ…tx`. A Frenet não tem serviço para eles; dependem da conexão com o Melhor Envio, já implementada e aguardando autorização OAuth. |

### Dos 57 pedidos em trânsito na data deste documento

| Situação | Pedidos | |
|---|---:|---|
| Timeline completa | **29** | Correios e J&T · 51% |
| Só o link | **10** | Jadlog · 18% |
| Aguardando Melhor Envio | **18** | 31% |

> ⚠️ **Lista vazia não é erro**
>
> Um pedido pode estar perfeitamente normal e não ter ocorrência nenhuma — ou porque ainda não foi escaneado, ou porque a transportadora não devolve histórico (Jadlog). Quando há `rastreio_url`, a tela oferece o link; quando não há, diz que ainda não foi escaneado. Tratar lista vazia como falha faria a operação abrir ocorrência onde não há problema.

---

## §3c · O webhook da Frenet está fora de alcance ❌

Registrado porque as duas versões anteriores deste documento afirmaram o contrário, e a informação circulou.

O suporte da Frenet respondeu em **13/08/2026**:

> *"Sobre Webhook, a URL para receber notificações é enviada no momento da criação do pedido, todos os endpoints que geram pedidos (post orders, orders/oneclick, shipments e shipments/oneclick) possuem esses dois campos para que a plataforma envie o link que o webhook vai atualizar. Sendo assim só é possível usar o Webhook a partir do momento que gere uma etiqueta aqui na Frenet via API."*

A URL **não se cadastra em lugar nenhum** — nem no painel, nem por chamado. Ela é um campo do pedido (`TrackingNotificationUrl`), informado no momento em que a etiqueta é criada **pela API de pedidos da Frenet**.

**Consequência para a FRENESI:** as etiquetas são emitidas **pelo painel**, à mão. Nenhum pedido carrega a URL, e a Frenet não tem para onde notificar. Nem os pedidos já existentes, nem os futuros — enquanto a emissão for manual.

### O que isso muda

| | Antes (premissa errada) | Agora |
|---|---|---|
| Como o evento chega | Empurrado pela Frenet, em minutos | Perguntado pelo ERP |
| Defasagem máxima | Minutos | Até 1 h pela varredura — **ou segundos**, com a consulta ao vivo de §7 |
| Providência da operação | Abrir chamado na Frenet | Nenhuma. **Não abra o chamado** |

Ligar o webhook exigiria mudar a rotina da operação: emitir as etiquetas pela API em vez do painel. É decisão de processo, não de código, e não se justifica só pela latência — a varredura cobre os 57 pedidos vivos numa rodada, e a consulta ao vivo cobre o cliente que está olhando a página agora.

A rota `/api/frenet/tracking` continua de pé, fechada, como a peça pronta caso a emissão por API aconteça um dia.

---

## §4 · Como o ERP guarda ✅ no ar

Tabela `pedidos` — colunas que interessam ao rastreamento:

| Coluna | Tipo | Semântica |
|---|---|---|
| `id` | text (PK) | Chave do pedido no ERP: `YP-1510190975` |
| `shopify_numero` | text, nulo | Número do mesmo pedido na loja — a chave de junção com o site |
| `pagamento` | enum | `pago` · `divergente` (estornado). Só estes entram no ERP |
| `envio` | enum | `nao_iniciado` · `aguardando_envio` · `enviado` · `entregue` |
| `rastreio` | text, nulo | Código da transportadora, como a Yampi informou |
| `servico_frete` | text, nulo | Serviço contratado (`FRENET_SEDEX_03220`, `ME_STANDARD_33`…) |
| `comprado_em` | timestamptz | Data da compra |
| `entregue_em` | timestamptz, nulo | Confirmação de entrega da Yampi. Inicia o prazo de devolução |
| `destino` | text, nulo | `Cidade · UF` |
| `enviado_shopify_em` | timestamptz, nulo | Quando o ERP espelhou o envio na loja |
| `entrega_shopify_em` | timestamptz, nulo | Quando o ERP marcou a entrega na loja |
| `rastreio_servico` | text, nulo | Código do serviço que a Frenet aceitou (`03220`, `F_3`…). Guardado para não redescobrir a cada consulta |
| `rastreio_url` | text, nulo | Página pública do objeto. É o que sobra quando a transportadora não devolve histórico |
| `rastreio_lido_em` | timestamptz, nulo | Última consulta à transportadora — ordena a fila da varredura |

### Tabela `rastreio_eventos`

Um registro por escaneamento. A chave primária é o **conteúdo** do evento (código + momento + descrição + local) e não um sequencial: a mesma ocorrência chega pelo webhook e pela varredura de reforço, e sem essa identidade a timeline apareceria duplicada para o cliente.

| Coluna | Tipo | Semântica |
|---|---|---|
| `id` | text (PK) | Identidade de conteúdo — é o que torna a gravação idempotente |
| `pedido_id` | text, FK | Pedido a que o evento pertence |
| `codigo` | text | Código de rastreio do objeto |
| `quando` | timestamptz, nulo | Momento do escaneamento. Nulo quando a transportadora não datou |
| `descricao` | text | Texto da transportadora, sem reescrita |
| `local` | text, nulo | Cidade/UF do escaneamento |
| `origem` | text | `frenet` · `melhorenvio` |
| `entregue` | boolean | Esta ocorrência É a entrega concluída — derivada do texto, com as negativas testadas antes |

O acesso ao banco é exclusivo do servidor do ERP (chave de serviço). O site **não** deve consultar o Supabase diretamente — a leitura acontece pela API de §7.

---

## §5 · Estados e como são derivados

O ERP normaliza o vocabulário da Yampi (que mistura português e inglês) em dois níveis: o estado bruto do envio e o **status de rastreio**, que é o que o cliente deve ver.

| `status` | Regra de derivação | Texto sugerido ao cliente |
|---|---|---|
| `pagamento-pendente` | Pagamento ainda não confirmado | Aguardando confirmação do pagamento |
| `aguardando-postagem` | Pago, sem código de rastreio | Pedido em separação — em breve você recebe o código |
| `em-transito` | Pago e com código emitido (`envio = enviado`) | A caminho |
| `entregue` | `delivered` na Yampi | Entregue em {data} |
| `entrega-nao-efetuada` | Transportadora informou retenção | Houve um problema na entrega — fale com a gente |
| `sem-movimentacao` | Mais de 15 dias da compra sem entrega confirmada | Entrega atrasada — já estamos verificando |

> **Contrato**
>
> Os identificadores acima (coluna 1) são estáveis e é sobre eles que o site deve programar. O texto em português pode mudar sem aviso — não use o rótulo como chave de comparação.

---

## §6 · Retrato da base hoje

Números reais em 12/08/2026, para dimensionar os casos que a tela precisa cobrir:

| | |
|---|---:|
| Pedidos no ERP (desde 22/05/2026) | **592** |
| Com código | **395** (67%) |
| Entregues, com data confirmada | **344** |
| Sem código (motoboy, em separação, pendentes) | **197** |

### Serviços de frete em uso

| `servico_frete` | Pedidos | Exemplo de código | Observação |
|---|---:|---|---|
| *(vazio)* | 479 | `598193609` | Anteriores ao ERP: a Yampi não informou o serviço. O formato do código identifica a transportadora |
| `ME_STANDARD_33` | 34 | `888030851683872` | **J&T Express** — descoberto pelo formato do código e confirmado na Frenet |
| `FRENET_JADLOG_PACKAGE_F_3` | 23 | `613562506` | Jadlog via Frenet · sem histórico disponível (§3b) |
| `MOTOBOY` | 22 | — | Entrega local em Muriaé, sem código de rastreio |
| `ME_STANDARD_35` | 19 | `TXAQ485921993tx` | Transportadora final não identificada · depende do Melhor Envio |
| `FRENET_SEDEX_03220` | 12 | `AD754668993BR` | Correios via Frenet |
| `FRENET_PAC_03298` | 2 | `AP321801328BR` | Correios via Frenet |
| `ME_RODOVIÁRIO_22` | 1 | — | Caso isolado, sem código |

Três consequências para a tela de Envios: **entrega local** (motoboy) nunca terá código; a **transportadora nem sempre é conhecida** — o campo pode vir nulo e a tela degrada para "código de rastreio" sem nome de empresa; e o rótulo do serviço **não serve como nome de transportadora** — a tela exibia "ME_STANDARD_33" como se fosse empresa, e isso foi corrigido.

---

## §7 · A ponte para o site foi descartada ❌

Registrado para quem vier depois, porque este documento passou três versões propondo e detalhando um endpoint público.

**Decisão de 13/08/2026: o cliente acompanha o pedido pelo Rastreio.net**, que já está instalado na conta Yampi e já notifica por e-mail, WhatsApp e SMS. Não haverá endpoint no ERP servindo rastreio para a loja.

O que foi removido do código, integralmente:

- a rota `GET /api/publico/rastreio`;
- a camada que montava a resposta pública e a consulta ao vivo que a acompanhava;
- as variáveis `RASTREIO_API_KEY` e `RASTREIO_ORIGENS` — **podem ser apagadas do ambiente**;
- o documento de contrato que havia sido preparado para o desenvolvedor do site.

**Nada disso afeta o rastreio interno.** Os eventos continuam sendo lidos, gravados e exibidos em Pedidos → Envios, com a consulta imediata pelo botão "Atualizar agora". §1 a §6 seguem valendo por inteiro — é ali que está descrito o que o ERP sabe sobre cada entrega e como.

---

## §8 · O que falta para o ERP enxergar toda entrega

O objetivo agora é interno: nenhum pedido em trânsito sem o ERP saber onde ele está. Situação dos **55 pedidos com código e ainda não entregues**:

| Grupo | Pedidos | Fonte | O que falta |
|---|---:|---|---|
| Correios e J&T | ~29 | Frenet | Nada. A varredura de hora em hora preenche |
| `TXAQ…tx` (`ME_STANDARD_35`) | 18 | Melhor Envio | **Autorizar a conexão** em Configurações → Integrações |
| Jadlog | ~10 | — | **Sem fonte de histórico.** A Frenet reconhece o objeto e devolve lista vazia, inclusive em pedido entregue |

### O caso Jadlog

É o único buraco sem solução pronta. O que existe hoje é o link público (`rastreio_url`), guardado no pedido — dá para conferir à mão, mas o ERP não consegue detectar sozinho um objeto parado.

Três saídas possíveis, em ordem de esforço:

1. **Aceitar** — a Yampi ainda confirma a entrega, então o pedido não fica perdido; o que falta é o meio do caminho.
2. **Perguntar à Frenet** se a conta pode receber ocorrências de Jadlog. Pode ser configuração da conta, não limitação da API.
3. **Migrar o volume de Jadlog** para uma transportadora que devolve histórico (Correios ou J&T), se o frete permitir.

### Vínculo com a Shopify

Continua vazio nos 602 pedidos, e é ele que trava a baixa da entrega na loja. A referência existe no `note` do pedido Shopify (§8 da v5); a falha está na leitura dos pedidos pela Admin API. A rodada agora reporta quantos pedidos leu e quantos traziam referência — dois números que dizem qual dos dois problemas é.

---

*FRENESI ERP · documento técnico de rastreamento · v7, 13/08/2026. A partir da v7 este documento é interno: descreve o que o ERP sabe sobre cada entrega, não mais um contrato com o site.*
