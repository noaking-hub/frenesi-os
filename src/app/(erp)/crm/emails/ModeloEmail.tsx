'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { HTML_BASE_RECUPERACAO, emailGiftback, emailRecuperacao, type ModeloEmailRecuperacao } from '@/domain'

import { salvarModelo } from './actions'

const campo: React.CSSProperties = {
  padding: '9px 12px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1.5,
  borderRadius: 8,
  outline: 'none',
  width: '100%',
}

/**
 * O editor do e-mail de recuperação, com a prévia EXATA ao lado.
 *
 * A prévia renderiza o mesmo HTML que o cliente recebe — mesma função do
 * domínio, dados de exemplo — dentro de um iframe. Editar um campo atualiza
 * a prévia na hora: ninguém precisa mandar e-mail de teste para si mesmo só
 * para ver como ficou.
 */
export function ModeloEmail({
  tipo = 'carrinho',
  inicial,
  cupom,
  aoFechar,
}: {
  /** Qual e-mail está sendo editado — muda a prévia e os campos vivos. */
  tipo?: 'carrinho' | 'giftback'
  inicial: ModeloEmailRecuperacao
  /** O cupom preenchido na tela, para a prévia mostrar o e-mail completo. */
  cupom: { codigo: string; pct: number } | null
  aoFechar: () => void
}) {
  const [assunto, setAssunto] = useState(inicial.assunto)
  const [titulo, setTitulo] = useState(inicial.titulo)
  const [mensagem, setMensagem] = useState(inicial.mensagem)
  const [textoBotao, setTextoBotao] = useState(inicial.textoBotao)
  // Modo HTML do zero: o documento inteiro é da operação. Entrar no modo com
  // o campo vazio preenche com a base pronta — melhor editar em cima de algo
  // que funciona no Gmail do que descobrir depois o que quebrou.
  const [modoHtml, setModoHtml] = useState(Boolean(inicial.html?.trim()))
  const [htmlProprio, setHtmlProprio] = useState(inicial.html ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciarTransicao] = useTransition()
  const router = useRouter()

  const abrirModoHtml = () => {
    if (!htmlProprio.trim()) setHtmlProprio(HTML_BASE_RECUPERACAO)
    setModoHtml(true)
  }

  const previa = useMemo(() => {
    const modelo = { assunto, titulo, mensagem, textoBotao, html: modoHtml ? htmlProprio : null }
    if (tipo === 'giftback') {
      return emailGiftback(
        {
          nome: 'Marina Fontes',
          cupom: cupom ?? { codigo: 'NIVER15-A7K2MB', pct: 15 },
          validadeDias: 7,
          lojaUrl: '#',
        },
        modelo,
      )
    }
    return emailRecuperacao(
      {
        nome: 'Marina Fontes',
        itens: ['1× Baccarat Rouge 540 (Decant) · 5 ml', '1× Sauvage Elixir (Decant) · 10 ml'],
        valor: 189.8,
        linkCheckout: '#',
        cupom,
      },
      modelo,
    )
  }, [tipo, assunto, titulo, mensagem, textoBotao, cupom, modoHtml, htmlProprio])

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setSalvo(false)
      const r = await salvarModelo(tipo, {
        assunto,
        titulo,
        mensagem,
        textoBotao,
        html: modoHtml ? htmlProprio : null,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setSalvo(true)
      router.refresh()
    })

  const abaModo = (ativo: boolean): React.CSSProperties => ({
    height: 30,
    padding: '0 13px',
    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
    background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
    color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
    fontWeight: 600,
    fontSize: 11,
    lineHeight: 1,
    borderRadius: 'var(--radius-pill)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <Modal
      titulo={tipo === 'giftback' ? 'Modelo do e-mail de aniversário' : 'Modelo do e-mail de recuperação'}
      largura={980}
      aoFechar={aoFechar}
    >
      <div
        className="empilha-900"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 18, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {tipo === 'carrinho' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setModoHtml(false)} className="hover:border-ouro/40 font-sans" style={abaModo(!modoHtml)}>
                Moldura da marca
              </button>
              <button type="button" onClick={abrirModoHtml} className="hover:border-ouro/40 font-sans" style={abaModo(modoHtml)}>
                HTML do zero
              </button>
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Rotulo>Assunto</Rotulo>
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} className="font-sans focus:border-ouro/45" style={campo} />
          </label>

          {modoHtml ? (
            <>
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {'O documento inteiro é seu — o campo abre com a base da marca para editar. Campos vivos: '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{nome}'}</span>
                {', '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{total}'}</span>
                {', '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{itens}'}</span>
                {' (tabela pronta com produtos e total, obrigatório), '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{link}'}</span>
                {' (URL do carrinho) e o bloco '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'[[cupom]] … {cupom} … {desconto} … [[/cupom]]'}</span>
                {', que some inteiro quando o envio não leva cupom. Use tabela e estilo inline — Gmail ignora CSS de cabeçalho.'}
              </span>
              <textarea
                value={htmlProprio}
                onChange={(e) => setHtmlProprio(e.target.value)}
                rows={19}
                spellCheck={false}
                className="font-mono focus:border-ouro/45"
                style={{ ...campo, fontSize: 11, lineHeight: 1.55, resize: 'vertical', whiteSpace: 'pre', overflowX: 'auto' }}
              />
            </>
          ) : (
            <>
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {'Escreva como a marca fala. '}
                <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{nome}'}</span>
                {' vira o primeiro nome do cliente (e some quando não há nome); '}
                {tipo === 'giftback' ? (
                  <>
                    <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{cupom}'}</span>
                    {', '}
                    <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{desconto}'}</span>
                    {' e '}
                    <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{validade}'}</span>
                    {' viram o código, o % e os dias do presente. O quadro do cupom e o rodapé entram sozinhos.'}
                  </>
                ) : (
                  <>
                    <span className="font-mono" style={{ color: 'var(--color-ouro)' }}>{'{total}'}</span>
                    {' vira o valor do carrinho. A lista de itens, o cupom e o rodapé entram sozinhos.'}
                  </>
                )}
              </span>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Título dentro do e-mail</Rotulo>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="font-sans focus:border-ouro/45" style={campo} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Mensagem (linha em branco separa parágrafos)</Rotulo>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={6}
                  className="font-sans focus:border-ouro/45"
                  style={{ ...campo, resize: 'vertical' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Rotulo>Texto do botão</Rotulo>
                <input value={textoBotao} onChange={(e) => setTextoBotao(e.target.value)} className="font-sans focus:border-ouro/45" style={campo} />
              </label>
            </>
          )}

          {erro && (
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
              {erro}
            </span>
          )}
          {salvo && (
            <span className="font-sans" style={{ fontSize: 11.5, color: COR.ok }}>
              Modelo salvo — os próximos envios já saem assim.
            </span>
          )}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={aoFechar}>
              Fechar
            </BotaoSecundario>
            <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
              {pendente ? 'Salvando…' : 'Salvar modelo'}
            </BotaoOuro>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
            <Rotulo>Prévia — exatamente o que o cliente recebe</Rotulo>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
              dados de exemplo{cupom ? ` · cupom ${cupom.codigo}` : ' · sem cupom'}
            </span>
          </div>
          <span
            className="font-sans"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
              fontSize: 11.5,
              color: 'var(--color-corrente)',
            }}
          >
            <span style={{ color: 'var(--color-terciario)' }}>Assunto: </span>
            {previa.assunto}
          </span>
          <iframe
            title="Prévia do e-mail de recuperação"
            srcDoc={previa.html}
            sandbox=""
            style={{
              width: '100%',
              height: 470,
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 10,
              background: '#F6F1E7',
            }}
          />
        </div>
      </div>
    </Modal>
  )
}
