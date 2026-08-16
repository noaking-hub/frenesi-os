'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Turnstile } from '@/components/Turnstile'
import { completarEmail, sugestaoDeEmail } from '@/domain'

import { entrar, pedirRedefinicao } from './actions'
import { EstilosDaPorta, MarcaDaPorta } from './estilos'

/**
 * A porta do ERP.
 *
 * Quem chega aqui trabalha na casa — não há o que vender, então a tela não
 * tenta convencer. O que ela faz é parecer o sistema que abre em seguida:
 * mesmo preto, mesmo ouro, mesma tipografia. Uma porta que destoa do prédio
 * é a primeira coisa que faz alguém desconfiar de onde está digitando senha.
 *
 * A mesma tela serve os dois momentos — entrar e pedir uma senha nova. São
 * duas telas separadas em muitos sistemas, e a separação custa: quem clica em
 * "esqueci" perde o e-mail que já tinha digitado e precisa escrevê-lo de novo,
 * justamente quando está com pressa. Aqui o cartão troca de rosto e o e-mail
 * fica onde estava.
 */

function Botao({ children, carregando }: { children: string; carregando: string }) {
  // `useFormStatus` sabe do envio sem estado próprio — e o botão travado
  // durante o envio é o que evita duas sessões abertas por clique duplo.
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="fr-botao">
      {pending ? carregando : children}
    </button>
  )
}

/**
 * O campo de e-mail, com o domínio da casa oferecido.
 *
 * Oferecido, não imposto: a sugestão é um botão que a pessoa clica (ou aceita
 * com Tab), e sair do campo completa sozinho. Quem precisa entrar com um
 * endereço de outro domínio continua conseguindo — o valor só é completado
 * quando o que foi digitado NÃO tem domínio ou tem um pedaço do nosso.
 */
function CampoDeEmail({
  valor,
  aoMudar,
  rotulo = 'E-mail',
}: {
  valor: string
  aoMudar: (v: string) => void
  rotulo?: string
}) {
  const sugestao = sugestaoDeEmail(valor)

  return (
    <div className="fr-campo-caixa">
      <label className="fr-campo-caixa">
        <span className="fr-rotulo font-sans">{rotulo}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          spellCheck={false}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={() => aoMudar(completarEmail(valor))}
          onKeyDown={(e) => {
            // Tab aceita a sugestão sem tirar a mão do teclado — o mesmo gesto
            // do autocompletar do terminal e do navegador.
            if (e.key === 'Tab' && sugestao) {
              e.preventDefault()
              aoMudar(sugestao)
            }
          }}
          placeholder="voce@frenesiperfumes.com.br"
          className="fr-campo font-sans"
        />
      </label>

      {sugestao && (
        <button
          type="button"
          className="fr-sugestao font-sans"
          onClick={() => aoMudar(sugestao)}
          tabIndex={-1}
        >
          {sugestao}
          <span>Tab</span>
        </button>
      )}
    </div>
  )
}

export function FormularioEntrada({ de, recado }: { de: string; recado?: string }) {
  const [estado, acao] = useActionState(entrar, null)
  const [recuperacao, acaoRecuperar] = useActionState(pedirRedefinicao, null)
  const [vendo, setVendo] = useState(false)
  const [email, setEmail] = useState('')
  const [esqueci, setEsqueci] = useState(false)

  return (
    <main className="fr-palco">
      <EstilosDaPorta />
      <MarcaDaPorta />

      {esqueci ? (
        <form action={acaoRecuperar} className="fr-cartao" key="recuperar">
          <div className="fr-fio" aria-hidden />
          <span className="fr-titulo font-sans">Recuperar acesso</span>

          <CampoDeEmail valor={email} aoMudar={setEmail} rotulo="E-mail da conta" />

          <Turnstile acao="recuperar-senha" />

          {recuperacao?.erro && (
            <span className="fr-erro font-sans" role="alert">
              <span aria-hidden style={{ color: '#C25A50' }}>◆</span>
              {recuperacao.erro}
            </span>
          )}
          {recuperacao?.ok && (
            <span className="fr-ok font-sans" role="status">
              <span aria-hidden style={{ color: '#7AA47A' }}>◆</span>
              {recuperacao.ok}
            </span>
          )}

          <Botao carregando="Enviando…">Enviar o link</Botao>

          <button type="button" className="fr-link font-sans" onClick={() => setEsqueci(false)}>
            Voltar para a entrada
          </button>
        </form>
      ) : (
        <form action={acao} className="fr-cartao" key="entrar">
          <div className="fr-fio" aria-hidden />
          <span className="fr-titulo font-sans">Acesso ao sistema</span>

          <input type="hidden" name="de" value={de} />

          <CampoDeEmail valor={email} aoMudar={setEmail} />

          <label className="fr-campo-caixa">
            <span className="fr-rotulo font-sans">Senha</span>
            <span className="fr-senha">
              <input
                name="senha"
                type={vendo ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••••"
                className="fr-campo font-sans"
              />
              {/* Ver a senha resolve o erro mais comum de digitação — e é mais
                  honesto que a pessoa conferir do que errar três vezes. */}
              <button
                type="button"
                className="fr-ver font-sans"
                onClick={() => setVendo((v) => !v)}
                aria-label={vendo ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {vendo ? 'Ocultar' : 'Ver'}
              </button>
            </span>
          </label>

          <Turnstile acao="entrar" />

          {recado && !estado?.erro && (
            <span className="fr-erro font-sans" role="alert">
              <span aria-hidden style={{ color: '#C25A50' }}>◆</span>
              {RECADOS[recado] ?? RECADOS['link-vencido']}
            </span>
          )}
          {estado?.erro && (
            <span className="fr-erro font-sans" role="alert">
              <span aria-hidden style={{ color: '#C25A50' }}>◆</span>
              {estado.erro}
            </span>
          )}

          <Botao carregando="Entrando…">Entrar</Botao>

          <button type="button" className="fr-link font-sans" onClick={() => setEsqueci(true)}>
            Esqueci a senha
          </button>
        </form>
      )}

      <span className="fr-rodape font-sans">FRENESI OS · acesso restrito</span>
    </main>
  )
}

/**
 * O que dizer quando a pessoa volta de um link que não deu certo.
 *
 * Link vencido e link já usado são a mesma frase de propósito: a saída é a
 * mesma nos dois casos — pedir outro — e explicar a diferença só serviria
 * para quem estivesse testando links alheios.
 */
const RECADOS: Record<string, string> = {
  'link-vencido': 'Esse link já foi usado ou passou da validade. Peça um novo em "Esqueci a senha".',
  'link-incompleto': 'O link chegou incompleto. Copie o endereço inteiro do e-mail, ou peça outro.',
  'link-invalido': 'Esse link não serve para redefinir senha. Peça um novo em "Esqueci a senha".',
}
