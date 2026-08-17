# A porta do ERP

Três camadas, e cada uma resolve um problema diferente. Vale entender a
diferença antes de mexer em qualquer uma: quem confunde as três acaba
desligando a que estava segurando o ataque.

## 1. Contagem de tentativas — contra insistência

**Já está ligada. Não depende de nada.**

Toda tentativa de login que falha por credencial fica registrada em
`login_tentativas` (e-mail, origem e horário — nunca a senha, nem hash dela).
A escada é:

| Falhas em 15 min | Espera |
|---|---|
| até 4 | nenhuma |
| 5 | 1 minuto |
| 8 | 5 minutos |
| 12 | 30 minutos |

A espera conta a partir da **última** falha, então insistir custa mais do que
parar. As quatro primeiras passam sem atrito de propósito: errar a senha quatro
vezes é humano, e travar quem só digitou errado transforma segurança em
suporte.

Um IP com muitas falhas espalhadas por vários e-mails é outra coisa — não é
alguém que esqueceu a senha, é alguém varrendo a lista. O teto por origem é
mais alto (20 falhas → 5 min; 40 → 30 min) porque escritório com saída única
compartilha endereço, mas existe.

O pedido de "esqueci a senha" conta no mesmo placar. Sem isso, a recuperação
viraria uma torneira de e-mail contra a caixa de quem trabalha aqui.

**Quando o banco não responde, a porta deixa passar.** É a escolha certa: um
erro de infraestrutura não pode trancar o dono do ERP para fora do próprio
sistema, e a senha continua sendo exigida de qualquer forma.

## 2. Turnstile — contra robô

**Depende de duas chaves da Cloudflare. Enquanto não existirem, fica
desligado** — e o login funciona normalmente, com as outras duas camadas.

Um cadeado que tranca antes de existir chave é um cadeado que deixa o dono do
lado de fora.

### Como ligar

1. Entre no painel da Cloudflare com a conta que já administra o domínio.
2. Menu lateral → **Turnstile** → **Add widget**.
3. Preencha:
   - **Widget name**: `FRENESI OS`
   - **Hostnames**: `erp.frenesiperfumes.com.br` **e**
     `devolucoes.frenesiperfumes.com.br` — o mesmo widget serve os dois, e o
     domínio que ficar de fora recebe erro `110200` no navegador em vez de
     desafio.
   - **Widget Mode**: `Managed`
4. Salve. A tela mostra duas chaves:
   - **Site Key** — pública, vai para o navegador.
   - **Secret Key** — só do servidor. Não entra em commit nenhum, e este
     repositório é público.
5. No painel da Netlify → **Site configuration** → **Environment variables** →
   adicione as duas:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | a Site Key |
   | `TURNSTILE_SECRET_KEY` | a Secret Key |

6. **Trigger deploy** → *Clear cache and deploy site*. O `NEXT_PUBLIC_` só entra
   no navegador em tempo de build, então mudar a variável sem novo build não
   surte efeito.

Pronto. O widget aparece no login, no "esqueci a senha" e na busca do portal de
devoluções — **visível**, em `appearance: always`. Ele resolve o desafio
sozinho na maior parte das vezes (ninguém precisa clicar em nada); o que muda é
que a caixa fica na tela dizendo "Verificando…" e depois "Sucesso!".

A primeira versão usava `interaction-only`, que a Cloudflare só pinta quando o
desafio exige clique. Ficava bonito e era pior: não dava para olhar a tela de
login e saber se a proteção estava no ar, e quando o script da Cloudflare não
carregava (bloqueador, rede corporativa, DNS filtrado) o sintoma só aparecia no
envio, como "a verificação de segurança não foi concluída" — sem nada na tela
que explicasse o porquê. Agora o próprio widget mostra o erro, com o código da
Cloudflare, no lugar onde o erro aconteceu.

### Se a Cloudflare cair

O login continua. A verificação falha para o lado de deixar passar, registra no
log do servidor, e as camadas 1 e 3 seguem valendo. Derrubar o ERP inteiro
porque um serviço de terceiro não respondeu seria trocar um risco por uma
certeza.

## 3. Esqueci a senha — contra ficar trancado do lado de fora

**Já está ligada.** Depende do envio de e-mail, que já funciona (`RESEND_API_KEY`
+ `EMAIL_REMETENTE`, os mesmos dos e-mails da operação).

O caminho:

1. Na tela de entrada, **Esqueci a senha**. O e-mail digitado não se perde na
   troca — o cartão muda de rosto, o campo fica onde estava.
2. O ERP pede ao Supabase um **token de uso único** e monta um link para o
   **próprio domínio** (`erp.frenesiperfumes.com.br/api/auth/confirmar`).
   O link pronto do Supabase passaria pelo domínio deles antes de voltar — e um
   link de senha apontando para um endereço estranho é a primeira coisa que
   ensina alguém a clicar em phishing.
3. O e-mail sai pelo Resend, no domínio verificado da marca.
4. Clicando, o token vira sessão e some da barra de endereços. A tela seguinte
   oferece **só** o formulário de senha nova.
5. Ao salvar: a senha nova vale, o placar de tentativas daquele e-mail zera, e
   **todas as outras sessões da conta são encerradas**. Se a troca foi motivada
   por suspeita de invasão, deixar a sessão do invasor viva tornaria a troca
   inútil.

A resposta na tela é **a mesma** exista ou não a conta. Uma tela que responde
"não encontrei esse e-mail" entrega de graça, sem login e sem limite, a lista de
quem trabalha na empresa — e é assim que se monta a lista de alvos antes de
tentar senha.

O link vale **1 hora** e só funciona **uma vez**. Quem já está logado troca a
senha em **Perfil**, onde a senha atual é exigida.

## Autocompletar do domínio

O campo de e-mail completa `@frenesiperfumes.com.br`: digitar `rafael` e sair do
campo (ou apertar Tab, ou clicar na sugestão) vira
`rafael@frenesiperfumes.com.br`. Vale também para o domínio digitado pela
metade — `rafael@frene` completa.

A regra é conservadora: **domínio diferente e completo nunca é tocado**.
`rafael@gmail.com` continua `rafael@gmail.com`. Corrigir o que o usuário
escreveu inteiro seria adivinhar, e adivinhar num campo de login produz erro de
senha que ninguém entende.

A mesma função roda no servidor. Quem tem o preenchimento automático do
navegador desligado, ou envia pelo teclado sem sair do campo, mereceria falhar
por uma conveniência que não rodou.
