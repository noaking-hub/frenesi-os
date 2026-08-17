# O que depende de você

Lista curta do que **só o dono da operação pode resolver** — acesso a painel
de terceiro, decisão de negócio ou dado que o ERP não tem como descobrir.
Tudo o que dava para resolver no código já está feito e no ar.

Atualizado em 17/08/2026.

---

## 1. `WHATSAPP_APP_SECRET` na Netlify — o WhatsApp está mudo até isso

**Onde pegar:** developers.facebook.com → Meus Apps → o app do WhatsApp →
Configurações do app → Básico → campo **"Chave secreta do app"** → botão
Mostrar (pede a senha do Facebook). São 32 caracteres.

**Onde pôr:** Netlify → Site settings → Environment variables →
`WHATSAPP_APP_SECRET`, com o mesmo escopo das outras duas variáveis do
WhatsApp (Builds, Functions, Runtime). Depois, refazer o deploy.

**Por quê:** a Meta assina cada chamada do webhook com `X-Hub-Signature-256`,
que é um HMAC-SHA256 do corpo usando esse segredo. O ERP recalcula e recusa o
que não confere. Antes, o POST não conferia nada e a identidade saía de um
campo que quem envia escolhe — acertando um número autorizado, qualquer um
confirmava ação financeira pendente. Sem a variável a rota recusa tudo, que é
a postura certa: segredo ausente não vira porta aberta.

---

## 2. Percentual de ADS na precificação

Hoje: `ads_mensal = R$ 7.000` e `ads_pct = 0`. O custo de anúncio **não entra
no preço** — a margem que a tela mostra é otimista nesse ponto.

O número depende do faturamento, que é decisão sua, não do código. Para
referência: receita paga dos últimos 30 dias = **R$ 38.750,16**, o que põe os
R$ 7.000 em **18,1%**. A tela de Parâmetros de Precificação tem o botão
"Usar X% como ADS", que faz essa conta sozinho — conferi que ele está ligado
de verdade.

---

## 3. Yampi → ERP: a virada das comunicações, evento por evento

O ERP está pronto para assumir (log, descadastro, rotina própria, modelos com
a cara da marca). A virada é manual e tem uma ordem que não pode inverter:

1. **Desligar o evento na Yampi PRIMEIRO.**
2. Só então ligar no ERP (`AVISOS_DE_PEDIDO=1` na Netlify).

Invertendo, o cliente recebe dois e-mails do mesmo fato — e desconfia mais do
segundo que do primeiro.

Sugestão de ordem: comece por **"pedido enviado"**, que é o que mais importa
para o cliente e o que o ERP faz melhor (código de rastreio e link da
transportadora certa). Acompanhe uma semana em Configurações → Notificações
e só então passe o próximo.

---

## 4. Conferir no celular

O esqueleto do ERP foi ajustado para iPhone e iPad e conferido em navegador
real: a barra lateral virou gaveta, o topo parou de se sobrepor, nenhuma tela
rola na horizontal.

O que **ainda não** foi redesenhado para o dedo: as telas de tabela larga
(Pedidos com a ficha ancorada, Extrato, Conciliação). Elas rolam dentro do
próprio cartão e dá para usar, mas não são confortáveis. Abra no seu iPhone e
diga quais doem mais — a ordem de ataque é sua.

---

## 5. Turnstile no portal de devoluções (opcional)

O portal já conta consultas por identidade e por origem, e já tem o widget do
Turnstile no lugar. Ele fica **invisível** enquanto não houver chave.

Para ligar: crie um site em dash.cloudflare.com → Turnstile e ponha
`TURNSTILE_SECRET_KEY` e `NEXT_PUBLIC_TURNSTILE_SITE_KEY` na Netlify. Sem
isso, o freio por contagem continua valendo — só falta a camada contra robô.
