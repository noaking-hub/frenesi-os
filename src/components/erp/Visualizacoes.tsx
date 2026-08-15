import { Bolinha, Etiqueta, Num, TINTA, type TomUi } from './ui'

/**
 * Gráficos das telas do módulo, em SVG puro renderizado no servidor.
 *
 * Sem biblioteca: os quatro formatos que o ERP precisa são retângulos, arcos
 * e polilinhas, e um pacote de gráficos custaria centenas de KB no bundle
 * para desenhá-los — além de montar DEPOIS da página, com o pulo de layout
 * que isso provoca. Aqui eles chegam prontos no HTML.
 *
 * A diferença destes para uma sparkline é o EIXO: sem escala rotulada, uma
 * barra alta não informa nada; com R$ 40k marcado na lateral, ela informa.
 */

const VERDE = '#5FC084'
const VERMELHO = '#E8756F'
const OURO = '#E9C583'
const AZUL = '#7FA9D8'

/** Escala curta e estável, sem depender do locale do servidor. */
export function curto(v: number): string {
  const abs = Math.abs(v)
  const sinal = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sinal}R$ ${Math.round(abs / 1000)}k`
  return `${sinal}R$ ${Math.round(abs)}`
}

/** Passo "redondo" para a régua: 1, 2 ou 5 vezes uma potência de dez. */
function passoBonito(bruto: number): number {
  if (bruto <= 0) return 1
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / potencia
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * potencia
}

export interface DiaSerie {
  rotulo: string
  entrada: number
  saida: number
  /** Ponto da linha acumulada. */
  saldo?: number
  /** Depois de hoje: barra vazada, sinalizando previsão. */
  previsto?: boolean
}

/**
 * Barras de entrada e saída em torno do zero, com a linha do saldo por cima.
 *
 * As barras respondem "quanto entrou e saiu no dia"; a linha responde "onde o
 * caixa chegou". São duas perguntas diferentes, e separá-las em dois gráficos
 * obrigaria a comparar de olho — que é exatamente o erro que a projeção de
 * caixa não pode induzir.
 *
 * O divisor vertical entre realizado e projetado é obrigatório: sem ele, a
 * previsão tem a mesma autoridade visual do fato.
 */
export function BarrasEixo({
  dados,
  altura = 260,
  serieTracejada,
  rotuloTracejada,
}: {
  dados: DiaSerie[]
  altura?: number
  /** Série secundária em tracejado — compromissos, meta, cenário. */
  serieTracejada?: (number | null)[]
  rotuloTracejada?: string
}) {
  if (dados.length === 0) return null

  const L = 1000
  const A = altura
  const margemEsq = 74
  const margemTopo = 16
  const margemBase = 30
  const util = A - margemTopo - margemBase
  const larguraUtil = L - margemEsq - 12

  const maiorBarra = Math.max(1, ...dados.map((d) => Math.max(d.entrada, d.saida)))
  const passo = passoBonito(maiorBarra / 2)
  const teto = Math.ceil(maiorBarra / passo) * passo || passo

  const meio = margemTopo + util / 2
  const escala = (v: number) => (v / teto) * (util / 2)

  const saldos = dados.map((d) => d.saldo ?? 0)
  const temSaldo = dados.some((d) => d.saldo !== undefined)
  const saldoMin = Math.min(0, ...saldos)
  const saldoMax = Math.max(1, ...saldos)
  const ySaldo = (v: number) =>
    margemTopo + util - ((v - saldoMin) / (saldoMax - saldoMin || 1)) * util

  const fatia = larguraUtil / dados.length
  const largura = Math.min(fatia * 0.3, 14)
  const cx = (i: number) => margemEsq + (i + 0.5) * fatia

  // Régua: zero, ±passo, ±2·passo… até o teto. Rótulos de dois em dois quando
  // a altura não comporta todos sem encostar um no outro.
  const niveis: number[] = []
  for (let v = -teto; v <= teto + 1e-9; v += passo) niveis.push(Math.round(v * 100) / 100)

  const corte = dados.findIndex((d) => d.previsto)
  const xCorte = corte > 0 ? margemEsq + corte * fatia : null

  const saltoRotulo = dados.length > 18 ? Math.ceil(dados.length / 14) : 1

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: altura, display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Entradas, saídas e saldo acumulado por dia"
    >
      {niveis.map((v) => {
        const y = meio - escala(v)
        return (
          <g key={v}>
            <line
              x1={margemEsq}
              y1={y}
              x2={L - 12}
              y2={y}
              stroke={v === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.045)'}
              strokeWidth="1"
            />
            <text
              x={margemEsq - 10}
              y={y + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill="rgba(242,237,227,.36)"
              fontFamily="var(--font-mono, monospace)"
            >
              {curto(v)}
            </text>
          </g>
        )
      })}

      {xCorte !== null && (
        <>
          <line
            x1={xCorte}
            y1={margemTopo - 4}
            x2={xCorte}
            y2={A - margemBase}
            stroke="rgba(255,255,255,.16)"
            strokeWidth="1"
          />
          <text
            x={xCorte - 8}
            y={margemTopo + 4}
            textAnchor="end"
            fontSize="10"
            fill="rgba(242,237,227,.34)"
            fontFamily="var(--font-sans, sans-serif)"
          >
            Realizado
          </text>
          <text
            x={xCorte + 8}
            y={margemTopo + 4}
            fontSize="10"
            fill="rgba(242,237,227,.34)"
            fontFamily="var(--font-sans, sans-serif)"
          >
            Projetado
          </text>
        </>
      )}

      {dados.map((d, i) => {
        const x = cx(i) - largura / 2
        const hE = escala(d.entrada)
        const hS = escala(d.saida)
        return (
          <g key={`${d.rotulo}-${i}`}>
            {d.entrada > 0 && (
              <rect
                x={x}
                y={meio - hE}
                width={largura}
                height={hE}
                rx="3"
                fill={d.previsto ? 'none' : VERDE}
                stroke={VERDE}
                strokeWidth={d.previsto ? 1.2 : 0}
                opacity={d.previsto ? 0.75 : 0.92}
              />
            )}
            {d.saida > 0 && (
              <rect
                x={x}
                y={meio}
                width={largura}
                height={hS}
                rx="3"
                fill={d.previsto ? 'none' : VERMELHO}
                stroke={VERMELHO}
                strokeWidth={d.previsto ? 1.2 : 0}
                opacity={d.previsto ? 0.75 : 0.92}
              />
            )}
          </g>
        )
      })}

      {serieTracejada && (
        <polyline
          points={serieTracejada
            .map((v, i) => (v === null ? null : `${cx(i)},${ySaldo(v)}`))
            .filter(Boolean)
            .join(' ')}
          fill="none"
          stroke={AZUL}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          opacity=".8"
        />
      )}

      {temSaldo && (
        <>
          <polyline
            points={dados.map((d, i) => `${cx(i)},${ySaldo(d.saldo ?? 0)}`).join(' ')}
            fill="none"
            stroke={OURO}
            strokeWidth="1.9"
            opacity=".95"
          />
          {dados.map((d, i) => (
            <circle
              key={`p${i}`}
              cx={cx(i)}
              cy={ySaldo(d.saldo ?? 0)}
              r="2.9"
              fill={(d.saldo ?? 0) < 0 ? VERMELHO : OURO}
            />
          ))}
        </>
      )}

      {dados.map((d, i) =>
        i % saltoRotulo === 0 ? (
          <text
            key={`r${i}`}
            x={cx(i)}
            y={A - 9}
            textAnchor="middle"
            fontSize="10.5"
            fill="rgba(242,237,227,.4)"
            fontFamily="var(--font-sans, sans-serif)"
          >
            {d.rotulo}
          </text>
        ) : null,
      )}

      {rotuloTracejada && serieTracejada && (
        <text
          x={L - 12}
          y={margemTopo + 4}
          textAnchor="end"
          fontSize="10"
          fill={AZUL}
          fontFamily="var(--font-sans, sans-serif)"
        >
          {rotuloTracejada}
        </text>
      )}
    </svg>
  )
}

/** Legenda de série, em linha, acima do gráfico. */
export function Legenda({
  itens,
}: {
  itens: { cor: string; rotulo: string; tracejado?: boolean }[]
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      {itens.map((i) => (
        <span key={i.rotulo} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {i.tracejado ? (
            <span
              aria-hidden
              style={{
                width: 16,
                height: 0,
                borderTop: `2px dashed ${i.cor}`,
                flex: 'none',
              }}
            />
          ) : (
            <Bolinha cor={i.cor} tamanho={8} />
          )}
          <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.58)' }}>
            {i.rotulo}
          </span>
        </span>
      ))}
    </div>
  )
}

export const CORES_SERIE = { entrada: VERDE, saida: VERMELHO, saldo: OURO, previsto: AZUL }

/** Paleta das roscas: doze tons distinguíveis sem repetir matiz vizinho. */
export const PALETA = [
  '#E8756F',
  '#E9C583',
  '#5FC084',
  '#7FA9D8',
  '#B996E0',
  '#E0A85E',
  '#5FC5BE',
  '#D98AB4',
  '#8FBF6A',
  '#A8A29A',
  '#6F87C9',
  '#C98A5E',
]

export interface Fatia {
  rotulo: string
  valor: number
  cor?: string
}

/**
 * Rosca com legenda tabular ao lado.
 *
 * O buraco do meio não é estilo: é onde mora o total, e ter o total dentro do
 * desenho evita a pergunta "esses 20,5% são de quanto?". A legenda repete
 * valor E percentual porque só o percentual esconde a ordem de grandeza.
 */
export function RoscaLegenda({
  fatias,
  total,
  legendaTotal = 'Total',
  tamanho = 190,
  formatar,
  maximo = 8,
}: {
  fatias: Fatia[]
  total: number
  legendaTotal?: string
  tamanho?: number
  formatar: (v: number) => string
  /** Acima disto a cauda vira "Outros" — doze fatias viram um arco-íris ilegível. */
  maximo?: number
}) {
  const ordenadas = [...fatias].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
  const principais = ordenadas.slice(0, maximo)
  const cauda = ordenadas.slice(maximo)
  const lista: Fatia[] = cauda.length
    ? [...principais, { rotulo: 'Outros', valor: cauda.reduce((a, f) => a + f.valor, 0) }]
    : principais

  const soma = lista.reduce((a, f) => a + Math.abs(f.valor), 0)
  if (soma <= 0) return null

  const raio = 42
  const espessura = 14
  const circunferencia = 2 * Math.PI * raio
  let acumulado = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg
        viewBox="0 0 110 110"
        style={{ width: tamanho, height: tamanho, display: 'block', flex: 'none' }}
        role="img"
        aria-label={legendaTotal}
      >
        <g transform="rotate(-90 55 55)">
          {lista.map((f, i) => {
            const arco = (Math.abs(f.valor) / soma) * circunferencia
            // O vão de 1 unidade separa as fatias sem borda — borda em arco
            // fino borra na renderização de PDF e de e-mail.
            const traco = `${Math.max(0, arco - 1)} ${circunferencia - Math.max(0, arco - 1)}`
            const deslocamento = -acumulado
            acumulado += arco
            return (
              <circle
                key={f.rotulo + i}
                cx="55"
                cy="55"
                r={raio}
                fill="none"
                stroke={f.cor ?? PALETA[i % PALETA.length]}
                strokeWidth={espessura}
                strokeDasharray={traco}
                strokeDashoffset={deslocamento}
              />
            )
          })}
        </g>
        <text
          x="55"
          y="51"
          textAnchor="middle"
          fontSize="6"
          fill="rgba(242,237,227,.45)"
          fontFamily="var(--font-sans, sans-serif)"
        >
          {legendaTotal}
        </text>
        <text
          x="55"
          y="62"
          textAnchor="middle"
          fontSize="8.6"
          fontWeight="600"
          fill="#F2EDE3"
          fontFamily="var(--font-mono, monospace)"
        >
          {formatar(total)}
        </text>
      </svg>

      <div style={{ flex: 1, minWidth: 210, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lista.map((f, i) => (
          <div key={f.rotulo + i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Bolinha cor={f.cor ?? PALETA[i % PALETA.length]} />
            <span
              className="font-sans"
              style={{
                flex: 1,
                fontSize: 11.5,
                color: 'rgba(242,237,227,.72)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {f.rotulo}
            </span>
            <Num tamanho={11.5} peso={500}>
              {formatar(f.valor)}
            </Num>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, color: 'rgba(242,237,227,.4)', width: 44, textAlign: 'right' }}
            >
              {`${((Math.abs(f.valor) / soma) * 100).toFixed(1).replace('.', ',')}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Área com pontos rotulados — a evolução mensal do resultado.
 *
 * O último ponto ganha rótulo em cápsula porque é o que a leitura procura
 * primeiro: "onde estamos agora" vem antes de "como chegamos aqui".
 */
export function AreaPontos({
  valores,
  rotulos,
  altura = 190,
  cor,
  formatar,
  rotularTodos,
}: {
  valores: number[]
  rotulos: string[]
  altura?: number
  cor?: string
  formatar: (v: number) => string
  /** Todos os pontos rotulados, como na evolução do lucro líquido. */
  rotularTodos?: boolean
}) {
  if (valores.length < 2) return null

  const L = 1000
  const A = altura
  const margemEsq = 66
  const margemBase = 26
  const margemTopo = 24
  const util = A - margemTopo - margemBase

  const min = Math.min(0, ...valores)
  const max = Math.max(1, ...valores)
  const passo = passoBonito((max - min) / 3)
  const teto = Math.ceil(max / passo) * passo || passo
  const piso = Math.floor(min / passo) * passo

  const y = (v: number) => margemTopo + util - ((v - piso) / (teto - piso || 1)) * util
  const x = (i: number) => margemEsq + (i / (valores.length - 1)) * (L - margemEsq - 30)

  const traco = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const tinta = cor ?? (valores[valores.length - 1] >= valores[0] ? VERDE : VERMELHO)
  const id = `a${valores.length}${Math.round(Math.abs(valores[0]))}`

  const niveis: number[] = []
  for (let v = piso; v <= teto + 1e-9; v += passo) niveis.push(Math.round(v * 100) / 100)

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: altura, display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Evolução no período"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tinta} stopOpacity=".3" />
          <stop offset="100%" stopColor={tinta} stopOpacity="0" />
        </linearGradient>
      </defs>

      {niveis.map((v) => (
        <g key={v}>
          <line
            x1={margemEsq}
            y1={y(v)}
            x2={L - 30}
            y2={y(v)}
            stroke={v === 0 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)'}
            strokeWidth="1"
          />
          <text
            x={margemEsq - 10}
            y={y(v) + 3.5}
            textAnchor="end"
            fontSize="10.5"
            fill="rgba(242,237,227,.34)"
            fontFamily="var(--font-mono, monospace)"
          >
            {curto(v)}
          </text>
        </g>
      ))}

      <polygon points={`${x(0)},${y(piso)} ${traco} ${x(valores.length - 1)},${y(piso)}`} fill={`url(#${id})`} />
      <polyline points={traco} fill="none" stroke={tinta} strokeWidth="2" />

      {valores.map((v, i) => {
        const ultimo = i === valores.length - 1
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={ultimo ? 4.4 : 3} fill={tinta} />
            {(rotularTodos || ultimo) && (
              <>
                {ultimo && (
                  <rect
                    x={x(i) - 52}
                    y={y(v) - 26}
                    width={104}
                    height={17}
                    rx="8"
                    fill={tinta}
                    opacity=".16"
                  />
                )}
                <text
                  x={x(i)}
                  y={y(v) - 14}
                  textAnchor="middle"
                  fontSize={ultimo ? '11' : '10'}
                  fontWeight={ultimo ? '600' : '400'}
                  fill={ultimo ? tinta : 'rgba(242,237,227,.5)'}
                  fontFamily="var(--font-mono, monospace)"
                >
                  {formatar(v)}
                </text>
              </>
            )}
          </g>
        )
      })}

      {rotulos.map((r, i) => (
        <text
          key={r + i}
          x={x(i)}
          y={A - 6}
          textAnchor="middle"
          fontSize="10.5"
          fill="rgba(242,237,227,.4)"
          fontFamily="var(--font-sans, sans-serif)"
        >
          {r}
        </text>
      ))}
    </svg>
  )
}

/** Faixa fina de tendência — cabe dentro de uma linha de tabela. */
export function Mini({
  valores,
  largura = 96,
  altura = 30,
  tom,
}: {
  valores: number[]
  largura?: number
  altura?: number
  tom?: TomUi
}) {
  if (valores.length < 2) {
    return (
      <span
        aria-hidden
        style={{ display: 'block', width: largura, height: 1, background: 'rgba(255,255,255,.12)' }}
      />
    )
  }
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const cor = tom
    ? TINTA[tom]
    : valores[valores.length - 1] >= valores[0]
      ? VERDE
      : VERMELHO
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * largura
      const y = altura - 3 - ((v - min) / (max - min || 1)) * (altura - 6)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={largura} height={altura} style={{ display: 'block' }} aria-hidden>
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth="1.6" />
    </svg>
  )
}

/** Barra de progresso com rótulo — metas e proporções simples. */
export function Progresso({
  pct,
  tom = 'ouro',
  altura = 6,
  rotulo,
}: {
  pct: number
  tom?: TomUi
  altura?: number
  rotulo?: string
}) {
  const largura = Math.max(0, Math.min(100, pct))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rotulo && <Etiqueta>{rotulo}</Etiqueta>}
      <span
        style={{
          display: 'block',
          height: altura,
          borderRadius: altura,
          background: 'rgba(255,255,255,.05)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${largura}%`,
            background: TINTA[tom],
            borderRadius: altura,
          }}
        />
      </span>
    </div>
  )
}
