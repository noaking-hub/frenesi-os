# FRENESI · ERP — Rastreamento de pedidos

Como a informação de entrega chega da Yampi e das transportadoras ao ERP, o que ela contém de fato, e o contrato proposto para o site consultar o rastreio dentro do detalhamento de cada pedido.

| | |
|---|---|
| **Documento** | v4 · 12/08/2026 |
| **Origem dos dados** | Yampi API v2 (dooki) + Frenet |
| **Banco do ERP** | PostgreSQL 17 · Supabase |
| **Base atual** | 592 pedidos · 395 com código |

> **O que mudou da v3 para a v4**
>
> A timeline da transportadora **saiu do papel**: o ERP já lê e guarda os escaneamentos reais (§3 e §3b). Isso muda o campo `eventos` do contrato de "vazio por enquanto" para **populado** na maior parte dos envios — o site pode programar contando com ele. Duas correções de fato também entram aqui: a Jadlog **não** devolve histórico, e o vínculo com o número do pedido da loja **não existe** na prática (§8). O endpoint público de §7 continua sendo o único item ainda por implementar.

---

## §1 · O caminho da informação

Seis etapas, nesta ordem. As cinco primeiras já rodam em produção; a sexta é a ponte que este documento propõe.

| # | Etapa | O que acontece |
|---|---|---|
| 01 | Venda no checkout | A Yampi registra o pedido, o pagamento e o endereço. |
| 02 | Etiqueta manual | A operação emite na Frenet ou no Melhor Envio. O código volta para a Yampi. |
| 03 | Entrega confirmada | A Yampi marca `delivered` e grava a data. |
| 04 | ERP importa | Rotina de hora em hora grava tudo no banco do ERP. |
| 05 | Eventos da transportadora | O ERP consulta a Frenet e guarda cada escaneamento junto do pedido (§3b). |
| 06 | **API para o site** | Endpoint público de leitura, com chave. **Único item a implementar** (§7). |

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

**Consequência prática para o site:** a informação servida pelo ERP tem no máximo ~1 hora de atraso em relação à Yampi. Se isso não for aceitável no detalhamento do pedido, existe a variante "leitura ao vivo" descrita em §7.

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

> ⚠️ **Leia isto antes de desenhar a tela**
>
> A Yampi entrega **o código de rastreio e a confirmação de entrega** — ela **não** devolve o histórico de escaneamentos da transportadora ("objeto postado", "saiu para entrega", "em trânsito para CTE Curitiba"). Essa parte vem de quem emitiu a etiqueta, e é o que o ERP passou a buscar sozinho — ver §3b.

Quem já coleta esses escaneamentos é o **Rastreio.net** (Empreender), instalado na conta Yampi da loja: ele lê as transportadoras, notifica o cliente por e-mail/WhatsApp/SMS e mantém uma página de rastreamento personalizável. A pergunta certa, portanto, não é "que API contratar" — é **como fazer esses eventos chegarem à página de detalhes do pedido**.

> ⚠️ **Descartado: consumir os dados do Rastreio.net**
>
> A própria central de ajuda deles responde (artigo atualizado em 24/03/2026): *"não é possível conectar seu sistema de produção interno no Rastreio.Net via API. É necessário que você integre uma plataforma de ecommerce para utilizar o aplicativo."*
>
> Ou seja: o Rastreio.net é consumidor de dados, não fornecedor. Ele continua útil para notificar o cliente, mas **não pode ser a fonte da timeline do site**.

### Os dois caminhos que restavam

| Caminho | Como funciona | Visual | Esforço |
|---|---|---|---|
| **B. Direto dos gateways** ✅ *implementado* | O ERP lê os eventos no Melhor Envio e na Frenet, que emitiram 100% das etiquetas (§6), guarda junto do pedido e serve no mesmo endpoint de §7. | Da FRENESI, dentro da página do pedido. | Médio no ERP, baixo no site. Sem custo novo — as duas contas já existem e já são usadas para gerar etiqueta. |
| **C. Widget do Rastreio.net** | O site embute a página/script deles já com o código do pedido preenchido. | Deles, dentro de um bloco da sua página. | Baixo, dias. O ERP não recebe os eventos — e é essa base que alimenta as telas de exceção e ocorrência da operação. |

### O que os gateways expõem (caminho B)

| Gateway | Leitura | Push | Autenticação |
|---|---|---|---|
| Frenet | `POST /tracking/trackinginfo`: ocorrências de Correios e J&T. Jadlog volta vazia — ver §3b | Webhook *Atualização de Tracking*, cadastrado pelo suporte da Frenet, não pelo painel | Header com token da conta |
| Melhor Envio | Endpoint de rastreio dos envios da conta | Webhooks disponíveis — confirmar cobertura de eventos de rastreio | OAuth2 (token de 30 dias, renovado por refresh) |

O webhook da Frenet é o desenho ideal: em vez de o ERP perguntar de tempos em tempos por centenas de códigos, cada evento chega empurrado assim que acontece — o cliente vê a atualização em minutos, e não na próxima varredura.

> **Sobre "sem o cliente digitar código"**
>
> Esse requisito está resolvido em qualquer um dos caminhos, e não depende do Rastreio.net. A digitação só existe em página genérica de rastreio, onde o visitante chega sem contexto. Na página de detalhes do pedido o site já sabe qual é o pedido — ele envia o identificador (e o código, quando existe) e recebe o rastreio pronto.

**Decidido: caminho B**, e já implementado. É o único que entrega a timeline dentro da página da FRENESI, não depende de terceiros e não acrescenta mensalidade. O C deixa de ser necessário. O que ele produz na prática, com números medidos, está em §3b.

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

> ⚠️ **Consequência direta para o desenho da tela**
>
> `eventos` pode vir **vazio com o pedido perfeitamente normal**. A tela não pode tratar lista vazia como erro nem como "sem informação": quando o campo `rastreioUrl` vier preenchido, o certo é oferecer o link da transportadora. É exatamente o que o ERP faz internamente hoje.

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

Três consequências para o desenho da tela: **entrega local** (motoboy) nunca terá código e precisa de um texto próprio; a **transportadora nem sempre é conhecida** — o campo pode vir nulo e a tela deve degradar para "código de rastreio" sem nome de empresa; e o rótulo do serviço **não serve como nome de transportadora** — mostrar "ME_STANDARD_33" ao cliente não comunica nada.

---

## §7 · API proposta para o site ⏳ a implementar

> **Situação**
>
> Este endpoint **ainda não existe**. O contrato abaixo é a proposta para o desenvolvedor revisar; assim que estiver acordado, implemento e publico — é trabalho de poucas horas, porque os dados já estão no banco.

### Requisição

```http
GET https://{erp}/api/publico/rastreio
      ?pedido={numero}          # número do pedido na loja OU na Yampi
      &documento={cpf|email}    # 2º fator do cliente

Headers:
  X-API-Key: <chave emitida para o site>
```

O segundo fator não é burocracia: sem ele, quem souber a sequência dos números consegue varrer os pedidos da loja inteira e ler destino e status de outras pessoas. Com CPF ou e-mail exigido, a consulta só responde a quem já tem o dado.

### Resposta 200

```json
{
  "pedido": {
    "referencia":     "YP-1510190164",
    "numeroYampi":    "1510190164",
    "numeroLoja":     "1042",
    "compradoEm":     "2026-08-09T23:37:00-03:00"
  },
  "entrega": {
    "status":         "entregue",
    "rotulo":         "Entregue em 12/08",
    "transportadora": "Correios",
    "servico":        "FRENET_SEDEX_03220",
    "codigo":         "AD778124948BR",
    "url":            "https://rastreamento.correios.com.br/app/index.php?objeto=AD778124948BR",
    "rastreioUrl":    "https://rastreio.frenet.com.br/COR/AD778124948BR",
    "destino":        "Cataguases · MG",
    "entregueEm":     "2026-08-12T11:12:00-03:00",
    "entregaLocal":   false
  },
  "marcos": [
    { "quando": "2026-08-09T23:37:00-03:00", "titulo": "Pagamento confirmado", "onde": "Yampi" },
    { "quando": null, "titulo": "Código de rastreio emitido", "onde": "Correios" }
  ],
  "eventos": [
    { "quando": "2026-08-12T11:12:00-03:00", "descricao": "Objeto entregue ao destinatário",
      "local": "CATAGUASES-MG", "entregue": true },
    { "quando": "2026-08-12T09:00:00-03:00", "descricao": "Objeto saiu para entrega ao destinatário",
      "local": "CATAGUASES-MG", "entregue": false },
    { "quando": "2026-08-10T14:43:00-03:00", "descricao": "Objeto postado",
      "local": "Muriae-MG", "entregue": false }
  ],
  "atualizadoEm": "2026-08-12T17:45:00-03:00"
}
```

`marcos` são os fatos que o ERP conhece pela Yampi e sempre vêm preenchidos. `eventos` é a timeline da transportadora — **na v3 este campo era uma promessa vazia; agora vem populado** nos envios de Correios e J&T, do mais recente para o mais antigo. Cada evento tem a forma `{ "quando", "descricao", "local", "entregue" }`.

`descricao` é o texto da transportadora **sem reescrita** — inclusive com os apêndices que os Correios anexam (link de pesquisa de satisfação, por exemplo). Se a loja quiser texto mais limpo, o tratamento é do lado do site, ou eu acrescento uma versão resumida no contrato; diga qual prefere.

> ⚠️ **Dois campos parecidos, propósitos diferentes**
>
> `url` é o site da transportadora, montado pelo ERP a partir do código. `rastreioUrl` é a página que a própria Frenet devolveu para aquele objeto — e é **ela** que deve ser oferecida quando `eventos` vier vazio, que é o caso de toda a Jadlog. Quando os dois vierem nulos e `eventos` estiver vazio, o pedido genuinamente ainda não foi escaneado.

### Erros

| Código | Quando | Corpo |
|---|---|---|
| `401` | Chave ausente ou inválida | `{"erro":"nao_autorizado"}` |
| `404` | Pedido inexistente *ou* documento que não confere | `{"erro":"nao_encontrado"}` |
| `429` | Acima de 60 consultas/min por IP | `{"erro":"muitas_consultas"}` |
| `503` | Banco indisponível | `{"erro":"indisponivel"}` |

O 404 é deliberadamente ambíguo entre "não existe" e "documento errado": distinguir os dois transformaria o endpoint num verificador de quais números de pedido existem.

### Operação

- **CORS**: liberado apenas para o domínio da loja.
- **Cache**: `Cache-Control: private, max-age=300` — o dado de origem muda no máximo de hora em hora.
- **Chave**: emitida por variável de ambiente do ERP; se vazar, troco e o site atualiza. Ela dá acesso somente a esta leitura.

### Decisão pendente: atualidade do dado

- **Opção A — espelho (padrão)**: responde do banco do ERP. Rápido (<100 ms), sem consumir cota de ninguém, com até 1 h de defasagem.
- **Opção B — ao vivo**: para o pedido consultado, o ERP pergunta à Frenet na hora. Sempre atual, ~300–800 ms, e consome cota da Frenet a cada visita de cliente.
- **Recomendação**: A, com B só quando o pedido está `em-transito` — que é quando o cliente volta na página com mais frequência.

A defasagem de 1 h vale menos do que parece agora que o webhook da Frenet está previsto: com ele, cada escaneamento chega empurrado em minutos e a opção A passa a ser praticamente tempo real. Falta só o cadastro da URL, que a Frenet faz por chamado (§9).

---

## §8 · Como o site encontra o pedido

Três chaves possíveis, em ordem de preferência:

| Chave | Campo no ERP | Situação |
|---|---|---|
| Número do pedido na loja | `shopify_numero` | ❌ **indisponível** — *Correção da v3:* este campo está nulo nos 592 pedidos. A Yampi não informa o vínculo nesta loja, e a rotina que tenta descobri-lo cruzando as duas plataformas não produziu nenhuma correspondência. **O site não deve contar com esta chave** enquanto isso não mudar. |
| Número do pedido na Yampi | `id` (`YP-…`) | ✅ **confiável** — presente em 100% dos pedidos. É o número que aparece nos e-mails da Yampi ao cliente. |
| E-mail ou CPF do cliente | `clientes.email` · `cpf` | ✅ **confiável** — usado hoje pelo Portal de Devoluções para o cliente achar o próprio pedido. |

O endpoint aceitará **qualquer um dos dois números** em `?pedido=` e resolverá internamente — mas, com o vínculo da loja vazio, na prática hoje só o número da Yampi resolve. **Se o site tiver apenas o número da loja em mãos, esta é a primeira coisa a resolver**, e a resposta do desenvolvedor sobre qual identificador ele realmente possui vira a decisão mais importante da lista de §9.

### Já disponível sem API nenhuma

Quando o ERP espelha o envio na loja, ele cria o *fulfillment* com o código de rastreio (`tracking_number`) no próprio pedido da Shopify — o tema pode ler isso nativamente, sem integração. Três ressalvas: o espelhamento depende do vínculo da linha 1 acima, que hoje não existe; ele traz o código, não a timeline; e não traz o status normalizado nem a confirmação de entrega — que é justamente o que a API de §7 acrescenta.

---

## §9 · O que precisa ser decidido

A lista encurtou: a decisão da timeline saiu (caminho B, implementado) e a pergunta à Empreender deixou de fazer sentido. Restam **cinco** pontos que dependem de resposta do desenvolvedor antes de eu implementar o endpoint:

1. **Formato do identificador** ❗**crítico** — o site tem em mãos o número da loja, o da Yampi, ou os dois? Como o vínculo com a loja está vazio (§8), *esta resposta define se o endpoint é viável do jeito proposto*. Se o site só tiver o número da loja, o caminho passa a ser buscar por e-mail do cliente, ou resolver o vínculo antes.
2. **Segundo fator**: CPF, e-mail, ou o cliente já está logado (e nesse caso o site autentica e envia só o e-mail da sessão)?
3. **Atualidade**: opção A, B ou a mista de §7?
4. **Link externo**: quem monta a URL de rastreio — o ERP devolve pronta em `url` e `rastreioUrl`, ou o site prefere montar a partir de `codigo` + `transportadora`?
5. **Entrega local**: como a loja quer comunicar os pedidos de motoboy (22 hoje), que nunca terão código?

### Do lado da operação, não do desenvolvedor

| Providência | Situação | O que falta |
|---|---|---|
| Token de API da Frenet | ✅ feito | Já em uso. Convém rotacionar por higiene. |
| Webhook de tracking da Frenet | ⏳ a pedir | Não é autoatendimento: o cadastro da URL é feito **pelo suporte da Frenet**, por chamado. URL a informar: `https://erp.frenesiperfumes.com.br/api/frenet/tracking`, com um par nome/valor de token. A rota já está no ar e fica fechada até o token estar definido. |
| Aplicativo OAuth2 do Melhor Envio | ⏳ quase | Client id e secret já criados e configurados. Falta uma autorização no navegador, em Configurações → Integrações, e conferir se a URL de redirecionamento cadastrada bate com o domínio em uso. |
| Domínio `erp.frenesiperfumes.com.br` | ❌ pendente | Ainda não aponta para o ERP. O webhook da Frenet e o retorno do OAuth do Melhor Envio referenciam este endereço. |

> **Próximo passo**
>
> Com as cinco decisões acima — em especial a primeira — implemento o endpoint de §7, publico numa URL de teste com pedidos reais e devolvo a chave de acesso para o desenvolvedor integrar. Os dados que ele vai servir já estão no banco: é só a porta que falta.

---

*FRENESI ERP · documento técnico de integração · v4, 12/08/2026. Escrito a partir do código em produção, da base de dados e de respostas reais da API da Frenet, consultada com códigos de pedidos desta loja na data acima.*
