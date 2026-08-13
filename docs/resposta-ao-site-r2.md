# FRENESI · ERP → Site — Resposta aos documentos r2 e r3

**De:** desenvolvimento do ERP · **Para:** desenvolvimento do site/tema (Shopify)
**Ref.:** "Respostas às decisões de §9" r2 · 12/08/2026 · e r3 · 13/08/2026
**Este doc:** r3-resposta · 13/08/2026 · acompanha o técnico completo, v6

---

## Resumo em cinco linhas

1. **As cinco decisões foram aceitas e já estão implementadas.** O endpoint existe, testado, aguardando publicação.
2. **A divergência de 16 × 10 dígitos do adendo não existe** — o número de 10 era um exemplo fictício do nosso documento. Nenhuma das hipóteses (a), (b), (c) precisa ser testada. Detalhe abaixo.
3. **O webhook da Frenet caiu.** Não por falta de cadastro: ele é estruturalmente indisponível para esta operação. Isso derruba a premissa de "sempre A" e por isso a **opção B foi implementada**.
4. **`descricaoResumida` implementada**, como pedido.
5. **Chave de acesso está no fim deste documento.** As origens do r3 já estão configuradas — **nada mais bloqueia vocês**. Do nosso lado falta publicar o endpoint; o DNS de `erp.frenesiperfumes.com.br` está em andamento com o suporte da Netlify.

---

## ✅ Origens recebidas — nada mais bloqueia vocês

As três do r3 estão configuradas:

```
https://www.frenesiperfumes.com.br
https://frenesiperfumes.com.br
https://hjfbkb-c3.myshopify.com
```

Obrigado pela observação sobre o preview: vocês estão certos, `?preview_theme_id=…` roda no domínio principal e não precisa de origem extra. E certos também sobre a URL provisória — as origens dizem respeito a quem **chama**, não a quem responde, então trocar `api_base` no customizador não mexe no CORS.

**A validação dos quatro degraus está aceita.** Mando o endereço final e um documento de exemplo de cada degrau assim que o endpoint subir.

---

## ⚠️ Correção a uma afirmação nossa: o CPF funciona para todo mundo

No documento anterior escrevemos que "e-mail é a chave que sempre funciona; CPF funciona para quem informou", sugerindo que faltasse CPF em boa parte da base. **Está errado.** Conferência feita agora, nos 661 clientes:

- **100% têm CPF**, e todos gravados como 11 dígitos limpos — casa exatamente com a normalização que vocês descreveram no r3;
- **100% têm e-mail**, todos em minúsculas.

As duas chaves são igualmente confiáveis. A guarda contra cadastro sem CPF continua no código — ela protege contra o dia em que um cadastro chegar incompleto — mas hoje não exclui ninguém.

### Um comportamento do CPF que vale vocês conhecerem

**A busca por CPF pode devolver pedidos de mais de um cadastro.** Há 6 CPFs na base com mais de um registro de cliente, quase sempre a mesma pessoa que comprou com e-mails diferentes.

Isso é **intencional**, não defeito: separar por cadastro faria a consulta esconder metade do histórico de quem informou o CPF certo. Consequência prática para a tela: no modo lista, os cards podem vir de compras feitas com e-mails distintos. Como a resposta não traz nome do cliente, não há exposição de identidade — só os pedidos daquele CPF.

A busca por **e-mail** continua restrita a um cadastro só.

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

⚠️ **O DNS está sendo apontado agora** (CNAME para `erp-frenesi.netlify.app`), com suporte da Netlify. Se a validação começar antes de ele propagar, `https://erp-frenesi.netlify.app` responde igual — e, como vocês notaram no r3, trocar `api_base` no customizador **não exige mexer no CORS**, porque as origens dizem respeito a quem chama. Só não deixem a provisória como configuração final.

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

**Sobre o CPF:** as duas chaves são igualmente confiáveis — 100% da base tem e-mail e CPF (ver a correção no topo). A conferência exige que o dado exista dos dois lados, então um cadastro que chegasse sem CPF não seria liberado por qualquer sequência de onze dígitos.

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
| Lista de domínios para o CORS | Site | ✅ Entregue no r3 e configurada |
| Atribuir o template `page.rastreio` à página | FRENESI (operação) | 1 clique no admin, após subir o tema v12 |
| Backfill do `shopify_numero` | ERP | Diagnóstico da leitura da Shopify em andamento |
| Autorização OAuth do Melhor Envio | FRENESI | Destrava os 18 pedidos `TXAQ…tx`. Depende do DNS acima |

**Aviso honesto:** o endpoint **ainda não está no ar**. Aviso assim que subir, com o endereço final, e proponho validarmos juntos com um pedido real de cada um dos quatro degraus da tabela acima.

---

*Documento técnico completo (§1 a §9, incluindo a apuração da API da Frenet e o retrato da base) segue em anexo, v6.*
