# FRENESI · ERP — Rastreamento de pedidos

Como a informação de entrega chega da Yampi e das transportadoras ao ERP, o que ela contém de fato, e o contrato proposto para o site consultar o rastreio dentro do detalhamento de cada pedido.

| | |
|---|---|
| **Documento** | v6 · 13/08/2026 |
| **Origem dos dados** | Yampi API v2 (dooki) + Frenet |
| **Banco do ERP** | PostgreSQL 17 · Supabase |
| **Base atual** | 602 pedidos · 395 com código |

> **O que mudou da v4 para cá**
>
> Esta versão responde ao documento **"Respostas às decisões de §9" (r2)** do desenvolvimento do site. Três mudanças:
>
> 1. **O endpoint de §7 existe.** Foi implementado com as cinco decisões já incorporadas — busca por documento com pedido opcional, lista de até 10, `descricaoResumida`, entrega local fechando com "Entregue em {data}". Falta só publicar e emitir a chave.
> 2. **A divergência de 16 × 10 dígitos do adendo r2 não existe** — era erro do exemplo da v4, e a verificação está em §8. O `note` carrega exatamente a chave que o ERP já usa. Nenhuma das hipóteses (a), (b) ou (c) precisa ser testada.
> 3. **O `shopify_gid` passou a ser guardado**, como o adendo pediu.
>
> **v6, no mesmo dia:** o suporte da Frenet respondeu como o webhook realmente funciona, e **ele não serve a esta operação** (§3c). Isso derruba a premissa de que a defasagem viraria "praticamente tempo real", e por isso a **opção B foi implementada** — o pedido em trânsito é reconsultado ao vivo quando o cliente abre a página (§7).
>
> Da v3 para a v4, para quem está entrando agora: a timeline da transportadora saiu do papel e o campo `eventos` deixou de ser promessa (§3 e §3b).

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
| Frenet | `POST /tracking/trackinginfo`: ocorrências de Correios e J&T. Jadlog volta vazia — ver §3b | ❌ Indisponível nesta operação — ver §3c | Header com token da conta |
| Melhor Envio | Endpoint de rastreio dos envios da conta | Webhooks disponíveis — confirmar cobertura de eventos de rastreio | OAuth2 (token de 30 dias, renovado por refresh) |

O webhook da Frenet seria o desenho ideal — cada evento chegando empurrado em vez de o ERP perguntar por centenas de códigos. **Ele está fora de alcance por um motivo estrutural, não por falta de cadastro**; §3c explica.

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

Três consequências para o desenho da tela: **entrega local** (motoboy) nunca terá código e precisa de um texto próprio; a **transportadora nem sempre é conhecida** — o campo pode vir nulo e a tela deve degradar para "código de rastreio" sem nome de empresa; e o rótulo do serviço **não serve como nome de transportadora** — mostrar "ME_STANDARD_33" ao cliente não comunica nada.

---

## §7 · API para o site ✅ implementada, aguardando publicação

> **Situação**
>
> O endpoint **existe**, com as cinco decisões do documento de respostas já incorporadas. Ele está construído e testado; falta subir para produção e emitir a chave para o site. `RASTREIO_API_KEY` e `RASTREIO_ORIGENS` são as duas variáveis de ambiente que faltam definir.

### Requisição

Duas formas, conforme a Decisão 1 do site — **o documento é obrigatório nas duas**, o número do pedido é o filtro opcional:

```http
GET https://{erp}/api/publico/rastreio?documento={cpf|email}
      → os últimos 10 pedidos do cliente

GET https://{erp}/api/publico/rastreio?documento={cpf|email}&pedido={numero}
      → um pedido. Aceita YP-1510190959842609, 1510190959842609, SH-1885 ou #1885

Headers:
  X-API-Key: <chave emitida para o site>
```

O `?pedido=` é normalizado no ERP: dezesseis dígitos é Yampi, número curto é loja, com ou sem prefixo, com ou sem `#`. O site manda o que tiver em mãos e não precisa perguntar nada ao cliente.

O segundo fator não é burocracia: sem ele, quem souber a sequência dos números consegue varrer os pedidos da loja inteira e ler destino e status de outras pessoas. Com CPF ou e-mail exigido, a consulta só responde a quem já tem o dado.

> **Detalhe da implementação que vale registrar**: cliente **sem CPF cadastrado** não é liberado por qualquer sequência de onze dígitos. Sem essa guarda, as centenas de clientes sem CPF na base virariam pedidos abertos a qualquer chute — a conferência exige que o dado exista dos dois lados.

### Resposta 200

A resposta é sempre `{ "pedidos": [ … ] }` — array, mesmo quando o `?pedido=` foi informado e ele traz um item só. Uma forma só para os dois modos evita o `if` no site.

```json
{
  "pedidos": [{
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
    { "quando": "2026-08-12T11:12:00-03:00",
      "descricao": "Objeto entregue ao destinatário - Queremos te ouvir! Responda a uma pesquisa rápida e nos ajude a melhorar a sua experiência: https://survey3.medallia.com/?correios-nps",
      "descricaoResumida": "Objeto entregue ao destinatário",
      "local": "CATAGUASES-MG", "entregue": true },
    { "quando": "2026-08-12T09:00:00-03:00",
      "descricao": "Objeto saiu para entrega ao destinatário - É preciso ter alguém no endereço",
      "descricaoResumida": "Objeto saiu para entrega ao destinatário",
      "local": "CATAGUASES-MG", "entregue": false },
    { "quando": "2026-08-10T14:43:00-03:00",
      "descricao": "Objeto postado", "descricaoResumida": "Objeto postado",
      "local": "Muriae-MG", "entregue": false }
  ],
  "atualizadoEm": "2026-08-13T17:45:00-03:00"
  }]
}
```

`marcos` são os fatos que o ERP conhece pela Yampi e sempre vêm preenchidos. `eventos` é a timeline da transportadora — **na v3 este campo era uma promessa vazia; agora vem populado** nos envios de Correios e J&T, do mais recente para o mais antigo.

**`descricaoResumida` foi implementada**, como o site pediu: tira URLs soltas e os apêndices que vêm depois do travessão ("Queremos te ouvir…", "por favor aguarde", "É preciso ter alguém no endereço"). Ela **nunca volta vazia** — se a limpeza comer o texto todo, o valor é a descrição crua, porque ver algo estranho é melhor que ver nada.

`descricao` continua ao lado, crua, sem reescrita. Confirmando o que o site pediu para registrar: **ela pode conter URLs de terceiros** — os Correios anexam link de pesquisa de satisfação. Não renderizar como HTML é a decisão certa.

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

- **CORS**: liberado apenas para as origens em `RASTREIO_ORIGENS`. Sem a variável definida, **nenhum** cabeçalho de CORS é emitido — abrir para `*` por padrão faria de qualquer site uma fachada para consultar pedidos da FRENESI. O `OPTIONS` de preflight responde 403 para origem não listada.
- **Cache**: `Cache-Control: private, max-age=300`, como o site aprovou.
- **Chave**: `RASTREIO_API_KEY`. **Sem ela definida a rota fica fechada, respondendo 401 a tudo** — uma rota pública que libera geral porque alguém esqueceu de configurar é pior que uma rota que não existe.
- **Teto por IP**: 60 consultas/min, contadas na memória de cada instância. Registrando a limitação honestamente: não é rate limit distribuído — um atacante com muitos IPs passa. Ele resolve o caso que importa, que é script único varrendo documentos. Se a rota virar alvo de verdade, a contagem migra para o banco.

### Atualidade — mista (A + B em trânsito) ✅ implementada

O site aceitou a recomendação, com a previsão de que "a mista degenere naturalmente para sempre A" quando o webhook estivesse ligado. **Essa previsão caiu junto com o webhook** (§3c): sem push, o espelho puro deixaria o cliente vendo o estado de até uma hora atrás — justamente na hora em que ele abre a página para ver se o pedido andou.

Por isso o **B está implementado**, com três limites que impedem a rota anônima de virar amplificador contra a nossa própria cota:

- só pedido **em trânsito** — entregue não muda mais, e sem código não há o que perguntar;
- só quando a última leitura passou de **30 minutos** — quem recarrega a página cinco vezes não vira cinco chamadas à Frenet;
- só na consulta de **um pedido**, nunca na lista — dez pedidos virariam dez chamadas numa requisição só.

Falha na consulta ao vivo é **silenciosa**: o espelho responde de qualquer jeito. Página de rastreio que devolve erro porque a transportadora está lenta é pior que página com o dado de uma hora atrás.

Na prática: pedido em trânsito que o cliente abre responde com o dado de agora; todo o resto vem do espelho, em menos de 100 ms.

---

## §8 · Como o site encontra o pedido

Três chaves possíveis, em ordem de preferência:

| Chave | Campo no ERP | Situação |
|---|---|---|
| E-mail ou CPF do cliente | `clientes.email` · `cpf` | ✅ **chave primária de busca**, como o site decidiu. Mesmo modelo do Portal de Devoluções, que o cliente já conhece. |
| Número do pedido na Yampi | `id` (`YP-…`) | ✅ **confiável** — presente em 100% dos pedidos. É o número que aparece nos e-mails da Yampi ao cliente. |
| Número do pedido na loja | `shopify_numero` | ⏳ **vazio, mas destravável** — está nulo nos 602 pedidos. O adendo r2 achou a causa; ver abaixo. |

### O vínculo: confirmado, e sem a divergência que o adendo temia ✅

O adendo r2 acertou onde o dado mora: a integração Yampi→Shopify escreve `Pedido Yampi {numero}` no campo **Observações** (`note`) do pedido da loja.

**A divergência de comprimento não existe.** O adendo comparou os 16 dígitos do `note` (`1510190959842609`) com um `YP-1510190975` de 10 dígitos tirado do exemplo da v4 — e **aquele exemplo era fictício, escrito à mão neste documento**. Verificação no banco, agora:

- os **602** pedidos do ERP têm chave de **16 dígitos**, sem uma única exceção;
- `YP-1510190959842609` **existe**, é do cliente `isabellic.morato@gmail.com`, comprado em 11/08/2026 às 21h08 — bate com o `SH-1885` de 11/08 que o adendo inspecionou.

Ou seja: o `note` carrega **exatamente** a chave que o ERP já usa. As hipóteses (a), (b) e (c) do adendo podem ser descartadas, e o critério de aceite de 20 pedidos vira conferência de rotina, não investigação. O erro foi do exemplo neste documento, e está corrigido nesta versão.

**Sobre a rotina não ter achado nada:** ela **já procura no `note`** — a expressão varre `sourceIdentifier`, `note` e `customAttributes` atrás de qualquer sequência de 6+ dígitos e casa com a chave da Yampi. Logo, a regra de casamento não é o problema; a falha está antes, na leitura dos pedidos da Shopify (escopo, credencial ou janela de datas). Para não ficar no chute, a rodada agora informa **quantos pedidos foram lidos** e **quantos traziam referência** — dois números que separam "a Shopify não devolveu nada" de "devolveu e nenhum casou", que hoje produziam a mesma mensagem inútil na tela.

**`shopify_gid` foi adicionado**, como o adendo recomendou: o `name` é rótulo de exibição e muda se a loja for renumerada; o GID é o identificador estável que a Admin API aceita, e é dele que o espelhamento de fulfillment precisa.

O endpoint já aceita `?pedido=SH-1885` — ele passa a resolver assim que a coluna estiver preenchida, sem mudança no site.

### Já disponível sem API nenhuma

Quando o ERP espelha o envio na loja, ele cria o *fulfillment* com o código de rastreio (`tracking_number`) no próprio pedido da Shopify — o tema pode ler isso nativamente, sem integração. É o caminho que atende a conta de clientes hospedada pela Shopify, onde o tema não injeta código. Duas ressalvas: depende do vínculo acima; e traz o código, não a timeline nem o status normalizado — que é o que a API de §7 acrescenta na página "Rastreie seu pedido".

---

## §9 · Decisões — todas respondidas ✅

As cinco decisões foram respondidas pelo desenvolvimento do site e **já estão implementadas**:

| # | Decisão | Resposta do site | Como ficou |
|---|---|---|---|
| 1 | Identificador | Documento como chave primária, pedido opcional; aceitar os dois números | ✅ Duas formas de chamada, `?pedido=` normaliza `YP-`, `SH-`, `#` ou número cru |
| 2 | Segundo fator | E-mail **ou** CPF, os dois aceitos | ✅ Igual ao Portal de Devoluções, com a guarda do cadastro sem CPF |
| 3 | Atualidade | Mista (A padrão, B em trânsito) | ⏳ A implementado; B fica para depois de medir com o webhook ligado (§7) |
| 4 | Link externo | ERP devolve pronto | ✅ `url` e `rastreioUrl`. Transportadora desconhecida devolve `null`, não link genérico |
| 5 | Entrega local | Flag basta; fechar com "Entregue em {data}" igual aos demais | ✅ `entregaLocal` no contrato e rótulo idêntico ao das transportadoras |
| — | `descricaoResumida` | Pediram o campo opcional | ✅ Implementado, com fallback para a crua |

### A ordem de precedência que o site propôs está correta

`eventos` → senão `rastreioUrl` → senão `url` → senão "ainda não escaneado". É exatamente o que o ERP faz na tela interna, e por isso ela está registrada aqui como parte do contrato, não como sugestão.

### O que falta, e de quem depende

| Providência | De quem | Situação |
|---|---|---|
| Publicar o endpoint e emitir `RASTREIO_API_KEY` | ERP | ⏳ Código pronto; sobe no próximo deploy. A chave e as origens de CORS vão por variável de ambiente |
| Backfill do `shopify_numero` pelo `note` | ERP | ⏳ Depende do diagnóstico de por que a leitura da Shopify não devolve pedidos (§8) |
| Token de API da Frenet | Operação | ✅ Em uso. Convém rotacionar por higiene |
| ~~Webhook de tracking da Frenet~~ | — | ❌ **Saiu da lista.** Não existe cadastro de URL na Frenet: ela é campo do pedido criado por API, e aqui as etiquetas saem do painel (§3c). **Não abrir chamado.** A consulta ao vivo de §7 cobre a latência |
| Autorização OAuth do Melhor Envio | Operação | ⏳ Client id e secret configurados; falta a autorização no navegador, em Configurações → Integrações |
| DNS de `erp.frenesiperfumes.com.br` | Operação | ❌ Ainda não aponta para o ERP. Bloqueia o webhook da Frenet e o retorno do OAuth — e é o domínio que o site vai chamar |

> **Próximo passo**
>
> Publicar o endpoint, mandar a chave e a URL para o desenvolvedor, e validar juntos com pedidos reais das quatro situações: timeline completa (Correios), timeline completa (J&T), só link (Jadlog) e entrega local (motoboy). São os quatro degraus que a página precisa saber desenhar.

---

*FRENESI ERP · documento técnico de integração · v6, 13/08/2026. Escrito a partir do código em produção, da base de dados, de respostas reais da API da Frenet, do documento de respostas r2 do desenvolvimento do site e do esclarecimento do suporte da Frenet sobre o webhook.*
