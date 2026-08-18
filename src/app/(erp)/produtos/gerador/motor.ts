/**
 * O motor de imagem do gerador — canvas puro, sem React.
 *
 * Portado do projeto `gerador-frenesi` (App.jsx, versão confirmada pelo dono
 * como a boa) com o desenho preservado traço a traço: as cenas que ele produz
 * SÃO as imagens do catálogo da Shopify, e mudar um sombreado aqui mudaria a
 * cara da loja. O que mudou na vinda para o ERP foi a arquitetura, não o
 * desenho: o motor virou módulo puro (recebe ajustes e imagens, devolve
 * pixels), e todo o estado foi para quem o chama.
 *
 * Tudo aqui roda NO NAVEGADOR. Nenhuma função deste arquivo pode ser chamada
 * de Server Component — canvas, Image e FileReader não existem no servidor.
 */

export const CANVAS_W = 1000
export const CANVAS_H = 1250

export interface Tema {
  accent: string
  accentDeep: string
  accentSoft: string
  accentGlow: string
  neutral: string
  text: string
}

export const TEMA_PADRAO: Tema = {
  accent: '#c6a15a',
  accentDeep: '#8c6529',
  accentSoft: '#f4e7c8',
  accentGlow: 'rgba(198,161,90,0.22)',
  neutral: '#fffaf2',
  text: '#111111',
}

export type Modo = 'default' | 'hover' | 'luxury'

/** Todos os controles da cena, nos três modos. */
export interface Ajustes {
  usePerfumeTheme: boolean
  showInfoLabels: boolean
  perfumeScale: number
  perfumeX: number
  perfumeY: number
  decantScale: number
  decantX: number
  decantY: number
  arrowY: number
  arrowColor: 'gold' | 'black'
  arrowType: string
  arrowScale: number
  showBadge: boolean
  badgeScale: number
  badgeX: number
  badgeY: number
  mode: Modo
  hoverBgColor: string
  hoverPerfumeScale: number
  hoverPerfumeX: number
  hoverPerfumeY: number
  hoverBottleOpacity: number
  hoverCircleSize: number
  hoverCircleX: number
  hoverCircleY: number
  hoverDecantScale: number
  hoverDecantOffsetX: number
  hoverDecantOffsetY: number
  hoverLabel: string
  showHoverLabel: boolean
  hoverLabelSize: number
  showArrow: boolean
  luxuryPerfumeScale: number
  luxuryPerfumeX: number
  luxuryPerfumeY: number
  luxuryCircleSize: number
  luxuryCircleX: number
  luxuryCircleY: number
  luxuryDecantScale: number
  luxuryDecantOffsetX: number
  luxuryDecantOffsetY: number
  luxuryArrowType: string
  luxuryArrowLift: number
  luxuryShowLabel: boolean
  luxuryLabelText: string
  luxuryLabelSize: number
}

export const AJUSTES_PADRAO: Ajustes = {
  usePerfumeTheme: true,
  showInfoLabels: true,
  perfumeScale: 0.82,
  perfumeX: -18,
  perfumeY: -8,
  decantScale: 0.92,
  decantX: 4,
  decantY: 12,
  arrowY: 28,
  arrowColor: 'gold',
  arrowType: 'bold',
  arrowScale: 1,
  showBadge: true,
  badgeScale: 1.18,
  badgeX: 841,
  badgeY: 41,
  mode: 'default',
  hoverBgColor: '#8e6a62',
  hoverPerfumeScale: 1.05,
  hoverPerfumeX: 0,
  hoverPerfumeY: 0,
  hoverBottleOpacity: 0.42,
  hoverCircleSize: 324,
  hoverCircleX: 668,
  hoverCircleY: 686,
  hoverDecantScale: 1.3,
  hoverDecantOffsetX: 0,
  hoverDecantOffsetY: -46,
  hoverLabel: 'DECANT',
  showHoverLabel: true,
  hoverLabelSize: 52,
  showArrow: true,
  luxuryPerfumeScale: 0.96,
  luxuryPerfumeX: 0,
  luxuryPerfumeY: 10,
  luxuryCircleSize: 304,
  luxuryCircleX: 660,
  luxuryCircleY: 168,
  luxuryDecantScale: 1.18,
  luxuryDecantOffsetX: 0,
  luxuryDecantOffsetY: 14,
  luxuryArrowType: 'swoosh',
  luxuryArrowLift: 92,
  luxuryShowLabel: true,
  luxuryLabelText: 'DECANT',
  luxuryLabelSize: 18,
}

/**
 * Os quatro presets de fábrica.
 *
 * "Ads" fica: procurei "tiktok" nas três versões do projeto original (atual,
 * .bak e o zip) e não existe — os presets reais sempre foram estes quatro.
 */
export const PRESETS_DE_FABRICA: { chave: string; nome: string; valores: Partial<Ajustes> }[] = [
  { chave: 'catalogo', nome: 'Catálogo', valores: { ...AJUSTES_PADRAO, mode: 'default' } },
  {
    chave: 'hover',
    nome: 'Hover',
    valores: {
      mode: 'hover',
      usePerfumeTheme: true,
      showInfoLabels: true,
      hoverBgColor: '#8e6a62',
      hoverPerfumeScale: 1.06,
      hoverPerfumeX: 0,
      hoverPerfumeY: 0,
      hoverBottleOpacity: 0.42,
      hoverCircleSize: 324,
      hoverCircleX: 668,
      hoverCircleY: 686,
      hoverDecantScale: 1.3,
      hoverDecantOffsetX: 0,
      hoverDecantOffsetY: -46,
      hoverLabel: 'DECANT',
      showHoverLabel: true,
      hoverLabelSize: 52,
    },
  },
  {
    chave: 'luxo',
    nome: 'Luxo',
    valores: {
      mode: 'luxury',
      usePerfumeTheme: true,
      showInfoLabels: true,
      showBadge: false,
      luxuryPerfumeScale: 0.96,
      luxuryPerfumeX: 0,
      luxuryPerfumeY: 10,
      luxuryCircleSize: 304,
      luxuryCircleX: 660,
      luxuryCircleY: 168,
      luxuryDecantScale: 1.18,
      luxuryDecantOffsetX: 0,
      luxuryDecantOffsetY: 14,
      luxuryArrowType: 'swoosh',
      luxuryArrowLift: 92,
      luxuryShowLabel: true,
      luxuryLabelText: 'DECANT',
      luxuryLabelSize: 18,
    },
  },
  {
    chave: 'ads',
    nome: 'Ads',
    valores: {
      mode: 'default',
      usePerfumeTheme: true,
      showInfoLabels: true,
      perfumeScale: 0.84,
      perfumeX: -26,
      perfumeY: -10,
      decantScale: 0.96,
      decantX: 0,
      decantY: 0,
      arrowY: 12,
      arrowColor: 'black',
      arrowType: 'curve',
      arrowScale: 1.15,
      showArrow: true,
      showBadge: false,
    },
  },
]

export interface Retangulo {
  x: number
  y: number
  w: number
  h: number
}

type Fonte = HTMLImageElement | HTMLCanvasElement

export interface ImagensDaCena {
  perfume: Fonte | null
  decant: Fonte | null
  decantLuxo: Fonte | null
}

type Ctx = CanvasRenderingContext2D

// ── Preparo de imagem ───────────────────────────────────────────────────────

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function ajustarDentro(imgW: number, imgH: number, boxW: number, boxH: number) {
  const razao = Math.min(boxW / imgW, boxH / imgH)
  return { w: imgW * razao, h: imgH * razao }
}

/** Fundo claro vira transparência, com borda suave para não serrilhar. */
export function removerFundoClaro(fonte: Fonte, limite = 245, suavidade = 24): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = fonte.width
  canvas.height = fonte.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(fonte, 0, 0)
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = dados.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    const brilho = (d[i] + d[i + 1] + d[i + 2]) / 3
    if (brilho >= limite) {
      d[i + 3] = 0
    } else if (brilho >= limite - suavidade) {
      const dist = limite - brilho
      d[i + 3] = Math.min(a, Math.max(0, Math.min(255, (dist / suavidade) * 255)))
    }
  }
  ctx.putImageData(dados, 0, 0)
  return canvas
}

/** Corta as bordas transparentes, deixando uma folga pequena. */
export function apararTransparencia(fonte: HTMLCanvasElement, folga = 6): HTMLCanvasElement {
  const sw = fonte.width
  const sh = fonte.height
  const sctx = fonte.getContext('2d')!
  const { data } = sctx.getImageData(0, 0, sw, sh)

  let minX = sw
  let minY = sh
  let maxX = 0
  let maxY = 0
  let achou = false
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[(y * sw + x) * 4 + 3] > 8) {
        achou = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (!achou) return fonte

  minX = Math.max(0, minX - folga)
  minY = Math.max(0, minY - folga)
  maxX = Math.min(sw - 1, maxX + folga)
  maxY = Math.min(sh - 1, maxY + folga)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')!.drawImage(fonte, minX, minY, cw, ch, 0, 0, cw, ch)
  return canvas
}

/**
 * Recorta o frasco de decant da foto composta `decants.png` — o crop fixo é
 * herdado do original e casa com aquela imagem específica.
 */
export function extrairDecant(fonte: HTMLCanvasElement): HTMLCanvasElement {
  const sw = fonte.width
  const sh = fonte.height
  const corte = document.createElement('canvas')
  corte.width = Math.floor(sw * 0.36)
  corte.height = Math.floor(sh * 0.94)
  corte
    .getContext('2d')!
    .drawImage(
      fonte,
      Math.floor(sw * 0.49),
      Math.floor(sh * 0.03),
      Math.floor(sw * 0.36),
      Math.floor(sh * 0.94),
      0,
      0,
      corte.width,
      corte.height,
    )
  return apararTransparencia(corte, 8)
}

/** Prepara a foto crua do perfume: fundo fora, bordas aparadas. */
export function prepararPerfume(img: HTMLImageElement): HTMLCanvasElement {
  return apararTransparencia(removerFundoClaro(img, 245, 28), 6)
}

// ── Cor ─────────────────────────────────────────────────────────────────────

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function hexToRgb(hex: string) {
  const norm = hex.replace('#', '').trim()
  const safe = norm.length === 3 ? norm.split('').map((c) => c + c).join('') : norm
  const v = Number.parseInt(safe, 16)
  if (Number.isNaN(v)) return { r: 198, g: 161, b: 90 }
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((p) => clamp(Math.round(p), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function rgba(cor: string, alpha: number) {
  if (cor.startsWith('rgba')) return cor
  const { r, g, b } = hexToRgb(cor)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function misturar(base: string, alvo: string, razao: number) {
  const a = hexToRgb(base)
  const b = hexToRgb(alvo)
  const t = clamp(razao, 0, 1)
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
}

function brilhoParaTexto(cor: string) {
  const { r, g, b } = hexToRgb(cor)
  return (r * 299 + g * 587 + b * 114) / 1000
}

/**
 * O tema nasce da própria foto: média ponderada das cores saturadas do
 * frasco, com peso maior no meio-tom. É o que faz o cartão, o círculo e as
 * legendas combinarem com cada perfume sem ninguém escolher cor.
 */
export function extrairTemaDaImagem(fonte: Fonte): Tema {
  try {
    const amostra = document.createElement('canvas')
    amostra.width = 72
    amostra.height = 72
    const sctx = amostra.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(fonte, 0, 0, amostra.width, amostra.height)
    const { data } = sctx.getImageData(0, 0, amostra.width, amostra.height)

    let peso = 0
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha < 30) continue
      const cr = data[i]
      const cg = data[i + 1]
      const cb = data[i + 2]
      const max = Math.max(cr, cg, cb)
      const min = Math.min(cr, cg, cb)
      const brilho = (cr + cg + cb) / 3
      const saturacao = max === 0 ? 0 : (max - min) / max
      if (brilho > 245 || brilho < 18) continue
      const w = Math.max(0.28, saturacao * 1.65 + (1 - Math.abs(brilho - 155) / 155) * 0.55)
      peso += w
      r += cr * w
      g += cg * w
      b += cb * w
    }
    if (!peso) return TEMA_PADRAO

    const accent = rgbToHex({ r: r / peso, g: g / peso, b: b / peso })
    return {
      accent,
      accentDeep: misturar(accent, '#1c1408', 0.42),
      accentSoft: misturar(accent, '#fff8ea', 0.76),
      accentGlow: rgba(accent, 0.22),
      neutral: misturar(accent, '#fffdf7', 0.92),
      text: brilhoParaTexto(accent) > 140 ? '#111111' : '#ffffff',
    }
  } catch {
    return TEMA_PADRAO
  }
}

// ── Primitivas de desenho ───────────────────────────────────────────────────

function caminhoArredondado(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const raio = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + raio, y)
  ctx.lineTo(x + w - raio, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + raio)
  ctx.lineTo(x + w, y + h - raio)
  ctx.quadraticCurveTo(x + w, y + h, x + w - raio, y + h)
  ctx.lineTo(x + raio, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - raio)
  ctx.lineTo(x, y + raio)
  ctx.quadraticCurveTo(x, y, x + raio, y)
  ctx.closePath()
}

function sombra(ctx: Ctx, x: number, y: number, w: number, h: number, blur = 28, alpha = 0.14) {
  ctx.save()
  ctx.shadowColor = `rgba(0,0,0,${alpha})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = 14
  ctx.fillStyle = 'rgba(0,0,0,0.001)'
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function brilhoSuave(ctx: Ctx, x: number, y: number, raio: number, cor: string, alpha = 0.18) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, raio)
  glow.addColorStop(0, rgba(cor, alpha))
  glow.addColorStop(0.45, rgba(cor, alpha * 0.52))
  glow.addColorStop(1, rgba(cor, 0))
  ctx.save()
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, raio, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function sombraDeChao(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.14) {
  ctx.save()
  const grad = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.12, cx, cy, Math.max(rx, ry))
  grad.addColorStop(0, `rgba(0,0,0,${alpha})`)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function cartaoDeVidro(ctx: Ctx, x: number, y: number, w: number, h: number, tema: Tema) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.14)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 16
  caminhoArredondado(ctx, x, y, w, h, 34)
  const fill = ctx.createLinearGradient(x, y, x, y + h)
  fill.addColorStop(0, 'rgba(255,255,255,0.98)')
  fill.addColorStop(1, rgba(tema.neutral, 0.94))
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()

  ctx.save()
  caminhoArredondado(ctx, x, y, w, h, 34)
  ctx.strokeStyle = rgba(tema.accent, 0.22)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  ctx.save()
  caminhoArredondado(ctx, x + 10, y + 10, w - 20, h * 0.32, 26)
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h * 0.38)
  sheen.addColorStop(0, 'rgba(255,255,255,0.55)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fill()
  ctx.restore()
}

function pilula(
  ctx: Ctx,
  {
    x,
    y,
    texto,
    fundo = '#ffffff',
    cor = '#111111',
    borda = 'rgba(0,0,0,0.08)',
    tamanho = 21,
    paddingX = 18,
    paddingY = 12,
  }: {
    x: number
    y: number
    texto: string
    fundo?: string
    cor?: string
    borda?: string
    tamanho?: number
    paddingX?: number
    paddingY?: number
  },
): Retangulo {
  ctx.save()
  ctx.font = `800 ${tamanho}px Inter, Arial, sans-serif`
  const w = ctx.measureText(texto).width + paddingX * 2
  const h = tamanho + paddingY * 2
  ctx.shadowColor = 'rgba(0,0,0,0.08)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 10
  caminhoArredondado(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = fundo
  ctx.fill()
  ctx.restore()

  ctx.save()
  caminhoArredondado(ctx, x, y, w, h, h / 2)
  ctx.strokeStyle = borda
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = cor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${tamanho}px Inter, Arial, sans-serif`
  ctx.fillText(texto, x + w / 2, y + h / 2 + 1)
  ctx.restore()
  return { x, y, w, h }
}

function selo100(ctx: Ctx, x: number, y: number, tamanho = 120) {
  const cx = x + tamanho / 2
  const cy = y + tamanho / 2
  const rExterno = tamanho / 2
  const rInterno = tamanho * 0.41
  ctx.save()
  const ouro = ctx.createRadialGradient(cx, cy, rInterno * 0.2, cx, cy, rExterno)
  ouro.addColorStop(0, '#f8e39a')
  ouro.addColorStop(0.5, '#d3ac46')
  ouro.addColorStop(1, '#9b6f17')
  ctx.fillStyle = ouro
  const pontas = 28
  ctx.beginPath()
  for (let i = 0; i < pontas * 2; i++) {
    const ang = (Math.PI / pontas) * i - Math.PI / 2
    const raio = i % 2 === 0 ? rExterno : rExterno * 0.9
    const px = cx + Math.cos(ang) * raio
    const py = cy + Math.sin(ang) * raio
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, rInterno, 0, Math.PI * 2)
  ctx.fillStyle = '#111111'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,215,120,0.8)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, rInterno + 8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#f1cf72'
  ctx.textAlign = 'center'
  ctx.font = `700 ${Math.max(14, tamanho * 0.18)}px Arial`
  ctx.fillText('100%', cx, cy - tamanho * 0.03)
  ctx.font = `700 ${Math.max(9, tamanho * 0.11)}px Arial`
  ctx.fillText('ORIGINAL', cx, cy + tamanho * 0.17)
  ctx.font = `700 ${Math.max(8, tamanho * 0.08)}px Arial`
  ctx.fillText('✦ ✦ ✦', cx, cy - tamanho * 0.22)
  ctx.fillText('✦ ✦ ✦', cx, cy + tamanho * 0.31)
  ctx.restore()
}

// ── Setas ───────────────────────────────────────────────────────────────────

function estiloDeSeta(ctx: Ctx, startX: number, y: number, endX: number, cor: 'gold' | 'black') {
  if (cor === 'gold') {
    const g = ctx.createLinearGradient(startX, y, endX, y)
    g.addColorStop(0, '#8f6820')
    g.addColorStop(0.5, '#e6c870')
    g.addColorStop(1, '#a97a27')
    ctx.strokeStyle = g
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(206,164,71,0.28)'
    ctx.shadowBlur = 8
  } else {
    ctx.strokeStyle = '#111111'
    ctx.fillStyle = '#111111'
    ctx.shadowColor = 'rgba(0,0,0,0.14)'
    ctx.shadowBlur = 4
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function pontaDeSeta(ctx: Ctx, endX: number, endY: number, ang: number, comp = 18, fator = 5.2) {
  const asa = Math.PI / fator
  ctx.beginPath()
  ctx.moveTo(endX, endY)
  ctx.lineTo(endX - comp * Math.cos(ang - asa), endY - comp * Math.sin(ang - asa))
  ctx.lineTo(endX - comp * 0.14 * Math.cos(ang), endY - comp * 0.14 * Math.sin(ang))
  ctx.lineTo(endX - comp * Math.cos(ang + asa), endY - comp * Math.sin(ang + asa))
  ctx.closePath()
  ctx.fill()
}

function pontaAberta(ctx: Ctx, endX: number, endY: number, ang: number, comp = 20, fator = 5.2) {
  const asa = Math.PI / fator
  ctx.beginPath()
  ctx.moveTo(endX - comp * Math.cos(ang - asa), endY - comp * Math.sin(ang - asa))
  ctx.lineTo(endX, endY)
  ctx.lineTo(endX - comp * Math.cos(ang + asa), endY - comp * Math.sin(ang + asa))
  ctx.stroke()
}

function setaBloco(ctx: Ctx, startX: number, endX: number, y: number, cor: 'gold' | 'black', escala = 1) {
  ctx.save()
  estiloDeSeta(ctx, startX, y, endX, cor)
  const espessura = 16 * escala
  const cabeca = 46 * escala
  const fimHaste = endX - cabeca + 6 * escala
  ctx.beginPath()
  ctx.rect(startX, y - espessura / 2, Math.max(8, fimHaste - startX), espessura)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(endX, y)
  ctx.lineTo(endX - cabeca, y - espessura * 1.45)
  ctx.lineTo(endX - cabeca, y + espessura * 1.45)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function seta(
  ctx: Ctx,
  startX: number,
  endX: number,
  y: number,
  tipo: string,
  cor: 'gold' | 'black',
  escala = 1,
) {
  if (tipo === 'none') return
  if (tipo === 'bold') {
    setaBloco(ctx, startX, endX, y, cor, escala)
    return
  }
  ctx.save()
  estiloDeSeta(ctx, startX, y, endX, cor)
  const linha = 5 * escala
  const cabeca = 28 * escala

  if (tipo === 'straight') {
    ctx.lineWidth = linha
    ctx.beginPath()
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
    ctx.stroke()
    pontaDeSeta(ctx, endX, y, 0, cabeca, 5.2)
  }
  if (tipo === 'short') {
    ctx.lineWidth = linha
    const s = startX + 35 * escala
    const e = endX - 35 * escala
    ctx.beginPath()
    ctx.moveTo(s, y)
    ctx.lineTo(e, y)
    ctx.stroke()
    pontaDeSeta(ctx, e, y, 0, 24 * escala, 5.2)
  }
  if (tipo === 'curve') {
    ctx.lineWidth = linha
    const cpX = (startX + endX) / 2
    const cpY = y - 55 * escala
    ctx.beginPath()
    ctx.moveTo(startX, y + 10 * escala)
    ctx.quadraticCurveTo(cpX, cpY, endX, y)
    ctx.stroke()
    const ang = Math.atan2(y - cpY, endX - cpX)
    pontaDeSeta(ctx, endX, y, ang, 28 * escala, 5.2)
  }
  if (tipo === 'minimal') {
    ctx.lineWidth = 3 * escala
    ctx.beginPath()
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
    ctx.stroke()
    pontaDeSeta(ctx, endX, y, 0, 22 * escala, 5.4)
  }
  if (tipo === 'double') {
    ctx.lineWidth = 4.5 * escala
    ctx.beginPath()
    ctx.moveTo(startX, y - 8 * escala)
    ctx.lineTo(endX - 22 * escala, y - 8 * escala)
    ctx.moveTo(startX, y + 8 * escala)
    ctx.lineTo(endX - 22 * escala, y + 8 * escala)
    ctx.stroke()
    pontaDeSeta(ctx, endX, y, 0, 30 * escala, 5.2)
  }
  if (tipo === 'dash') {
    ctx.lineWidth = linha
    ctx.setLineDash([12 * escala, 10 * escala])
    ctx.beginPath()
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
    ctx.stroke()
    ctx.setLineDash([])
    pontaDeSeta(ctx, endX, y, 0, 28 * escala, 5.2)
  }
  ctx.restore()
}

function indicadorDeLuxo(
  ctx: Ctx,
  {
    startX,
    startY,
    endX,
    endY,
    tipo = 'swoosh',
    curvatura = 92,
    espessura = 5,
    corA = '#a27319',
    corB = '#dfc06c',
  }: {
    startX: number
    startY: number
    endX: number
    endY: number
    tipo?: string
    curvatura?: number
    espessura?: number
    corA?: string
    corB?: string
  },
) {
  if (tipo === 'none') return

  const gradiente = ctx.createLinearGradient(startX, startY, endX, endY)
  gradiente.addColorStop(0, corA)
  gradiente.addColorStop(0.52, '#f0d486')
  gradiente.addColorStop(1, corB)

  const montarCaminho = (offset = 0) => {
    let ang = Math.atan2(endY - startY, endX - startX)
    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2
    ctx.beginPath()
    if (tipo === 'straight' || tipo === 'diagonal' || tipo === 'arrow') {
      ctx.moveTo(startX, startY + offset)
      ctx.lineTo(endX, endY + offset)
    } else if (tipo === 'curve') {
      const cpX = midX - 12
      const cpY = midY + curvatura * 0.95 + offset
      ctx.moveTo(startX, startY + offset)
      ctx.quadraticCurveTo(cpX, cpY, endX, endY + offset)
      ang = Math.atan2(endY + offset - cpY, endX - cpX)
    } else if (tipo === 's-curve') {
      const cp1X = startX + (endX - startX) * 0.08
      const cp1Y = startY + curvatura * 0.16 + offset
      const cp2X = startX + (endX - startX) * 0.48
      const cp2Y = startY + curvatura * 1.08 + offset
      const cp3X = startX + (endX - startX) * 0.78
      const cp3Y = endY + curvatura * 0.02 + offset
      ctx.moveTo(startX, startY + offset)
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, midX, midY + curvatura * 0.42 + offset)
      ctx.bezierCurveTo(cp2X, cp2Y, cp3X, cp3Y, endX, endY + offset)
      ang = Math.atan2(endY + offset - cp3Y, endX - cp3X)
    } else if (tipo === 'hook') {
      const cp1X = startX + (endX - startX) * 0.12
      const cp1Y = startY + curvatura * 0.55 + offset
      const cp2X = startX + (endX - startX) * 0.62
      const cp2Y = endY + curvatura * 1.08 + offset
      ctx.moveTo(startX, startY + offset)
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY + offset)
      ang = Math.atan2(endY + offset - cp2Y, endX - cp2X)
    } else {
      const cp1X = startX + (endX - startX) * 0.18
      const cp1Y = startY + curvatura * 1.02 + offset
      const cp2X = startX + (endX - startX) * 0.72
      const cp2Y = endY + curvatura * (tipo === 'minimal' ? 0.28 : 0.42) + offset
      ctx.moveTo(startX, startY + offset)
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY + offset)
      ang = Math.atan2(endY + offset - cp2Y, endX - cp2X)
    }
    return ang
  }

  const espessuraBase =
    tipo === 'minimal'
      ? Math.max(2.5, espessura - 1.5)
      : tipo === 'needle'
        ? Math.max(2.6, espessura - 2)
        : tipo === 'open'
          ? Math.max(2.8, espessura - 1)
          : espessura

  const desenhar = (offset = 0, comCabeca = true, tracejado = false) => {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    montarCaminho(offset)
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'
    ctx.lineWidth = espessuraBase + 3
    ctx.stroke()

    ctx.beginPath()
    const ang = montarCaminho(offset)
    ctx.strokeStyle = gradiente
    ctx.lineWidth = espessuraBase
    if (tracejado) ctx.setLineDash([12, 10])
    ctx.shadowColor = 'rgba(175,132,36,0.16)'
    ctx.shadowBlur = 7
    ctx.stroke()
    ctx.setLineDash([])
    if (comCabeca) {
      if (tipo === 'open') {
        ctx.strokeStyle = gradiente
        ctx.lineWidth = Math.max(2, espessuraBase * 0.7)
        pontaAberta(ctx, endX, endY + offset, ang, espessuraBase * 4.8, 5.2)
      } else {
        ctx.fillStyle = gradiente
        const escalaCabeca = tipo === 'arrow' ? 5.1 : tipo === 'needle' ? 6.0 : 4.2
        const fator = tipo === 'needle' ? 6.3 : 5.25
        pontaDeSeta(ctx, endX, endY + offset, ang, espessuraBase * escalaCabeca, fator)
      }
    }
    ctx.restore()
  }

  if (tipo === 'double') {
    desenhar(-6, false)
    desenhar(6, true)
    return
  }
  if (tipo === 'dash') {
    desenhar(0, true, true)
    return
  }
  desenhar(0, true)
}

function circuloDoDecant(
  ctx: Ctx,
  x: number,
  y: number,
  tamanho: number,
  img: Fonte,
  tema: Tema,
  escala = 1.34,
  offsetX = 0,
  offsetY = -52,
) {
  const cx = x + tamanho / 2
  const cy = y + tamanho / 2

  brilhoSuave(ctx, cx, cy, tamanho * 0.82, tema.accent, 0.18)

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 18
  ctx.beginPath()
  ctx.arc(cx, cy, tamanho / 2, 0, Math.PI * 2)
  const fill = ctx.createLinearGradient(cx - tamanho / 2, cy - tamanho / 2, cx + tamanho / 2, cy + tamanho / 2)
  fill.addColorStop(0, 'rgba(255,255,255,0.99)')
  fill.addColorStop(0.55, rgba(tema.neutral, 0.98))
  fill.addColorStop(1, rgba(tema.accentSoft, 0.94))
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()

  ctx.save()
  const anel = ctx.createLinearGradient(x, y, x + tamanho, y + tamanho)
  anel.addColorStop(0, rgba(tema.accentSoft, 0.95))
  anel.addColorStop(0.5, rgba(tema.accent, 0.75))
  anel.addColorStop(1, rgba(tema.accentDeep, 0.9))
  ctx.strokeStyle = anel
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, tamanho / 2 - 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx - tamanho * 0.12, cy - tamanho * 0.15, tamanho * 0.22, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.52)'
  ctx.fill()
  ctx.restore()

  sombraDeChao(ctx, cx, cy + tamanho * 0.22, tamanho * 0.22, tamanho * 0.08, 0.12)

  const fit = ajustarDentro(img.width, img.height, tamanho * 0.9 * escala, tamanho * 1.18 * escala)
  ctx.drawImage(img, cx - fit.w / 2 + offsetX, cy - fit.h / 2 + offsetY, fit.w, fit.h)
}

// ── As três cenas ───────────────────────────────────────────────────────────

export interface AreasInterativas {
  selo: Retangulo | null
  circulo: Retangulo | null
}

function cenaPadrao(ctx: Ctx, a: Ajustes, imagens: ImagensDaCena, tema: Tema): AreasInterativas {
  const areas: AreasInterativas = { selo: null, circulo: null }
  let perfumeRect: Retangulo | null = null
  let decantRect: Retangulo | null = null

  brilhoSuave(ctx, 258, 360, 220, tema.accentSoft, 0.14)
  brilhoSuave(ctx, 770, 428, 170, tema.accent, 0.12)

  if (imagens.perfume) {
    const box = { x: 58, y: 92, w: 500, h: 920 }
    const fit = ajustarDentro(imagens.perfume.width, imagens.perfume.height, box.w, box.h)
    const w = fit.w * a.perfumeScale
    const h = fit.h * a.perfumeScale
    const x = box.x + (box.w - w) / 2 + a.perfumeX
    const y = box.y + (box.h - h) / 2 + a.perfumeY
    perfumeRect = { x, y, w, h }

    brilhoSuave(ctx, x + w * 0.48, y + h * 0.36, Math.max(150, w * 0.34), tema.accent, 0.12)
    sombraDeChao(ctx, x + w / 2, y + h + 38, Math.max(86, w * 0.28), 22, 0.15)
    sombra(ctx, x, y, w, h, 32, 0.15)
    ctx.drawImage(imagens.perfume, x, y, w, h)
  }

  const cartao = { x: 614, y: 202, w: 264, h: 742 }

  if (imagens.decant) {
    cartaoDeVidro(ctx, cartao.x, cartao.y, cartao.w, cartao.h, tema)
    pilula(ctx, {
      x: cartao.x + 30,
      y: cartao.y + 26,
      texto: 'FRENESI',
      fundo: rgba(tema.accentSoft, 0.92),
      cor: tema.accentDeep,
      borda: rgba(tema.accent, 0.26),
      tamanho: 16,
      paddingX: 14,
      paddingY: 10,
    })

    const box = { x: cartao.x + 26, y: cartao.y + 76, w: cartao.w - 52, h: cartao.h - 132 }
    const fit = ajustarDentro(imagens.decant.width, imagens.decant.height, box.w, box.h)
    const w = fit.w * a.decantScale
    const h = fit.h * a.decantScale
    const x = box.x + (box.w - w) / 2 + a.decantX
    const y = box.y + (box.h - h) / 2 + a.decantY
    decantRect = { x, y, w, h }
    sombraDeChao(ctx, x + w / 2, cartao.y + cartao.h - 86, 74, 20, 0.12)
    sombra(ctx, x, y, w, h, 26, 0.16)
    ctx.drawImage(imagens.decant, x, y, w, h)
  }

  if (a.showArrow && perfumeRect && decantRect) {
    const startX = perfumeRect.x + perfumeRect.w + 24
    const endX = cartao.x - 22
    const centroY =
      Math.min(perfumeRect.y + perfumeRect.h * 0.43, decantRect.y + decantRect.h * 0.43) + a.arrowY
    if (endX > startX) seta(ctx, startX, endX, centroY, a.arrowType, a.arrowColor, a.arrowScale)
  }

  if (a.showInfoLabels && perfumeRect && decantRect) {
    pilula(ctx, {
      x: perfumeRect.x + Math.max(-10, perfumeRect.w / 2 - 112),
      y: Math.min(CANVAS_H - 86, perfumeRect.y + perfumeRect.h + 16),
      texto: 'FRASCO ORIGINAL',
      fundo: 'rgba(255,255,255,0.96)',
      cor: '#111111',
      borda: 'rgba(0,0,0,0.08)',
      tamanho: 18,
    })
    pilula(ctx, {
      x: cartao.x + 28,
      y: cartao.y + cartao.h + 18,
      texto: 'DECANT FRENESI',
      fundo: rgba(tema.accent, 0.14),
      cor: tema.accentDeep,
      borda: rgba(tema.accent, 0.28),
      tamanho: 18,
    })
  }

  if (a.showBadge) {
    const tamanho = 112 * a.badgeScale
    selo100(ctx, a.badgeX, a.badgeY, tamanho)
    areas.selo = { x: a.badgeX, y: a.badgeY, w: tamanho, h: tamanho }
  }
  return areas
}

function cenaHover(ctx: Ctx, a: Ajustes, imagens: ImagensDaCena, tema: Tema): AreasInterativas {
  const areas: AreasInterativas = { selo: null, circulo: null }

  const bg = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H)
  bg.addColorStop(0, misturar(a.hoverBgColor, tema.accentDeep, 0.18))
  bg.addColorStop(0.5, a.hoverBgColor)
  bg.addColorStop(1, misturar(a.hoverBgColor, '#1a120e', 0.16))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  brilhoSuave(ctx, 230, 250, 260, tema.accentSoft, 0.13)
  brilhoSuave(
    ctx,
    a.hoverCircleX + a.hoverCircleSize / 2,
    a.hoverCircleY + a.hoverCircleSize / 2,
    a.hoverCircleSize * 0.95,
    tema.accent,
    0.18,
  )

  const vinheta = ctx.createRadialGradient(
    CANVAS_W / 2,
    CANVAS_H / 2,
    CANVAS_H * 0.18,
    CANVAS_W / 2,
    CANVAS_H / 2,
    CANVAS_H * 0.72,
  )
  vinheta.addColorStop(0, 'rgba(0,0,0,0)')
  vinheta.addColorStop(1, 'rgba(0,0,0,0.24)')
  ctx.fillStyle = vinheta
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  pilula(ctx, {
    x: 58,
    y: 54,
    texto: 'DECANT ORIGINAL',
    fundo: 'rgba(255,255,255,0.12)',
    cor: '#ffffff',
    borda: 'rgba(255,255,255,0.18)',
    tamanho: 18,
    paddingX: 16,
    paddingY: 10,
  })

  if (!imagens.perfume) return areas

  const box = { x: 30, y: 34, w: 760, h: 900 }
  const fit = ajustarDentro(imagens.perfume.width, imagens.perfume.height, box.w, box.h)
  const w = fit.w * a.hoverPerfumeScale
  const h = fit.h * a.hoverPerfumeScale
  const x = box.x + (box.w - w) / 2 + a.hoverPerfumeX
  const y = box.y + (box.h - h) / 2 + a.hoverPerfumeY

  ctx.save()
  ctx.globalAlpha = a.hoverBottleOpacity
  ctx.shadowColor = rgba(tema.accentDeep, 0.22)
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 18
  ctx.drawImage(imagens.perfume, x, y, w, h)
  ctx.restore()

  if (imagens.decant) {
    circuloDoDecant(
      ctx,
      a.hoverCircleX,
      a.hoverCircleY,
      a.hoverCircleSize,
      imagens.decant,
      tema,
      a.hoverDecantScale,
      a.hoverDecantOffsetX,
      a.hoverDecantOffsetY,
    )
    areas.circulo = { x: a.hoverCircleX, y: a.hoverCircleY, w: a.hoverCircleSize, h: a.hoverCircleSize }

    if (a.showHoverLabel) {
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(0,0,0,0.22)'
      ctx.shadowBlur = 14
      ctx.textAlign = 'center'
      ctx.font = `800 ${a.hoverLabelSize}px Inter, Arial, sans-serif`
      ctx.fillText(
        a.hoverLabel || 'DECANT',
        a.hoverCircleX + a.hoverCircleSize / 2,
        a.hoverCircleY + a.hoverCircleSize + a.hoverLabelSize + 20,
      )
      ctx.restore()
    }
  }
  return areas
}

function cenaLuxo(ctx: Ctx, a: Ajustes, imagens: ImagensDaCena, tema: Tema): AreasInterativas {
  const areas: AreasInterativas = { selo: null, circulo: null }

  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.restore()

  if (!imagens.perfume) return areas

  const box = { x: 122, y: 110, w: 610, h: 930 }
  const fit = ajustarDentro(imagens.perfume.width, imagens.perfume.height, box.w, box.h)
  const w = fit.w * a.luxuryPerfumeScale
  const h = fit.h * a.luxuryPerfumeScale
  const x = box.x + (box.w - w) / 2 + a.luxuryPerfumeX
  const y = box.y + (box.h - h) / 2 + a.luxuryPerfumeY
  const perfumeRect: Retangulo = { x, y, w, h }

  sombraDeChao(ctx, x + w / 2, y + h + 30, Math.max(96, w * 0.31), 24, 0.14)
  sombra(ctx, x, y, w, h, 22, 0.1)
  ctx.drawImage(imagens.perfume, x, y, w, h)

  const circleX = a.luxuryCircleX
  const circleY = a.luxuryCircleY
  const circleSize = a.luxuryCircleSize
  const cx = circleX + circleSize / 2
  const cy = circleY + circleSize / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.10)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetY = 10
  ctx.beginPath()
  ctx.arc(cx, cy, circleSize / 2, 0, Math.PI * 2)
  const fundo = ctx.createLinearGradient(circleX, circleY, circleX + circleSize, circleY + circleSize)
  fundo.addColorStop(0, misturar(tema.accent, '#ffffff', 0.62))
  fundo.addColorStop(0.58, misturar(tema.accent, '#ffffff', 0.28))
  fundo.addColorStop(1, misturar(tema.accentDeep, '#ffffff', 0.18))
  ctx.fillStyle = fundo
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, circleSize / 2 - 1.5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(196,157,70,0.92)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx - circleSize * 0.17, cy - circleSize * 0.18, circleSize * 0.24, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fill()
  ctx.restore()

  let decantRect: Retangulo | null = null
  const decantImg = imagens.decantLuxo || imagens.decant
  if (decantImg) {
    const fitD = ajustarDentro(
      decantImg.width,
      decantImg.height,
      circleSize * 0.82 * a.luxuryDecantScale,
      circleSize * 1.32 * a.luxuryDecantScale,
    )
    const dx = cx - fitD.w / 2 + a.luxuryDecantOffsetX
    const dy = cy - fitD.h / 2 + a.luxuryDecantOffsetY
    decantRect = { x: dx, y: dy, w: fitD.w, h: fitD.h }
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    sombraDeChao(ctx, cx, cy + circleSize * 0.22, circleSize * 0.19, circleSize * 0.07, 0.1)
    sombra(ctx, dx, dy, fitD.w, fitD.h, 12, 0.08)
    ctx.drawImage(decantImg, dx, dy, fitD.w, fitD.h)
    ctx.restore()
  }

  indicadorDeLuxo(ctx, {
    startX: perfumeRect.x + perfumeRect.w * 0.83,
    startY: perfumeRect.y + perfumeRect.h * 0.58,
    endX: circleX + circleSize * 0.13,
    endY: circleY + circleSize * 0.76,
    tipo: a.luxuryArrowType,
    curvatura: a.luxuryArrowLift,
    espessura: 5,
    corA: '#a27319',
    corB: '#dfc06c',
  })

  pilula(ctx, {
    x: perfumeRect.x + Math.max(0, perfumeRect.w / 2 - 112),
    y: Math.min(CANVAS_H - 92, perfumeRect.y + perfumeRect.h + 18),
    texto: 'FRASCO ORIGINAL',
    fundo: 'rgba(255,255,255,0.98)',
    cor: '#111111',
    borda: 'rgba(0,0,0,0.08)',
    tamanho: 18,
  })

  if (a.luxuryShowLabel) {
    const texto = a.luxuryLabelText || 'DECANT'
    ctx.save()
    ctx.font = `800 ${a.luxuryLabelSize}px Inter, Arial, sans-serif`
    const larguraTexto = ctx.measureText(texto).width + 36
    ctx.restore()
    const lx = decantRect
      ? decantRect.x + decantRect.w / 2 - larguraTexto / 2
      : circleX + Math.max(0, circleSize / 2 - larguraTexto / 2)
    const ly = decantRect ? decantRect.y + decantRect.h + 16 : circleY + circleSize + 18
    pilula(ctx, {
      x: lx,
      y: ly,
      texto,
      fundo: 'rgba(255,255,255,0.98)',
      cor: '#111111',
      borda: 'rgba(0,0,0,0.08)',
      tamanho: a.luxuryLabelSize,
      paddingX: 18,
      paddingY: 11,
    })
  }

  areas.circulo = { x: circleX, y: circleY, w: circleSize, h: circleSize }
  return areas
}

/**
 * Renderiza a cena inteira num canvas, em qualquer escala.
 *
 * A transformação de escala fica no contexto — as cenas desenham sempre em
 * coordenadas de 1000×1250, e a exportação em alta é só um canvas maior.
 */
export function renderizarCena(
  canvas: HTMLCanvasElement,
  modo: Modo,
  a: Ajustes,
  imagens: ImagensDaCena,
): AreasInterativas {
  const ctx = canvas.getContext('2d')!
  const escalaX = canvas.width / CANVAS_W
  const escalaY = canvas.height / CANVAS_H
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(escalaX, 0, 0, escalaY, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const tema = a.usePerfumeTheme && imagens.perfume ? extrairTemaDaImagem(imagens.perfume) : TEMA_PADRAO

  let areas: AreasInterativas = { selo: null, circulo: null }
  if (modo === 'default') areas = cenaPadrao(ctx, a, imagens, tema)
  if (modo === 'hover') areas = cenaHover(ctx, a, imagens, tema)
  if (modo === 'luxury') areas = cenaLuxo(ctx, a, imagens, tema)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return areas
}

// ── Exportação ──────────────────────────────────────────────────────────────

export function canvasDeExportacao(escala = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(CANVAS_W * escala)
  canvas.height = Math.round(CANVAS_H * escala)
  return canvas
}

export function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Não foi possível gerar o PNG.'))
    }, 'image/png')
  })
}

export function nomeDeArquivoSeguro(nome: string): string {
  return (
    String(nome || 'frenesi')
      .replace(/\.[^/.]+$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'frenesi'
  )
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ZIP sem dependência: PNG já é comprimido, então store (método 0) basta.
const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function criarZip(entradas: { nome: string; dados: Uint8Array }[]): Blob {
  const encoder = new TextEncoder()
  const locais: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let offset = 0

  for (const entrada of entradas) {
    const nome = encoder.encode(entrada.nome)
    const dados = entrada.dados
    const crc = crc32(dados)

    const local = new Uint8Array(30 + nome.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, dados.length, true)
    lv.setUint32(22, dados.length, true)
    lv.setUint16(26, nome.length, true)
    local.set(nome, 30)
    locais.push(local, dados)

    const central = new Uint8Array(46 + nome.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, dados.length, true)
    cv.setUint32(24, dados.length, true)
    cv.setUint16(28, nome.length, true)
    cv.setUint32(42, offset, true)
    central.set(nome, 46)
    centrais.push(central)

    offset += local.length + dados.length
  }

  const inicioCentral = offset
  const tamanhoCentral = centrais.reduce((s, p) => s + p.length, 0)
  const fim = new Uint8Array(22)
  const fv = new DataView(fim.buffer)
  fv.setUint32(0, 0x06054b50, true)
  fv.setUint16(8, entradas.length, true)
  fv.setUint16(10, entradas.length, true)
  fv.setUint32(12, tamanhoCentral, true)
  fv.setUint32(16, inicioCentral, true)

  return new Blob([...locais, ...centrais, fim] as BlobPart[], { type: 'application/zip' })
}

export function pontoNoRetangulo(p: { x: number; y: number }, r: Retangulo): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}
