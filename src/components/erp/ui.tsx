import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { Ico, type NomeIcone } from './IconesUi'

/**
 * Kit visual das telas do ERP — a linguagem dos mockups, em componentes.
 *
 * A regra que ele existe para impor: **todo número mora num cartão com um
 * ícone que diz do que ele é, e nenhum número aparece sem a comparação que
 * lhe dá sentido**. Uma tela que monta cartão à mão sempre acaba com um
 * padding diferente, um cinza diferente e um número sem contexto — e foi
 * exatamente assim que o Financeiro antigo virou uma planilha escura.
 *
 * Tudo aqui é componente de servidor. Nada precisa de estado: filtro e
 * período vivem na URL, então segmentos e abas são links.
 */

// ── Paleta semântica ───────────────────────────────────────────────────────

export type TomUi = 'ouro' | 'ok' | 'erro' | 'atencao' | 'info' | 'roxo' | 'ciano' | 'neutro'

/** Cor do traço/valor. */
export const TINTA: Record<TomUi, string> = {
  ouro: '#E9C583',
  ok: '#5FC084',
  erro: '#E8756F',
  atencao: '#E0A85E',
  info: '#7FA9D8',
  roxo: '#B996E0',
  ciano: '#5FC5BE',
  neutro: 'rgba(242,237,227,.62)',
}

/** Fundo do tile de ícone e dos chips — a mesma cor a 12%. */
export const VELADO: Record<TomUi, string> = {
  ouro: 'rgba(233,197,131,.12)',
  ok: 'rgba(95,192,132,.12)',
  erro: 'rgba(232,117,111,.12)',
  atencao: 'rgba(224,168,94,.12)',
  info: 'rgba(127,169,216,.12)',
  roxo: 'rgba(185,150,224,.12)',
  ciano: 'rgba(95,197,190,.12)',
  neutro: 'rgba(255,255,255,.05)',
}

export const CONTORNO: Record<TomUi, string> = {
  ouro: 'rgba(233,197,131,.26)',
  ok: 'rgba(95,192,132,.26)',
  erro: 'rgba(232,117,111,.28)',
  atencao: 'rgba(224,168,94,.26)',
  info: 'rgba(127,169,216,.24)',
  roxo: 'rgba(185,150,224,.24)',
  ciano: 'rgba(95,197,190,.24)',
  neutro: 'rgba(255,255,255,.09)',
}

const BORDA = '1px solid rgba(255,255,255,.065)'
const FUNDO_CARTAO = 'linear-gradient(168deg, #15141608, #0E0E0F)'

// ── Cabeçalho de página ────────────────────────────────────────────────────

/**
 * Título grande em serifa + subtítulo que diz o que a tela responde.
 *
 * O subtítulo não é enfeite: é o contrato da tela. "Realizado, comprometido e
 * projetado" avisa que o número da direita não é dinheiro que existe — e essa
 * é a confusão que o Financeiro precisa evitar antes de qualquer gráfico.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  icone,
  tom = 'ouro',
  acao,
  trilha,
}: {
  titulo: string
  subtitulo: string
  icone?: NomeIcone
  tom?: TomUi
  acao?: ReactNode
  trilha?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 16,
        flexWrap: 'wrap',
        paddingBottom: 2,
      }}
    >
      {icone && (
        <span
          style={{
            width: 40,
            height: 40,
            flex: 'none',
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            background: VELADO[tom],
            border: `1px solid ${CONTORNO[tom]}`,
            color: TINTA[tom],
          }}
        >
          <Ico n={icone} tamanho={19} />
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {trilha && (
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              color: 'rgba(242,237,227,.34)',
            }}
          >
            {trilha}
          </span>
        )}
        <h1
          className="font-display"
          style={{
            margin: 0,
            fontWeight: 600,
            fontSize: 25,
            lineHeight: 1.05,
            letterSpacing: '.005em',
            color: 'var(--color-tinta)',
          }}
        >
          {titulo}
        </h1>
        <span
          className="font-sans"
          style={{ fontSize: 12, lineHeight: 1.4, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}
        >
          {subtitulo}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      {acao}
    </div>
  )
}

// ── Barra de ferramentas ───────────────────────────────────────────────────

export function Ferramentas({
  esquerda,
  direita,
}: {
  esquerda?: ReactNode
  direita?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {esquerda}
      <div style={{ flex: 1, minWidth: 8 }} />
      {direita}
    </div>
  )
}

/** Pílula estática com ícone — o seletor de período do mockup. */
export function Pilula({
  icone,
  children,
  tom = 'neutro',
}: {
  icone?: NomeIcone
  children: ReactNode
  tom?: TomUi
}) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        height: 36,
        padding: '0 14px',
        border: `1px solid ${tom === 'neutro' ? 'rgba(255,255,255,.09)' : CONTORNO[tom]}`,
        background: tom === 'neutro' ? 'rgba(255,255,255,.025)' : VELADO[tom],
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 500,
        color: tom === 'neutro' ? 'var(--color-corrente)' : TINTA[tom],
        whiteSpace: 'nowrap',
      }}
    >
      {icone && <Ico n={icone} tamanho={15} />}
      {children}
    </span>
  )
}

/** Nota "comparado a …" ao lado do período. */
export function Comparacao({ texto, alvo }: { texto: string; alvo: string }) {
  return (
    <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.42)' }}>
      {texto}{' '}
      <span style={{ color: TINTA.ouro, textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {alvo}
      </span>
    </span>
  )
}

/** Botão-link com contorno — Filtros, Exportar, Personalizar. */
export function BotaoLinha({
  href,
  icone,
  children,
  primario,
  altura = 36,
}: {
  href: string
  icone?: NomeIcone
  children: ReactNode
  /** Preenchido em ouro: uma ação por tela, no máximo. */
  primario?: boolean
  altura?: number
}) {
  return (
    <Link
      href={href}
      className={primario ? 'botao-ouro font-sans hover:brightness-[1.06]' : 'font-sans hover:border-ouro/40 hover:text-ouro'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: altura,
        padding: '0 14px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        ...(primario
          ? { border: 0, boxShadow: 'var(--shadow-ouro)' }
          : {
              border: '1px solid rgba(255,255,255,.09)',
              background: 'rgba(255,255,255,.025)',
              color: 'var(--color-secundario)',
            }),
      }}
    >
      {icone && <Ico n={icone} tamanho={15} />}
      {children}
    </Link>
  )
}

/**
 * Segmentado por link — período, regime, visualização.
 *
 * São links e não botões porque o estado mora na URL: assim o F5 mantém a
 * escolha e o alerta de outra tela consegue abrir o recorte que ele acusou.
 */
export function Segmentado({
  opcoes,
  ativo,
  base,
  chave,
  manter,
}: {
  opcoes: { id: string; rotulo: string }[]
  ativo: string
  base: string
  chave: string
  /** Outros parâmetros da URL que não podem se perder na troca. */
  manter?: Record<string, string | undefined>
}) {
  const query = (id: string) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(manter ?? {})) if (v) p.set(k, v)
    p.set(chave, id)
    return `${base}?${p.toString()}`
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 3,
        padding: 3,
        border: '1px solid rgba(255,255,255,.07)',
        background: 'rgba(255,255,255,.02)',
        borderRadius: 11,
      }}
    >
      {opcoes.map((o) => {
        const on = o.id === ativo
        return (
          <Link
            key={o.id}
            href={query(o.id)}
            className="font-sans hover:text-ouro"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 28,
              padding: '0 13px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              background: on ? VELADO.ouro : 'transparent',
              border: on ? `1px solid ${CONTORNO.ouro}` : '1px solid transparent',
              color: on ? TINTA.ouro : 'rgba(242,237,227,.55)',
            }}
          >
            {o.rotulo}
          </Link>
        )
      })}
    </span>
  )
}

/** Abas com contador — as filas da Conciliação e dos Lançamentos. */
export function Abas({
  itens,
  ativo,
  base,
  chave,
  manter,
}: {
  itens: { id: string; rotulo: string; contagem?: number; tom?: TomUi }[]
  ativo: string
  base: string
  chave: string
  manter?: Record<string, string | undefined>
}) {
  const href = (id: string) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(manter ?? {})) if (v) p.set(k, v)
    if (id) p.set(chave, id)
    const q = p.toString()
    return q ? `${base}?${q}` : base
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {itens.map((i) => {
        const on = i.id === ativo
        const tom = i.tom ?? 'neutro'
        return (
          <Link
            key={i.id || 'todos'}
            href={href(i.id)}
            className="font-sans hover:border-ouro/35"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              height: 34,
              padding: '0 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              background: on ? VELADO.ouro : 'rgba(255,255,255,.02)',
              border: `1px solid ${on ? CONTORNO.ouro : 'rgba(255,255,255,.07)'}`,
              color: on ? TINTA.ouro : 'rgba(242,237,227,.62)',
            }}
          >
            {i.rotulo}
            {i.contagem !== undefined && (
              <span
                className="font-mono"
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: on ? 'rgba(233,197,131,.16)' : VELADO[tom],
                  color: on ? TINTA.ouro : TINTA[tom],
                }}
              >
                {i.contagem.toLocaleString('pt-BR')}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Cartão de indicador ────────────────────────────────────────────────────

export interface Delta {
  /** Já em pontos percentuais. Positivo sobe. */
  pct: number
  base: string
  /** Quando subir é RUIM (saídas, inadimplência), inverte a cor. */
  subirEhRuim?: boolean
  /** Para variação em pontos percentuais, e não em %. */
  unidade?: '%' | 'p.p.'
}

export interface IndicadorProps {
  icone: NomeIcone
  tom?: TomUi
  rotulo: string
  valor: string
  /** Cor do valor. Sem isto, o valor sai em tinta neutra. */
  tomValor?: TomUi
  delta?: Delta
  /** Linha de apoio quando não há comparação — "5 compromissos". */
  nota?: string
  tomNota?: TomUi
  /** Série curta desenhada no pé do cartão. */
  faixa?: number[]
  href?: string
}

/**
 * O cartão que carrega todos os KPIs do ERP.
 *
 * Três camadas fixas, nesta ordem: o que é (ícone + rótulo), quanto é (valor
 * em mono) e o que isso significa (delta ou nota). A terceira é a que o
 * escopo exige — "não deve exibir métricas sem ação ou sem contexto de
 * comparação" — e por isso `delta` e `nota` não são ambos opcionais na
 * prática: uma tela que não passa nenhum dos dois está escondendo contexto.
 */
export function Indicador({
  icone,
  tom = 'neutro',
  rotulo,
  valor,
  tomValor,
  delta,
  nota,
  tomNota = 'neutro',
  faixa,
  href,
}: IndicadorProps) {
  const conteudo = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          style={{
            width: 38,
            height: 38,
            flex: 'none',
            borderRadius: 11,
            display: 'grid',
            placeItems: 'center',
            background: VELADO[tom],
            border: `1px solid ${CONTORNO[tom]}`,
            color: TINTA[tom],
          }}
        >
          <Ico n={icone} tamanho={18} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          <span
            className="font-sans"
            style={{
              fontSize: 12,
              lineHeight: 1.25,
              color: 'rgba(242,237,227,.68)',
              textWrap: 'pretty',
            }}
          >
            {rotulo}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 21,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: '-.01em',
              color: tomValor ? TINTA[tomValor] : 'var(--color-tinta)',
              wordBreak: 'break-word',
            }}
          >
            {valor}
          </span>
          {delta && <LinhaDelta {...delta} />}
          {!delta && nota && (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.35, color: TINTA[tomNota], textWrap: 'pretty' }}
            >
              {nota}
            </span>
          )}
        </span>
      </div>
      {faixa && faixa.length > 1 && (
        <Faixa valores={faixa} cor={TINTA[tomValor ?? tom]} />
      )}
    </>
  )

  const estilo: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '15px 16px',
    border: BORDA,
    borderRadius: 14,
    background: FUNDO_CARTAO,
    minWidth: 0,
    textDecoration: 'none',
  }

  return href ? (
    <Link href={href} className="hover:border-ouro/30" style={estilo}>
      {conteudo}
    </Link>
  ) : (
    <div className="hover:border-ouro/20" style={estilo}>
      {conteudo}
    </div>
  )
}

function LinhaDelta({ pct, base, subirEhRuim, unidade = '%' }: Delta) {
  const subiu = pct >= 0
  const bom = subirEhRuim ? !subiu : subiu
  const cor = Math.abs(pct) < 0.05 ? TINTA.neutro : bom ? TINTA.ok : TINTA.erro
  const numero = `${Math.abs(pct).toFixed(1).replace('.', ',')}${unidade === '%' ? '%' : ' p.p.'}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="font-mono" style={{ fontSize: 11.5, color: cor }}>
        {`${subiu ? '↑' : '↓'} ${numero}`}
      </span>
      <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)' }}>
        {base}
      </span>
    </span>
  )
}

/** Faixa de tendência do pé do cartão — área suave, sem eixo. */
function Faixa({ valores, cor }: { valores: number[]; cor: string }) {
  const L = 300
  const A = 34
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const x = (i: number) => (i / (valores.length - 1)) * L
  const y = (v: number) => A - 3 - ((v - min) / (max - min || 1)) * (A - 8)
  const linha = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const id = `f${Math.round(valores[0] * 1000)}${valores.length}`
  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 34, display: 'block' }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity=".26" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${A} ${linha} ${L},${A}`} fill={`url(#${id})`} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="1.6" opacity=".9" />
    </svg>
  )
}

/** Grade dos indicadores: quebra sozinha em vez de espremer seis colunas. */
export function GradeIndicadores({
  children,
  minimo = 218,
}: {
  children: ReactNode
  minimo?: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minimo}px, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  )
}

// ── Painel ─────────────────────────────────────────────────────────────────

/**
 * Cartão de conteúdo com cabeçalho e rodapé opcionais.
 *
 * O rodapé com link existe porque o escopo pede navegação contextual: o
 * painel resume, e a seta leva para a tela que explica a composição.
 */
export function Painel({
  titulo,
  icone,
  tom = 'ouro',
  nota,
  acao,
  rodape,
  children,
  padding = '16px 17px 17px',
}: {
  titulo?: string
  icone?: NomeIcone
  tom?: TomUi
  nota?: string
  acao?: ReactNode
  rodape?: { nota?: string; link?: { href: string; texto: string } }
  children: ReactNode
  padding?: string
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 13,
        padding,
        border: BORDA,
        borderRadius: 14,
        background: FUNDO_CARTAO,
        minWidth: 0,
      }}
    >
      {(titulo || acao) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          {icone && (
            <span style={{ color: TINTA[tom], display: 'grid', placeItems: 'center' }}>
              <Ico n={icone} tamanho={16} />
            </span>
          )}
          {titulo && (
            <h2
              className="font-display"
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: 15.5,
                lineHeight: 1.1,
                color: 'var(--color-tinta)',
              }}
            >
              {titulo}
            </h2>
          )}
          {nota && (
            <span
              className="font-sans"
              style={{ fontSize: 11, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
            >
              {nota}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 4 }} />
          {acao}
        </div>
      )}

      {children}

      {rodape && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            paddingTop: 11,
            borderTop: '1px solid rgba(255,255,255,.05)',
          }}
        >
          {rodape.nota && (
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}
            >
              {rodape.nota}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 4 }} />
          {rodape.link && <LinkSeta href={rodape.link.href}>{rodape.link.texto}</LinkSeta>}
        </div>
      )}
    </section>
  )
}

/** "Ver fluxo de caixa →" — o link de navegação contextual do mockup. */
export function LinkSeta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-sans hover:brightness-125"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 11.5,
        fontWeight: 600,
        color: TINTA.ouro,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      <Ico n="seta-direita" tamanho={13} />
    </Link>
  )
}

/** Botão-link discreto do canto do painel — "Ver todas as contas a pagar". */
export function AcaoPainel({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 28,
        padding: '0 11px',
        border: '1px solid rgba(255,255,255,.08)',
        background: 'rgba(255,255,255,.02)',
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(242,237,227,.6)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      <Ico n="seta-direita" tamanho={12} />
    </Link>
  )
}

// ── Chips e marcadores ─────────────────────────────────────────────────────

export function Chip({
  tom,
  children,
  contorno,
}: {
  tom: TomUi
  children: ReactNode
  /** Só borda, sem preenchimento — para status secundários. */
  contorno?: boolean
}) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontWeight: 600,
        fontSize: 10.5,
        lineHeight: 1,
        padding: '5px 9px',
        borderRadius: 7,
        whiteSpace: 'nowrap',
        color: TINTA[tom],
        background: contorno ? 'transparent' : VELADO[tom],
        border: `1px solid ${contorno ? CONTORNO[tom] : 'transparent'}`,
      }}
    >
      {children}
    </span>
  )
}

export function Bolinha({ cor, tamanho = 8 }: { cor: string; tamanho?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: tamanho, height: tamanho, borderRadius: 3, background: cor, flex: 'none' }}
    />
  )
}

/** Valor em mono — todo número do ERP passa por aqui. */
export function Num({
  children,
  tamanho = 12.5,
  tom,
  peso = 500,
}: {
  children: ReactNode
  tamanho?: number
  tom?: TomUi | string
  peso?: number
}) {
  const cor = tom ? (tom in TINTA ? TINTA[tom as TomUi] : (tom as string)) : 'var(--color-corrente)'
  return (
    <span
      className="font-mono"
      style={{ fontSize: tamanho, fontWeight: peso, color: cor, whiteSpace: 'nowrap' }}
    >
      {children}
    </span>
  )
}

/** Rótulo de coluna/campo: maiúsculas pequenas com tracking. */
export function Etiqueta({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 9.5,
        lineHeight: 1.2,
        letterSpacing: '.13em',
        textTransform: 'uppercase',
        color: 'rgba(242,237,227,.36)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ── Linhas de dado ─────────────────────────────────────────────────────────

/** Rótulo → valor, com nota opcional. A linha dos resumos e das DREs curtas. */
export function LinhaValor({
  rotulo,
  valor,
  nota,
  tom,
  destaque,
  icone,
  tomIcone = 'neutro',
}: {
  rotulo: string
  valor: string
  nota?: string
  tom?: TomUi
  destaque?: boolean
  icone?: NomeIcone
  tomIcone?: TomUi
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: destaque ? '11px 0' : '8px 0',
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}
    >
      {icone && (
        <span style={{ color: TINTA[tomIcone], display: 'grid', placeItems: 'center', flex: 'none' }}>
          <Ico n={icone} tamanho={15} />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span
          className="font-sans"
          style={{
            fontSize: destaque ? 12.5 : 12,
            fontWeight: destaque ? 600 : 400,
            color: destaque ? 'var(--color-tinta)' : 'rgba(242,237,227,.72)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rotulo}
        </span>
        {nota && (
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
            {nota}
          </span>
        )}
      </span>
      <Num tamanho={destaque ? 15 : 12.5} peso={destaque ? 600 : 500} tom={tom}>
        {valor}
      </Num>
    </div>
  )
}

/** Lista de barras horizontais — "o que mais pesa", "fluxo por categoria". */
export function ListaBarras({
  itens,
  maximo,
}: {
  itens: { rotulo: string; valor: number; texto: string; direita?: string; tom?: TomUi; icone?: NomeIcone }[]
  /** Escala. Omitido, usa o maior da lista — comparar entre si é a pergunta. */
  maximo?: number
}) {
  const teto = maximo ?? Math.max(1, ...itens.map((i) => Math.abs(i.valor)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {itens.map((i) => {
        const tom = i.tom ?? 'ouro'
        const pct = Math.min(100, (Math.abs(i.valor) / teto) * 100)
        return (
          <div key={i.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              {i.icone && (
                <span style={{ color: TINTA[tom], display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Ico n={i.icone} tamanho={14} />
                </span>
              )}
              <span
                className="font-sans"
                style={{
                  flex: 1,
                  fontSize: 11.5,
                  color: 'rgba(242,237,227,.78)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {i.rotulo}
              </span>
              <Num tamanho={11.5} peso={500} tom={tom}>
                {i.texto}
              </Num>
              {i.direita && (
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, color: 'rgba(242,237,227,.4)', width: 46, textAlign: 'right' }}
                >
                  {i.direita}
                </span>
              )}
            </div>
            <span
              style={{
                display: 'block',
                height: 5,
                borderRadius: 5,
                background: 'rgba(255,255,255,.045)',
                overflow: 'hidden',
              }}
            >
              <span
                style={{ display: 'block', height: '100%', width: `${pct}%`, background: TINTA[tom], borderRadius: 5 }}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Aviso e vazio ──────────────────────────────────────────────────────────

/** Caixa de destaque — "Risco de caixa", "Atenção". */
export function Destaque({
  tom,
  icone,
  titulo,
  children,
  acao,
}: {
  tom: TomUi
  icone?: NomeIcone
  titulo: string
  children: ReactNode
  acao?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 16px',
        border: `1px solid ${CONTORNO[tom]}`,
        borderRadius: 12,
        background: VELADO[tom],
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: TINTA[tom] }}>
        {icone && <Ico n={icone} tamanho={16} />}
        <span className="font-display" style={{ fontWeight: 600, fontSize: 14 }}>
          {titulo}
        </span>
      </span>
      {children}
      {acao}
    </div>
  )
}

export function Vazio({ texto, icone = 'info' }: { texto: string; icone?: NomeIcone }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 9,
        padding: '30px 16px',
        color: 'rgba(242,237,227,.3)',
      }}
    >
      <Ico n={icone} tamanho={20} />
      <span
        className="font-sans"
        style={{ fontSize: 11.5, textAlign: 'center', textWrap: 'pretty', color: 'rgba(242,237,227,.42)' }}
      >
        {texto}
      </span>
    </div>
  )
}

// ── Tabela ─────────────────────────────────────────────────────────────────

export interface ColunaUi<T> {
  chave: string
  titulo: ReactNode
  largura: string
  alinhamento?: 'left' | 'right' | 'center'
  render: (item: T) => ReactNode
}

/**
 * Tabela das telas do módulo.
 *
 * Rola dentro do próprio cartão em tela estreita — o escopo proíbe rolagem
 * horizontal na PÁGINA, não dentro de um bloco que a anuncia.
 */
export function TabelaUi<T>({
  colunas,
  itens,
  chaveDe,
  faixaDe,
  vazio,
  rodape,
  larguraMinima = 720,
}: {
  colunas: ColunaUi<T>[]
  itens: T[]
  chaveDe: (item: T) => string
  /** Barra de 2px na borda esquerda quando a linha pede atenção. */
  faixaDe?: (item: T) => TomUi | null
  vazio?: ReactNode
  rodape?: ReactNode
  larguraMinima?: number
}) {
  const grid = colunas.map((c) => c.largura).join(' ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: larguraMinima }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grid,
              gap: 12,
              padding: '0 4px 9px',
              borderBottom: '1px solid rgba(255,255,255,.07)',
            }}
          >
            {colunas.map((c) => (
              <Etiqueta key={c.chave} style={{ textAlign: c.alinhamento ?? 'left' }}>
                {c.titulo}
              </Etiqueta>
            ))}
          </div>

          {itens.length === 0 && vazio}

          {itens.map((item) => {
            const faixa = faixaDe?.(item) ?? null
            return (
              <div
                key={chaveDe(item)}
                className="hover:bg-[rgba(255,255,255,.022)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: grid,
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 4px',
                  borderBottom: '1px solid rgba(255,255,255,.04)',
                  borderLeft: `2px solid ${faixa ? TINTA[faixa] : 'transparent'}`,
                  marginLeft: -2,
                  paddingLeft: faixa ? 10 : 4,
                }}
              >
                {colunas.map((c) => (
                  <span
                    key={c.chave}
                    style={{
                      display: 'block',
                      minWidth: 0,
                      overflow: 'hidden',
                      textAlign: c.alinhamento ?? 'left',
                      justifySelf:
                        c.alinhamento === 'right' ? 'end' : c.alinhamento === 'center' ? 'center' : 'stretch',
                    }}
                  >
                    {c.render(item)}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {rodape}
    </div>
  )
}

/** Célula de duas linhas: título + qualificador. */
export function Celula({
  principal,
  secundaria,
  tom,
}: {
  principal: ReactNode
  secundaria?: ReactNode
  tom?: TomUi
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span
        className="font-sans"
        style={{
          fontWeight: 500,
          fontSize: 12,
          lineHeight: 1.3,
          color: tom ? TINTA[tom] : 'rgba(242,237,227,.9)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {principal}
      </span>
      {secundaria && (
        <span
          className="font-sans"
          style={{
            fontSize: 10,
            lineHeight: 1.3,
            color: 'rgba(242,237,227,.38)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {secundaria}
        </span>
      )}
    </span>
  )
}

/** Rodapé de tabela com contagem à esquerda e totais à direita. */
export function RodapeTabela({
  contagem,
  totais,
}: {
  contagem: string
  totais?: { rotulo: string; valor: string; tom?: TomUi }[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        flexWrap: 'wrap',
        paddingTop: 12,
        marginTop: 2,
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}
    >
      <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.45)' }}>
        {contagem}
      </span>
      <div style={{ flex: 1, minWidth: 4 }} />
      {totais?.map((t) => (
        <span key={t.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Etiqueta>{t.rotulo}</Etiqueta>
          <Num tamanho={13} tom={t.tom}>
            {t.valor}
          </Num>
        </span>
      ))}
    </div>
  )
}

// ── Grades de layout ───────────────────────────────────────────────────────

/** Coluna principal + trilha lateral, como Lançamentos e Conciliação. */
export function ComTrilha({
  children,
  trilha,
  largura = 320,
}: {
  children: ReactNode
  trilha: ReactNode
  largura?: number
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `minmax(0,1fr) ${largura}px`,
        gap: 14,
        alignItems: 'start',
      }}
      className="trilha-erp"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{children}</div>
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>{trilha}</aside>
    </div>
  )
}

export function Colunas({
  children,
  proporcao = '1fr 1fr',
  gap = 14,
}: {
  children: ReactNode
  proporcao?: string
  gap?: number
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: proporcao, gap, alignItems: 'start' }}>
      {children}
    </div>
  )
}

export function Pilha({ children, gap = 16 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>
}

export { Ico }
export type { NomeIcone }
