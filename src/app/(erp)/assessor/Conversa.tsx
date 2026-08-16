'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { BaixarCsv } from '@/components/erp/BaixarCsv'
import {
  CONTORNO,
  Etiqueta,
  Ico,
  Painel,
  TINTA,
  VELADO,
  Vazio,
  type NomeIcone,
  type TomUi,
} from '@/components/erp/ui'
import {
  blocosDaResposta,
  ROTULO_DO_MARCADOR,
  rotuloDaFerramenta,
  type Bloco,
  type Marcador,
} from '@/domain'

/**
 * A conversa com o Gerente — §3.1, §3.3 e §6.2 do escopo.
 *
 * Três decisões governam este arquivo, e todas vêm do documento.
 *
 * A primeira é que a resposta NUNCA é HTML. O texto do modelo é convertido em
 * blocos por uma função pura do domínio e impresso como texto; não há
 * `dangerouslySetInnerHTML` em lugar nenhum. Um assistente que lê o extrato
 * inteiro é exatamente onde não se pode injetar markup.
 *
 * A segunda é que inferência, cenário e recomendação chegam MARCADOS (§6.2).
 * Sem a marca, o palpite e o número apurado chegam ao leitor com o mesmo peso —
 * e num ERP financeiro é essa confusão que faz alguém tratar estimativa como
 * fato.
 *
 * A terceira é "Como cheguei nisso" (§6): toda resposta carrega quais
 * ferramentas rodaram e em quanto tempo. Não é telemetria decorativa; é o que
 * permite conferir a origem de um número sem acreditar no assistente.
 */

export interface MensagemNaTela {
  id: number
  papel: 'usuario' | 'assessor'
  texto: string
  ferramentas?: {
    nome: string
    modo?: string
    ms?: number
    erro?: string
    bloqueio?: string
    /** Preenchidos só quando o resultado virou tabela — é o que liga o CSV (§4.5). */
    argumentos?: Record<string, unknown>
    linhas?: number
  }[]
}

interface ConversaResumo {
  id: string
  titulo: string
  atualizadaEm: string
}

/**
 * Perguntas sugeridas — §3.1, "baseadas no estado atual do negócio".
 *
 * Elas mudam com a fila: quando há item crítico, a primeira sugestão é sobre
 * ele. Uma lista fixa seria enfeite, e enfeite numa tela de decisão gasta o
 * espaço que a decisão precisava.
 */
function sugestoes(temCritico: boolean, temEstoqueCritico: boolean): string[] {
  const base = [
    'O que exige minha decisão hoje, e por quê?',
    'Como está o caixa nos próximos 30 dias?',
    'Quais perfumes mais venderam nos últimos 30 dias?',
    'Faturado x recebido líquido do mês: por que a diferença?',
  ]
  if (temCritico) {
    base.unshift('Explique o item crítico da fila: causa provável e o que fazer primeiro.')
  }
  if (temEstoqueCritico) {
    base.splice(2, 0, 'O que preciso repor antes de faltar, e cabe no caixa?')
  }
  return base.slice(0, 5)
}

export function Conversa({
  conversaId,
  inicial,
  conversas,
  configurado,
  temCritico,
  temEstoqueCritico,
}: {
  conversaId: string | null
  inicial: MensagemNaTela[]
  conversas: ConversaResumo[]
  configurado: boolean
  temCritico: boolean
  temEstoqueCritico: boolean
}) {
  const [mensagens, setMensagens] = useState<MensagemNaTela[]>(inicial)
  const [pergunta, setPergunta] = useState('')
  const [pensando, setPensando] = useState(false)
  const [id, setId] = useState(conversaId)
  const [busca, setBusca] = useState('')
  // A lista lateral vira estado, e não prop direta, porque a conversa nova
  // precisa aparecer nela sem passar por um novo render do servidor — que é
  // justamente o que remontava esta tela e apagava tudo.
  const [listaDeConversas, setListaDeConversas] = useState(conversas)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  // Rolar para o fim quando chega resposta. `behavior: smooth` é intencional:
  // o salto seco faz perder de vista de onde o texto começou.
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length, pensando])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return listaDeConversas
    return listaDeConversas.filter((c) => c.titulo.toLowerCase().includes(q))
  }, [busca, listaDeConversas])

  async function enviar(texto: string) {
    const limpo = texto.trim()
    if (!limpo || pensando) return

    setPergunta('')
    setPensando(true)
    // A pergunta aparece na hora. Esperar o servidor para desenhá-la faria a
    // tela parecer travada nos vinte segundos de uma análise pesada.
    setMensagens((m) => [...m, { id: Date.now(), papel: 'usuario', texto: limpo }])

    try {
      const r = await fetch('/api/assessor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pergunta: limpo, conversaId: id }),
      })
      const dados = (await r.json()) as {
        conversaId?: string
        texto?: string
        erro?: string
        ferramentas?: MensagemNaTela['ferramentas']
      }
      if (dados.conversaId && dados.conversaId !== id) {
        setId(dados.conversaId)
        // `history.replaceState`, e NÃO `router.replace`. A diferença não é de
        // estilo: `router.replace` re-renderiza a página no servidor, o `key`
        // desta conversa muda de "nova" para o id, e o React DESMONTA a tela
        // inteira. Quem estivesse escrevendo a próxima pergunta enquanto a
        // primeira resposta chegava via o texto sumir sozinho — foi o defeito
        // relatado, e nada na tela indicava a causa.
        //
        // Assim a URL passa a apontar para a conversa (recarregar e
        // compartilhar continuam funcionando) sem custar um render novo.
        window.history.replaceState(null, '', `/assessor?c=${dados.conversaId}`)
        // E a conversa entra na lista lateral aqui mesmo, que era a razão de
        // existir do `router.replace`.
        setListaDeConversas((atual) =>
          atual.some((c) => c.id === dados.conversaId!)
            ? atual
            : [
                {
                  id: dados.conversaId!,
                  titulo: limpo.length > 60 ? `${limpo.slice(0, 60)}…` : limpo,
                  atualizadaEm: new Date().toISOString(),
                },
                ...atual,
              ],
        )
      }
      setMensagens((m) => [
        ...m,
        {
          id: Date.now() + 1,
          papel: 'assessor',
          texto: dados.texto ?? `Não consegui responder: ${dados.erro ?? 'erro desconhecido'}`,
          ferramentas: dados.ferramentas,
        },
      ])
    } catch (e) {
      setMensagens((m) => [
        ...m,
        {
          id: Date.now() + 1,
          papel: 'assessor',
          texto: `Não consegui responder: ${e instanceof Error ? e.message : String(e)}`,
        },
      ])
    } finally {
      setPensando(false)
      campo.current?.focus()
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 232px',
        gap: 14,
        alignItems: 'start',
      }}
      className="empilha-1180"
    >
      <Painel
        titulo="Conversa"
        icone="faisca"
        nota={
          configurado
            ? 'Pergunte em linguagem natural. Todo número vem de uma consulta ao ERP.'
            : undefined
        }
        padding="16px 17px 14px"
      >
        {!configurado && (
          <div
            style={{
              padding: '13px 14px',
              borderRadius: 11,
              border: `1px solid ${CONTORNO.atencao}`,
              background: VELADO.atencao,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ color: TINTA.atencao, flex: 'none', marginTop: 1 }}>
              <Ico n="alerta" tamanho={15} />
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.72)' }}
            >
              O Gerente não está configurado: falta a variável <code>ANTHROPIC_API_KEY</code> nas
              variáveis do site. Os blocos acima continuam funcionando — eles são calculados pelo
              ERP e não dependem do modelo.
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 260,
            maxHeight: 560,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {mensagens.length === 0 && !pensando ? (
            <AberturaVazia
              sugestoes={sugestoes(temCritico, temEstoqueCritico)}
              aoEscolher={enviar}
              desabilitado={!configurado}
            />
          ) : (
            mensagens.map((m) => <Fala key={m.id} m={m} />)
          )}
          {pensando && <Pensando />}
          <div ref={fim} />
        </div>

        <Campo
          valor={pergunta}
          aoMudar={setPergunta}
          aoEnviar={() => enviar(pergunta)}
          desabilitado={!configurado || pensando}
          referencia={campo}
        />

        {mensagens.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {sugestoes(temCritico, temEstoqueCritico)
              .slice(0, 3)
              .map((s) => (
                <BotaoSugestao
                  key={s}
                  texto={s}
                  aoClicar={() => enviar(s)}
                  desabilitado={!configurado || pensando}
                />
              ))}
          </div>
        )}
      </Painel>

      <HistoricoLateral
        conversas={filtradas}
        atual={id}
        busca={busca}
        aoBuscar={setBusca}
        total={listaDeConversas.length}
      />
    </div>
  )
}

// ── Abertura ───────────────────────────────────────────────────────────────

function AberturaVazia({
  sugestoes: lista,
  aoEscolher,
  desabilitado,
}: {
  sugestoes: string[]
  aoEscolher: (t: string) => void
  desabilitado: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 0 4px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span
          className="font-display"
          style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-tinta)' }}
        >
          Pergunte sobre a operação.
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.48)', maxWidth: 560, textWrap: 'pretty' }}
        >
          O Gerente cruza pedidos, estoque, produção, financeiro e CRM. Ele responde com os números
          oficiais do ERP e diz de onde cada um veio — e quando o dado não existe, diz isso em vez
          de estimar.
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Etiqueta>Sugestões para agora</Etiqueta>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {lista.map((s) => (
            <BotaoSugestao
              key={s}
              texto={s}
              aoClicar={() => aoEscolher(s)}
              desabilitado={desabilitado}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function BotaoSugestao({
  texto,
  aoClicar,
  desabilitado,
}: {
  texto: string
  aoClicar: () => void
  desabilitado: boolean
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        padding: '7px 12px',
        borderRadius: 9,
        border: '1px solid rgba(255,255,255,.09)',
        background: 'rgba(255,255,255,.025)',
        color: 'rgba(242,237,227,.66)',
        fontSize: 11.5,
        lineHeight: 1.3,
        textAlign: 'left',
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.45 : 1,
      }}
    >
      {texto}
    </button>
  )
}

// ── Falas ──────────────────────────────────────────────────────────────────

function Fala({ m }: { m: MensagemNaTela }) {
  if (m.papel === 'usuario') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          className="font-sans"
          style={{
            maxWidth: '82%',
            padding: '10px 13px',
            borderRadius: '12px 12px 3px 12px',
            border: `1px solid ${CONTORNO.ouro}`,
            background: VELADO.ouro,
            color: 'var(--color-tinta)',
            fontSize: 12.5,
            lineHeight: 1.55,
            textWrap: 'pretty',
            whiteSpace: 'pre-wrap',
          }}
        >
          {m.texto}
        </div>
      </div>
    )
  }

  const blocos = blocosDaResposta(m.texto)
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
      <span
        aria-hidden
        style={{
          width: 27,
          height: 27,
          flex: 'none',
          marginTop: 1,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: VELADO.ouro,
          border: `1px solid ${CONTORNO.ouro}`,
          color: TINTA.ouro,
        }}
      >
        <Ico n="faisca" tamanho={14} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0, flex: 1 }}>
        {blocos.map((b, i) => (
          <BlocoDaResposta key={i} b={b} />
        ))}
        {m.ferramentas && m.ferramentas.length > 0 && (
          <>
            <BaixarCsv ferramentas={m.ferramentas} />
            <ComoChegueiNisso f={m.ferramentas} />
          </>
        )}
      </div>
    </div>
  )
}

const TOM_DO_MARCADOR: Record<Marcador, TomUi> = {
  inferencia: 'info',
  cenario: 'roxo',
  recomendacao: 'ouro',
}

function BlocoDaResposta({ b }: { b: Bloco }) {
  if (b.tipo === 'titulo') {
    return (
      <span
        className="font-display"
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '.02em',
          color: TINTA.ouro,
          marginTop: 3,
        }}
      >
        {b.texto}
      </span>
    )
  }

  if (b.tipo === 'lista') {
    return (
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0 }}>
        {b.itens.map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, listStyle: 'none' }}>
            <span
              aria-hidden
              style={{
                width: 4,
                height: 4,
                marginTop: 7,
                flex: 'none',
                transform: 'rotate(45deg)',
                background: TINTA.ouro,
                opacity: 0.6,
              }}
            />
            <Linha partes={item} />
          </li>
        ))}
      </ul>
    )
  }

  // Parágrafo marcado ganha moldura: a marca precisa ser vista antes de a frase
  // ser lida, senão ela chega tarde demais para mudar como o leitor a
  // interpreta.
  if (b.marcador) {
    const tom = TOM_DO_MARCADOR[b.marcador]
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 12px',
          borderRadius: 10,
          borderLeft: `2px solid ${TINTA[tom]}`,
          background: VELADO[tom],
        }}
      >
        <span
          className="font-sans"
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.11em',
            textTransform: 'uppercase',
            color: TINTA[tom],
          }}
        >
          {ROTULO_DO_MARCADOR[b.marcador]}
        </span>
        <Linha partes={b.partes} />
      </div>
    )
  }

  return <Linha partes={b.partes} />
}

function Linha({ partes }: { partes: { texto: string; forte: boolean }[] }) {
  return (
    <span
      className="font-sans"
      style={{
        fontSize: 12.5,
        lineHeight: 1.62,
        color: 'rgba(242,237,227,.8)',
        textWrap: 'pretty',
      }}
    >
      {partes.map((t, i) =>
        t.forte ? (
          <strong key={i} style={{ fontWeight: 600, color: 'var(--color-tinta)' }}>
            {t.texto}
          </strong>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </span>
  )
}

/**
 * §6 — "Como cheguei nisso".
 *
 * Cada chip é uma consulta que realmente rodou, com o tempo dela. Falha e
 * bloqueio aparecem com a mesma clareza do sucesso: uma resposta construída
 * sobre uma ferramenta que falhou precisa mostrar isso, senão o buraco no dado
 * vira certeza no texto.
 */
function ComoChegueiNisso({ f }: { f: NonNullable<MensagemNaTela['ferramentas']> }) {
  return (
    <details style={{ marginTop: 2 }}>
      <summary
        className="font-sans hover:text-ouro"
        style={{
          cursor: 'pointer',
          fontSize: 10.5,
          letterSpacing: '.04em',
          color: 'rgba(242,237,227,.38)',
          listStyle: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Ico n="olho" tamanho={12} />
        Como cheguei nisso · {f.length} consulta{f.length === 1 ? '' : 's'}
      </summary>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {f.map((x, i) => {
          const tom: TomUi = x.erro ? 'erro' : x.bloqueio ? 'atencao' : x.modo === 'SIMULATE' ? 'roxo' : 'neutro'
          const icone: NomeIcone = x.erro
            ? 'x-circulo'
            : x.bloqueio
              ? 'cadeado'
              : x.modo === 'SIMULATE'
                ? 'balanca'
                : 'check'
          return (
            <span
              key={i}
              title={x.erro ?? x.bloqueio ?? undefined}
              className="font-sans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 9px',
                borderRadius: 7,
                border: `1px solid ${CONTORNO[tom]}`,
                background: VELADO[tom],
                fontSize: 10.5,
                color: tom === 'neutro' ? 'rgba(242,237,227,.6)' : TINTA[tom],
              }}
            >
              <Ico n={icone} tamanho={11} />
              {rotuloDaFerramenta(x.nome)}
              {typeof x.ms === 'number' && x.ms > 0 && (
                <span className="font-mono" style={{ opacity: 0.6 }}>
                  {x.ms}ms
                </span>
              )}
            </span>
          )
        })}
      </div>
    </details>
  )
}

function Pensando() {
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
      <span
        aria-hidden
        style={{
          width: 27,
          height: 27,
          flex: 'none',
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          background: VELADO.ouro,
          border: `1px solid ${CONTORNO.ouro}`,
          color: TINTA.ouro,
        }}
      >
        <Ico n="faisca" tamanho={14} />
      </span>
      <span
        className="font-sans animate-[fr-pulse_1.6s_ease-in-out_infinite]"
        style={{ fontSize: 12, color: 'rgba(242,237,227,.45)' }}
      >
        Consultando o ERP…
      </span>
    </div>
  )
}

// ── Campo de pergunta ──────────────────────────────────────────────────────

function Campo({
  valor,
  aoMudar,
  aoEnviar,
  desabilitado,
  referencia,
}: {
  valor: string
  aoMudar: (v: string) => void
  aoEnviar: () => void
  desabilitado: boolean
  referencia: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 9,
        padding: '9px 10px 9px 13px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,.09)',
        background: 'rgba(255,255,255,.025)',
      }}
    >
      <textarea
        ref={referencia}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          // Enter envia, Shift+Enter quebra linha. É a convenção que quem usa
          // chat já tem na mão; inverter obrigaria a reaprender.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            aoEnviar()
          }
        }}
        rows={1}
        placeholder="Pergunte sobre vendas, caixa, estoque, margem, pedidos…"
        disabled={desabilitado}
        className="font-sans"
        style={{
          flex: 1,
          minWidth: 0,
          resize: 'none',
          maxHeight: 140,
          border: 0,
          outline: 'none',
          background: 'transparent',
          color: 'var(--color-tinta)',
          fontSize: 12.5,
          lineHeight: 1.55,
          padding: '5px 0',
        }}
      />
      <button
        type="button"
        onClick={aoEnviar}
        disabled={desabilitado || !valor.trim()}
        aria-label="Enviar pergunta"
        className="botao-ouro hover:brightness-[1.07]"
        style={{
          width: 34,
          height: 34,
          flex: 'none',
          borderRadius: 9,
          display: 'grid',
          placeItems: 'center',
          cursor: desabilitado || !valor.trim() ? 'not-allowed' : 'pointer',
          opacity: desabilitado || !valor.trim() ? 0.4 : 1,
          boxShadow: 'var(--shadow-ouro)',
        }}
      >
        <Ico n="enviar" tamanho={15} />
      </button>
    </div>
  )
}

// ── §3.1 · Histórico pesquisável ───────────────────────────────────────────

function HistoricoLateral({
  conversas,
  atual,
  busca,
  aoBuscar,
  total,
}: {
  conversas: ConversaResumo[]
  atual: string | null
  busca: string
  aoBuscar: (v: string) => void
  total: number
}) {
  return (
    <Painel titulo="Histórico" icone="lista" padding="15px 15px 15px">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderRadius: 9,
          border: '1px solid rgba(255,255,255,.08)',
          background: 'rgba(255,255,255,.02)',
        }}
      >
        <span style={{ color: 'rgba(242,237,227,.32)', flex: 'none' }}>
          <Ico n="busca" tamanho={13} />
        </span>
        <input
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar conversa"
          className="font-sans"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--color-tinta)',
            fontSize: 11.5,
          }}
        />
      </div>

      <a
        href="/assessor"
        className="font-sans hover:border-ouro/40 hover:text-ouro"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: 32,
          borderRadius: 9,
          border: '1px solid rgba(255,255,255,.09)',
          color: 'rgba(242,237,227,.66)',
          fontSize: 11.5,
          fontWeight: 600,
        }}
      >
        <Ico n="mais" tamanho={13} />
        Nova conversa
      </a>

      {conversas.length === 0 ? (
        <Vazio
          texto={total === 0 ? 'Nenhuma conversa ainda.' : 'Nada com esse termo.'}
          icone="lista"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 420, overflowY: 'auto' }}>
          {conversas.map((c) => {
            const ativa = c.id === atual
            return (
              <a
                key={c.id}
                href={`/assessor?c=${c.id}`}
                className="font-sans hover:bg-white/[.03]"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${ativa ? CONTORNO.ouro : 'transparent'}`,
                  background: ativa ? VELADO.ouro : 'transparent',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.35,
                    fontWeight: ativa ? 600 : 500,
                    color: ativa ? 'var(--color-tinta)' : 'rgba(242,237,227,.68)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {c.titulo}
                </span>
                <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.3)' }}>
                  {new Intl.DateTimeFormat('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(c.atualizadaEm))}
                </span>
              </a>
            )
          })}
        </div>
      )}
    </Painel>
  )
}
