# FRENESI · ERP → Site — Resposta ao documento r2

**De:** desenvolvimento do ERP · **Para:** desenvolvimento do site/tema (Shopify)
**Ref.:** "Respostas às decisões de §9" r2 · 12/08/2026
**Este doc:** 13/08/2026 · acompanha o técnico completo, v6

---

## Resumo em cinco linhas

1. **As cinco decisões foram aceitas e já estão implementadas.** O endpoint existe, testado, aguardando publicação.
2. **A divergência de 16 × 10 dígitos do adendo não existe** — o número de 10 era um exemplo fictício do nosso documento. Nenhuma das hipóteses (a), (b), (c) precisa ser testada. Detalhe abaixo.
3. **O webhook da Frenet caiu.** Não por falta de cadastro: ele é estruturalmente indisponível para esta operação. Isso derruba a premissa de "sempre A" e por isso a **opção B foi implementada**.
4. **`descricaoResumida` implementada**, como pedido.
5. **Chave de acesso está no fim deste documento.** Falta só o DNS de `erp.frenesiperfumes.com.br`, em andamento com o suporte da Netlify.

---

## ⬅ O que precisamos de vocês

Uma coisa só bloqueia a integração, e é rápida de responder:

> ### Quais domínios exatos vão chamar o endpoint?
>
> Precisamos da lista completa, com `https://` e sem barra no fim, para liberar no CORS. Por exemplo:
>
> ```
> https://frenesiperfumes.com.br
> https://www.frenesiperfumes.com.br
> https://frenesiperfumes.myshopify.com     ← incluir se forem testar por aqui antes de publicar
> ```
>
> **Incluam tudo de onde a chamada pode partir**, inclusive ambiente de preview ou tema não publicado. Origem que faltar na lista é bloqueada pelo navegador, e o sintoma engana: o endpoint responde certo por servidor, os logs não acusam nada, e a página fica em branco. Sobra na lista não custa nada; falta custa uma tarde de depuração.

E uma segunda, sem pressa: **quando vocês querem fazer a validação conjunta?** Proponho um pedido real de cada um dos quatro degraus da seção 4 — são estados diferentes de desenho, não variações do mesmo, e é melhor descobrir isso com a gente junto do que em produção.

---

## 1 · O vínculo Yampi ↔ Shopify: o adendo acertou, e não há divergência

Vocês acertaram onde o dado mora: `Pedido Yampi {numero}` no campo Observações (`note`) do pedido Shopify.

**Sobre os 16 × 10 dígitos:** aquele `YP-1510190975` de 10 dígitos era um **exemplo fictício**, escrito à mão no nosso documento para ilustrar o formato. Não é um ID real. Verificação feita no banco agora:

- os **602** pedidos do ERP têm chave de **16 dígitos**, sem uma única exceção;
- `YP-1510190959842609` **existe no ERP** — cliente `isabellic.morato@gmail.com`, compra em 11/08/2026 às 21h08. Bate com o `SH-1885` de 11/08 que vocês inspecionaram.

O `note` carrega **exatamente** a chave que o ERP já usa. As hipóteses (a), (b) e (c) podem ser descartadas, e o critério de aceite dos 20 pedidos vira conferência de rotina em vez de investigação. O erro foi do nosso lado e está corrigido.

**Sobre a rotina não ter achado nada:** ela **já procura no `note`** — varre `sourceIdentifier`, `note` e `customAttributes` atrás de qualquer sequência de 6+ dígitos e casa com a chave da Yampi. Logo, a regra de casamento não é o problema; a falha está antes, na leitura dos pedidos da Shopify (escopo, credencial ou janela de datas). Instrumentamos a rodada para reportar quantos pedidos foram lidos e quantos traziam referência — dois números que separam "a Shopify não devolveu nada" de "devolveu e nenhum casou".

**`shopify_gid` passou a ser guardado**, como vocês recomendaram — o `name` é rótulo de exibição e muda numa renumeração; o GID é o que a Admin API aceita.

**Nada disso bloqueia vocês.** A Decisão 1 (documento como chave primária) torna o endpoint utilizável desde já; o `?pedido=SH-1885` passa a resolver quando a coluna encher, sem mudança no site.

---

## 2 · O webhook da Frenet está fora de alcance

Retificação importante, porque a versão anterior do nosso documento afirmava o contrário. Resposta do suporte da Frenet, 13/08/2026:

> *"Sobre Webhook, a URL para receber notificações é enviada no momento da criação do pedido, todos os endpoints que geram pedidos (post orders, orders/oneclick, shipments e shipments/oneclick) possuem esses dois campos para que a plataforma envie o link que o webhook vai atualizar. Sendo assim só é possível usar o Webhook a partir do momento que gere uma etiqueta aqui na Frenet via API."*

A URL não se cadastra em lugar nenhum: é um campo do pedido (`TrackingNotificationUrl`), informado ao criar a etiqueta **pela API**. As etiquetas da FRENESI saem do painel, à mão — nenhum pedido carrega a URL, e a Frenet não tem para onde notificar.

**Consequência direta para vocês:** a previsão de que "a mista degenere naturalmente para sempre A" não se realiza. Sem push, o espelho puro entregaria ao cliente o estado de até uma hora atrás — justamente quando ele abre a página para ver se o pedido andou.

**Por isso a opção B foi implementada.** Pedido em trânsito é reconsultado ao vivo na transportadora quando o cliente abre a página. Do lado de vocês **nada muda**: mesma chamada, mesma resposta, mesmo contrato. Só o dado chega mais fresco.

Os limites, para vocês saberem o que esperar de latência:

| Situação | De onde vem | Tempo |
|---|---|---|
| Pedido em trânsito, última leitura > 30 min | Consulta ao vivo | ~300–800 ms |
| Pedido em trânsito, leitura recente | Espelho | < 100 ms |
| Entregue, sem código, ou busca em lista | Espelho | < 100 ms |

Falha na consulta ao vivo é silenciosa: o espelho responde de qualquer jeito. A página nunca quebra porque a transportadora está lenta.

---

## 3 · O contrato final

### Base

```
https://erp.frenesiperfumes.com.br
```

⚠️ **O DNS está sendo apontado agora** (CNAME para `erp-frenesi.netlify.app`), com suporte da Netlify. Programem contra esse endereço. Se precisarem começar antes de ele propagar, `https://erp-frenesi.netlify.app` responde igual — mas **não deixem no código final**, e avisem para eu incluir essa origem no CORS durante o teste.

### As duas chamadas

O documento é obrigatório nas duas; o número do pedido é filtro opcional.

```http
GET /api/publico/rastreio?documento={cpf|email}
      → os últimos 10 pedidos do cliente, do mais recente para o mais antigo

GET /api/publico/rastreio?documento={cpf|email}&pedido={numero}
      → um pedido

Headers:
  X-API-Key: <chave no fim deste documento>
```

`?pedido=` é normalizado no ERP. Aceita, indistintamente:

| Forma | Resolve para |
|---|---|
| `YP-1510190959842609` · `1510190959842609` · `yp 1510190959842609` | pedido da Yampi |
| `SH-1885` · `#1885` · `1885` | pedido da loja |

Mandem o que tiverem em mãos — não é preciso perguntar nada ao cliente nem saber de qual mundo ele veio.

**Sobre o CPF:** cliente **sem CPF cadastrado** não é liberado por qualquer sequência de onze dígitos. A conferência exige que o dado exista dos dois lados. São centenas de clientes sem CPF na base, e sem essa guarda os pedidos deles ficariam abertos a chute. Na prática: e-mail é a chave que sempre funciona; CPF funciona para quem informou.

### Resposta 200

Sempre `{ "pedidos": [ … ] }` — array nos dois modos, inclusive quando vem um item só. Uma forma só evita o `if` no site.

```json
{
  "pedidos": [
    {
      "pedido": {
        "referencia": "YP-1510190164421427",
        "numeroYampi": "1510190164421427",
        "numeroLoja": null,
        "compradoEm": "2026-08-09T23:37:00.000Z"
      },
      "entrega": {
        "status": "entregue",
        "rotulo": "Entregue em 12/08",
        "transportadora": "Correios",
        "servico": "FRENET_SEDEX_03220",
        "codigo": "AD778124948BR",
        "url": "https://rastreamento.correios.com.br/app/index.php?objeto=AD778124948BR",
        "rastreioUrl": "https://rastreio.frenet.com.br/COR/AD778124948BR",
        "destino": "Cataguases · MG",
        "entregueEm": "2026-08-12T14:12:00.000Z",
        "entregaLocal": false
      },
      "marcos": [
        { "quando": "2026-08-09T23:37:00.000Z", "titulo": "Pagamento confirmado", "onde": "Yampi" },
        { "quando": null, "titulo": "Código de rastreio emitido", "onde": "Correios" },
        { "quando": "2026-08-12T14:12:00.000Z", "titulo": "Entrega confirmada", "onde": "Yampi" }
      ],
      "eventos": [
        {
          "quando": "2026-08-12T14:12:00.000Z",
          "descricao": "Objeto entregue ao destinatário - Queremos te ouvir! Responda a uma pesquisa rápida e nos ajude a melhorar a sua experiência: https://survey3.medallia.com/?correios-nps-sms-sro&obj=AD778124948BR",
          "descricaoResumida": "Objeto entregue ao destinatário",
          "local": "CATAGUASES-MG",
          "entregue": true
        },
        {
          "quando": "2026-08-12T12:00:00.000Z",
          "descricao": "Objeto saiu para entrega ao destinatário - É preciso ter alguém no endereço para receber o carteiro",
          "descricaoResumida": "Objeto saiu para entrega ao destinatário",
          "local": "CATAGUASES-MG",
          "entregue": false
        },
        {
          "quando": "2026-08-10T17:43:00.000Z",
          "descricao": "Objeto postado",
          "descricaoResumida": "Objeto postado",
          "local": "Muriae-MG",
          "entregue": false
        }
      ],
      "atualizadoEm": "2026-08-13T20:45:00.000Z"
    }
  ]
}
```

### Campo a campo

| Campo | Tipo | Notas |
|---|---|---|
| `pedido.referencia` | string | Chave do ERP. É o que citar em qualquer conversa conosco |
| `pedido.numeroLoja` | string \| **null** | Hoje **sempre null** — ver §1. Não construam nada que dependa dele ainda |
| `entrega.status` | enum | **Programem sobre isto.** Os seis valores estão na tabela abaixo |
| `entrega.rotulo` | string | Texto pronto em português. **Pode mudar sem aviso** — não usar como chave de comparação |
| `entrega.transportadora` | string \| null | `null` quando não sabemos. Nunca devolvemos o código do serviço como se fosse nome de empresa |
| `entrega.url` | string \| null | Site da transportadora. `null` quando a empresa é desconhecida — link genérico errado é pior que link nenhum |
| `entrega.rastreioUrl` | string \| null | Página que a própria transportadora devolveu para o objeto |
| `entrega.entregaLocal` | boolean | Motoboy. Nunca terá código nem eventos |
| `marcos[]` | array | Fatos que o ERP conhece pela Yampi. **Sempre preenchido** |
| `eventos[]` | array | Escaneamentos da transportadora, do mais recente para o mais antigo. **Pode vir vazio com o pedido normal** |
| `eventos[].descricao` | string | Texto cru. **Pode conter URLs de terceiros** — confirmando o que vocês pediram para registrar |
| `eventos[].descricaoResumida` | string | Sem URLs nem apêndices. **Nunca vem vazia**: se a limpeza comer tudo, devolve a crua |
| `atualizadoEm` | ISO 8601 | Momento da resposta |

Todas as datas são **ISO 8601 em UTC**. `quando` pode ser `null` quando a transportadora não datou a ocorrência — esses eventos vão para o fim da lista.

### Os seis status

| `status` | Texto sugerido |
|---|---|
| `pagamento-pendente` | Aguardando confirmação do pagamento |
| `aguardando-postagem` | Pedido em separação — em breve você recebe o código |
| `em-transito` | A caminho |
| `entregue` | Entregue em {data} |
| `entrega-nao-efetuada` | Houve um problema na entrega — fale com a gente |
| `sem-movimentacao` | Entrega atrasada — já estamos verificando |

Conforme a Decisão 5, `entregue` fecha com **"Entregue em {data}"** também na entrega local — o encerramento visual é o mesmo.

### Erros

| Código | Quando | Corpo |
|---|---|---|
| `401` | Chave ausente ou inválida | `{"erro":"nao_autorizado"}` |
| `404` | Pedido inexistente **ou** documento que não confere | `{"erro":"nao_encontrado"}` |
| `429` | Acima de 60 consultas/min por IP | `{"erro":"muitas_consultas"}` |
| `503` | Banco indisponível | `{"erro":"indisponivel"}` |

O 404 é deliberadamente ambíguo. Sugerimos que a mensagem ao cliente também seja: *"Não encontramos pedido com esses dados. Confira o e-mail ou CPF usado na compra."*

### Cache e CORS

- `Cache-Control: private, max-age=300`, como acordado.
- CORS liberado só para as origens configuradas — a lista que pedimos no topo deste documento.

---

## 4 · A ordem de precedência que vocês propuseram está certa

`eventos` → senão `rastreioUrl` → senão `url` → senão "ainda não escaneado".

Ela está registrada como parte do contrato, não como sugestão — é exatamente o que o ERP faz na tela interna. **Não tratem `eventos: []` como erro nem como "sem informação":** é o caso normal da Jadlog, e ali `rastreioUrl` é a única coisa que existe.

### Os quatro degraus, com números reais

Dos 57 pedidos em trânsito hoje:

| Situação | Pedidos | O que a página deve mostrar |
|---|---:|---|
| Timeline completa — Correios e J&T | 29 · 51% | `eventos[]` |
| Só link — Jadlog | 10 · 18% | `rastreioUrl`. A transportadora reconhece o objeto e **não** devolve histórico, nem depois de entregue |
| Aguardando integração — códigos `TXAQ…tx` | 18 · 31% | `marcos[]` e o texto de "ainda não escaneado". Depende de uma autorização nossa no Melhor Envio |
| Entrega local — motoboy | 22 no total da base | `entregaLocal: true` + `marcos[]` |

Vale testarem os quatro. São estados diferentes de desenho, não variações do mesmo.

---

## 5 · Chave de acesso

```
X-API-Key: frn_zEzv9VVIQ-Q5YCoqdqeiIlU80rkOHM5O
```

Ela é **semi-pública por natureza** — vai viver no JavaScript da loja, visível a qualquer visitante que abra o inspetor. Não é ela que protege o dado, e vocês já reconheceram isso no r2. Ela identifica o site e serve para cortarmos o acesso trocando o valor, se algum dia precisar. Podem tratá-la como configuração, não como segredo.

---

## 6 · O que falta, e de quem

| Item | De quem | Situação |
|---|---|---|
| Publicar o endpoint | ERP | Código pronto e testado; sobe no próximo deploy |
| DNS de `erp.frenesiperfumes.com.br` | FRENESI | Em andamento com o suporte da Netlify — CNAME para `erp-frenesi.netlify.app` |
| **Lista de domínios para o CORS** | **Site** | ⬅ **Único item bloqueado em vocês.** Ver o pedido no topo |
| Backfill do `shopify_numero` | ERP | Diagnóstico da leitura da Shopify em andamento |
| Autorização OAuth do Melhor Envio | FRENESI | Destrava os 18 pedidos `TXAQ…tx`. Depende do DNS acima |

**Aviso honesto:** o endpoint **ainda não está no ar**. Aviso assim que subir, com o endereço final, e proponho validarmos juntos com um pedido real de cada um dos quatro degraus da tabela acima.

---

*Documento técnico completo (§1 a §9, incluindo a apuração da API da Frenet e o retrato da base) segue em anexo, v6.*
