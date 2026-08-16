# Ligar o Gerente no WhatsApp

O código está pronto e testado. O que falta é fora do repositório: uma conta na
Meta, três variáveis na Netlify e o seu número na lista de autorizados.

Tudo é gratuito para o volume desta operação — as conversas iniciadas pelo
usuário ("service conversations") não são cobradas, e é só isso que o Gerente
faz: ele responde, nunca puxa conversa.

Tempo real: **40 a 60 minutos**, a maior parte esperando a Meta processar.

---

## O que você vai precisar em mãos

- Um **número de celular que NÃO esteja em uso no WhatsApp** — nem no comum,
  nem no Business. Este é o ponto que mais trava gente no meio do caminho: se
  você usar o número da loja, ele **sai** do aplicativo e passa a existir só via
  API. Um chip pré-pago novo resolve, ou um número virtual.
- Acesso ao painel da Netlify (para as variáveis).
- CNPJ da FRENESI (para verificar o negócio, se a Meta pedir).

---

## Passo 1 — Criar o app na Meta

1. Vá em **developers.facebook.com** e entre com a conta do Facebook que
   administra a página da FRENESI.
2. **Meus Apps** → **Criar app**.
3. Em "Qual caso de uso?", escolha **Outro** → **Empresa**.
4. Nome do app: `FRENESI OS`. E-mail de contato: o seu.
5. Criado o app, na lista de produtos procure **WhatsApp** e clique em
   **Configurar**.
6. Ele vai pedir uma **conta empresarial (Business Portfolio)**. Se a FRENESI já
   tiver uma, selecione. Se não, crie na hora — nome, CNPJ, e-mail.

## Passo 2 — Pegar o número e o Phone ID

Na tela **WhatsApp → Configuração da API**:

1. A Meta oferece um **número de teste** já pronto. Ele serve para você ver a
   coisa funcionando hoje, mas só envia para até 5 números cadastrados à mão e
   expira. Use-o para testar, e depois troque.
2. Para o número definitivo: **Adicionar número de telefone** → informe o número
   novo → escolha verificação por SMS ou ligação → digite o código.
3. Anote os dois valores que aparecem no alto da tela:
   - **Identificação do número de telefone** → é o `WHATSAPP_PHONE_ID`
     (um número comprido, tipo `123456789012345`).
   - **Identificação da conta do WhatsApp Business** → guarde, pode ser pedida.

## Passo 3 — Gerar o token permanente

O token que aparece na tela de configuração é **temporário: vale 24 horas**. Se
você usar esse, a integração para de funcionar amanhã e ninguém vai lembrar por
quê. Faça o permanente:

1. Vá em **business.facebook.com/settings** (Configurações do Business).
2. **Usuários** → **Usuários do sistema** → **Adicionar**.
   - Nome: `frenesi-os`
   - Função: **Administrador**
3. Com o usuário criado, clique em **Adicionar ativos** → aba **Aplicativos** →
   selecione `FRENESI OS` → marque **Controle total**.
4. Clique em **Gerar novo token**:
   - App: `FRENESI OS`
   - Validade: **Nunca expira**
   - Permissões: marque **`whatsapp_business_messaging`** e
     **`whatsapp_business_management`**
5. **Copie o token agora.** A Meta mostra uma única vez. Ele é o
   `WHATSAPP_TOKEN`.

> Este token dá acesso a mandar mensagem em nome da FRENESI. Ele não pode ser
> commitado — este repositório é público — nem passar por conversa de chat. Vai
> direto do painel da Meta para o painel da Netlify.

## Passo 4 — Inventar o token de verificação

O `WHATSAPP_VERIFY_TOKEN` é uma senha que **você inventa**. Ela serve para uma
coisa só: quando a Meta chamar o nosso endereço perguntando "é você mesmo?", o
ERP confere se o token bate. Sem isso, qualquer um poderia registrar um webhook
no nosso endereço.

Gere algo aleatório e longo (num terminal: `openssl rand -hex 24`) e guarde.

## Passo 5 — Pôr as três variáveis na Netlify

Painel da Netlify → projeto **erp-frenesi** → **Site configuration** →
**Environment variables** → **Add a variable**:

| Variável | Valor |
|---|---|
| `WHATSAPP_TOKEN` | o token permanente do Passo 3 |
| `WHATSAPP_PHONE_ID` | a identificação do número, do Passo 2 |
| `WHATSAPP_VERIFY_TOKEN` | a senha que você inventou no Passo 4 |

Depois: **Deploys** → **Trigger deploy** → **Deploy site**. As variáveis só
entram em vigor num build novo.

## Passo 6 — Apontar o webhook

De volta ao painel da Meta, **WhatsApp → Configuração** → seção **Webhook** →
**Editar**:

- **URL de retorno de chamada**:
  `https://erp.frenesiperfumes.com.br/api/whatsapp/webhook`
- **Token de verificação**: exatamente o `WHATSAPP_VERIFY_TOKEN` do Passo 4.

Clique em **Verificar e salvar**. A Meta chama o endereço na hora; se o token
bater, ela mostra o webhook como verificado. **Se der erro aqui**, quase sempre
é uma destas três: o deploy do Passo 5 ainda não terminou, o token tem um espaço
sobrando, ou a URL foi digitada com `/webhook/` no final.

Verificado, clique em **Gerenciar** e marque o campo **`messages`**. Só esse —
os outros produzem notificação de status que o ERP ignora de propósito.

## Passo 7 — Autorizar o seu número

Nenhum número fala com o Gerente sem estar nesta lista. Número desconhecido
recebe uma recusa curta e não descobre nem que existe um ERP do outro lado.

No **SQL Editor** do Supabase:

```sql
insert into public.gerente_whatsapp_autorizados
  (telefone, usuario_id, nome, perfil, permissoes, ativo)
values
  -- Só dígitos: código do país + DDD + número. Sem +, sem espaço, sem traço.
  ('5511999999999',
   '51cd22fa-7dbf-4cc4-bcc7-990061ef1946',  -- o seu id em public.usuarios
   'Rafael Araújo',
   'dono',
   array['gerente.ler','gerente.escrever'],
   true);
```

Trocando `5511999999999` pelo seu número real.

As permissões vêm **da lista, não do canal** — é o que permite dar só leitura no
celular a quem tem escrita no ERP. Para um número que só consulta, use
`array['gerente.ler']`.

## Passo 8 — Testar

Mande uma mensagem do seu celular para o número do WhatsApp Business:

> qual o saldo do caixa hoje?

A resposta deve chegar em alguns segundos, com os números do ERP.

Depois teste a recusa: mande do número de outra pessoa. Ela deve receber
"Não reconheço este número" e nada mais.

---

## O que já está pronto do lado do código

Vale saber, porque muda o que você pode esperar:

- **É o mesmo motor do ERP.** A rota do WhatsApp é um adaptador: traduz o
  formato da Meta, resolve identidade e chama `executarInteracao` — o mesmo
  Policy Engine, os mesmos limites, a mesma auditoria. Não existe um segundo
  cérebro com regras próprias.
- **Reentrega não custa nada.** A Meta reenvia mensagens quando desconfia que
  não chegaram. Cada mensagem é registrada pelo id antes de qualquer consulta;
  a repetida recebe a resposta guardada, sem consultar o banco de novo.
- **Aprovação por texto.** Ações que exigem confirmação podem ser aprovadas
  respondendo `aprovar <id>` ou canceladas com `cancelar <id>`. O reconhecimento
  é por expressão exata — "acho que pode aprovar aquilo" não aprova nada, e é
  para ser assim: aprovação por interpretação de linguagem natural é aprovação
  que ninguém consegue auditar depois.
- **Resposta longa é cortada em 3.900 caracteres**, com aviso. O WhatsApp corta
  em 4.096 — melhor cortar com aviso do que o provedor cortar no meio de um
  número.

## Quando alguma coisa não funcionar

| Sintoma | Onde olhar |
|---|---|
| A Meta não verifica o webhook | O deploy do Passo 5 terminou? O `WHATSAPP_VERIFY_TOKEN` é idêntico dos dois lados? |
| Mensagem sai mas não volta resposta | Netlify → **Logs → Functions**. Procure `[whatsapp]`. |
| "Não reconheço este número" para o seu número | O telefone na tabela tem só dígitos, com código do país (55) na frente? |
| Parou de funcionar de repente | Quase sempre o token: se foi gerado o temporário, ele morreu em 24h. Refaça o Passo 3. |
| Responde mas não executa escrita | Meu Assessor → Configurações. A escrita e a autonomia valem para todos os canais. |
