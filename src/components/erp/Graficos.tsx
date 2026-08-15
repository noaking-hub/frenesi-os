import type { ReactNode } from 'react'

import { COR } from './tokens'

/**
 * Gráficos do ERP em SVG puro, renderizados no servidor.
 *
 * Nenhuma biblioteca: os quatro formatos que o Financeiro precisa cabem em
 * pouco código, e uma dependência de gráficos custaria centenas de KB no
 * bundle para desenhar barras que são retângulos. Sem JS no cliente, eles
 * aparecem já prontos — não há o pulo de layout de um gráfico que monta
 * depois da página.
 *
 * Todos aceitam altura e se esticam na largura do container.
 */

const OURO = '#EFD18C'
const VERDE = '#5FA97A'
const VERMELHO = '#E06D6D'

/** Formata sem depender do locale do servidor. */
function curto(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v))
}

export interface BarraDupla {
  rotulo: string
  entrada: number
  saida: number
  /** Ponto da linha de saldo acumulado, quando houver. */
  saldo?: number
  /** Depois de hoje: barra listrada, sinalizando previsão. */
  previsto?: boolean
}

/**
 * Barras de entrada e saída com a linha do saldo por cima.
 *
 * É o gráfico central do fluxo de caixa: as barras respondem "quanto entrou e
 * saiu no dia" e a linha responde "onde o caixa chegou" — duas perguntas que
 * separadas exigiriam dois gráficos e uma comparação de olho.
 */
export function BarrasFluxo({
  dados,
  altura = 220,
  mostrarSaldo = true,
}: {
  dados: BarraDupla[]
  altura?: number
  mostrarSaldo?: boolean
}) {
  if (dados.length === 0) return null

  const L = 1000
  const A = altura
  const margemTopo = 12
  const margemBase = 26
  const util = A - margemTopo - margemBase

  const maiorBarra = Math.max(1, ...dados.map((d) => Math.max(d.entrada, d.saida)))
  const saldos = dados.map((d) => d.saldo ?? 0)
  const saldoMin = Math.min(0, ...saldos)
  const saldoMax = Math.max(1, ...saldos)

  // Duas escalas no mesmo desenho: a das barras é simétrica em torno do eixo
  // (entrada sobe, saída desce) e a do saldo cobre todo o intervalo dele.
  const meio = margemTopo + util / 2
  const alturaBarra = (v: number) => (v / maiorBarra) * (util / 2)
  const yDoSaldo = (v: number) =>
    margemTopo + util - ((v - saldoMin) / (saldoMax - saldoMin || 1)) * util

  const passo = L / dados.length
  const largura = Math.min(passo * 0.34, 16)

  const pontos = dados
    .map((d, i) => `${(i + 0.5) * passo},${yDoSaldo(d.saldo ?? 0)}`)
    .join(' ')

  // Rótulos só de dois em dois quando há muitos dias: 30 rótulos de 10px
  // viram uma tarja cinza ilegível.
  const salto = dados.length > 16 ? Math.ceil(dados.length / 12) : 1

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: altura, display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Entradas, saídas e saldo por dia"
    >
      <defs>
        <pattern id="listra" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="3" height="6" fill="currentColor" opacity=".55" />
        </pattern>
      </defs>

      <line x1="0" y1={meio} x2={L} y2={meio} stroke="rgba(255,255,255,.1)" strokeWidth="1" />

      {dados.map((d, i) => {
        const x = (i + 0.5) * passo - largura / 2
        const hE = alturaBarra(d.entrada)
        const hS = alturaBarra(d.saida)
        return (
          <g key={d.rotulo + i}>
            {d.entrada > 0 && (
              <rect
                x={x}
                y={meio - hE}
                width={largura}
                height={hE}
                rx="2"
                fill={d.previsto ? 'url(#listra)' : VERDE}
                color={VERDE}
                opacity={d.previsto ? 0.85 : 0.9}
              />
            )}
            {d.saida > 0 && (
              <rect
                x={x}
                y={meio}
                width={largura}
                height={hS}
                rx="2"
                fill={d.previsto ? 'url(#listra)' : VERMELHO}
                color={VERMELHO}
                opacity={d.previsto ? 0.85 : 0.9}
              />
            )}
          </g>
        )
      })}

      {mostrarSaldo && (
        <>
          <polyline points={pontos} fill="none" stroke={OURO} strokeWidth="1.8" opacity=".9" />
          {dados.map((d, i) => (
            <circle
              key={`p${i}`}
              cx={(i + 0.5) * passo}
              cy={yDoSaldo(d.saldo ?? 0)}
              r="2.6"
              fill={(d.saldo ?? 0) < 0 ? VERMELHO : OURO}
            />
          ))}
        </>
      )}

      {dados.map((d, i) =>
        i % salto === 0 ? (
          <text
            key={`r${i}`}
            x={(i + 0.5) * passo}
            y={A - 8}
            textAnchor="middle"
            fontSize="11"
            fill="rgba(242,237,227,.45)"
            fontFamily="var(--font-sans, sans-serif)"
          >
            {d.rotulo}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export interface FatiaRosca {
  rotulo: string
  valor: number
  cor: string
}

/**
 * Rosca de composição, com o total no miolo.
 *
 * O buraco no meio não é enfeite: é onde mora o total, e ter o total dentro
 * do gráfico evita a pergunta "esses 20,5% são de quanto?".
 */
export function Rosca({
  fatias,
  tamanho = 190,
  legendaTotal,
  valorTotal,
}: {
  fatias: FatiaRosca[]
  tamanho?: number
  legendaTotal?: string
  valorTotal?: string
}) {
  const total = fatias.reduce((a, f) => a + Math.abs(f.valor), 0)
  if (total <= 0) return null

  const raio = 44
  const espessura = 15
  const circunferencia = 2 * Math.PI * raio
  let acumulado = 0

  return (
    <svg
      viewBox="0 0 110 110"
      style={{ width: tamanho, height: tamanho, display: 'block', flex: 'none' }}
      role="img"
      aria-label="Composição por categoria"
    >
      <g transform="rotate(-90 55 55)">
        {fatias.map((f, i) => {
          const fatia = (Math.abs(f.valor) / total) * circunferencia
          // O gap de 1 unidade separa as fatias sem precisar de borda — borda
          // em arco fino borra na renderização de e-mail e de PDF.
          const traco = `${Math.max(0, fatia - 1)} ${circunferencia - Math.max(0, fatia - 1)}`
          const deslocamento = -acumulado
          acumulado += fatia
          return (
            <circle
              key={f.rotulo + i}
              cx="55"
              cy="55"
              r={raio}
              fill="none"
              stroke={f.cor}
              strokeWidth={espessura}
              strokeDasharray={traco}
              strokeDashoffset={deslocamento}
            />
          )
        })}
      </g>
      {legendaTotal && (
        <text
          x="55"
          y="51"
          textAnchor="middle"
          fontSize="6.5"
          fill="rgba(242,237,227,.5)"
          fontFamily="var(--font-sans, sans-serif)"
        >
          {legendaTotal}
        </text>
      )}
      {valorTotal && (
        <text
          x="55"
          y="62"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill="#F2EDE3"
          fontFamily="var(--font-mono, monospace)"
        >
          {valorTotal}
        </text>
      )}
    </svg>
  )
}

/**
 * Linha de evolução com área — para série mensal (lucro, receita).
 *
 * Marca o último ponto porque é o que a leitura procura primeiro: "onde
 * estamos agora" vem antes de "como chegamos aqui".
 */
export function LinhaEvolucao({
  valores,
  rotulos,
  altura = 150,
  cor = VERDE,
}: {
  valores: number[]
  rotulos?: string[]
  altura?: number
  cor?: string
}) {
  if (valores.length < 2) return null

  const L = 1000
  const A = altura
  const margem = 22
  const util = A - margem - 14

  const min = Math.min(0, ...valores)
  const max = Math.max(1, ...valores)
  const y = (v: number) => 14 + util - ((v - min) / (max - min || 1)) * util
  const x = (i: number) => (i / (valores.length - 1)) * L

  const linha = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `${x(0)},${A - margem} ${linha} ${x(valores.length - 1)},${A - margem}`

  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: altura, display: 'block', overflow: 'visible' }}
      role="img"
      aria-label="Evolução no período"
    >
      <defs>
        <linearGradient id="areaEvolucao" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity=".28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#areaEvolucao)" />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="2" />
      {valores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === valores.length - 1 ? 4 : 2.4} fill={cor} />
      ))}
      {rotulos?.map((r, i) => (
        <text
          key={r + i}
          x={x(i)}
          y={A - 4}
          textAnchor={i === 0 ? 'start' : i === valores.length - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill="rgba(242,237,227,.45)"
          fontFamily="var(--font-sans, sans-serif)"
        >
          {r}
        </text>
      ))}
    </svg>
  )
}

/**
 * Barra horizontal comparativa — usada em "o que mais pesa".
 *
 * A escala é sempre a do MAIOR item da lista, não a do total: comparar
 * despesas entre si é a pergunta, e barras de 3% e 4% do total ficariam
 * visualmente idênticas.
 */
export function BarraProporcao({
  valor,
  maximo,
  cor = OURO,
  altura = 6,
}: {
  valor: number
  maximo: number
  cor?: string
  altura?: number
}) {
  const pct = maximo > 0 ? Math.min(100, (Math.abs(valor) / maximo) * 100) : 0
  return (
    <span
      style={{
        display: 'block',
        height: altura,
        borderRadius: altura,
        background: 'rgba(255,255,255,.06)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{ display: 'block', height: '100%', width: `${pct}%`, background: cor, borderRadius: altura }}
      />
    </span>
  )
}

/** Faixa fina de sparkline — cabe dentro de uma linha de tabela. */
export function Sparkline({
  valores,
  largura = 92,
  altura = 26,
  cor,
}: {
  valores: number[]
  largura?: number
  altura?: number
  cor?: string
}) {
  if (valores.length < 2) {
    return (
      <span
        style={{ display: 'block', width: largura, height: 1, background: 'rgba(255,255,255,.14)' }}
      />
    )
  }
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const tom = cor ?? (valores[valores.length - 1] >= valores[0] ? VERDE : VERMELHO)
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * largura
      const y = altura - 2 - ((v - min) / (max - min || 1)) * (altura - 4)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={largura} height={altura} style={{ display: 'block' }} aria-hidden>
      <polyline points={pontos} fill="none" stroke={tom} strokeWidth="1.5" />
    </svg>
  )
}

/** Legenda compartilhada pelos gráficos, no padrão do ERP. */
export function LegendaGrafico({ itens }: { itens: { cor: string; rotulo: ReactNode }[] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {itens.map((i, n) => (
        <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: 2, background: i.cor, flex: 'none' }}
          />
          <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
            {i.rotulo}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Paleta das roscas: distinta o bastante para 8 fatias sem repetir tom. */
export const PALETA_CATEGORIA = [
  '#E06D6D',
  '#EFD18C',
  '#5FA97A',
  '#7BA7D4',
  '#C89BD9',
  '#E0A86D',
  '#6DC7C0',
  '#A8A29A',
]

export { curto as valorCurto, COR as CORES_ERP }
