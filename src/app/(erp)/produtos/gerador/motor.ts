/**
 * O motor de imagem do gerador — canvas puro, sem React.
 *
 * Portado do projeto `gerador-frenesi` (App.jsx, versão confirmada pelo dono
 * como a boa) com o desenho preservado traço a traço: a cena que ele produz É
 * a imagem do catálogo da Shopify, e mudar um sombreado aqui mudaria a cara
 * da loja. Das três cenas originais sobrou só a Luxo — o dono aposentou as
 * outras duas — então o modo deixou de existir: o motor renderiza UMA cena.
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

/**
 * Todos os controles da cena. Os nomes `luxury*` são herdados do original de
 * propósito: presets salvos no banco guardam estas chaves, e renomear campo
 * aqui seria invalidar preset alheio em silêncio.
 */
export interface Ajustes {
  usePerfumeTheme: boolean
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

/** O padrão é o preset "Luxo" original — a composição do catálogo. */
export const AJUSTES_PADRAO: Ajustes = {
  usePerfumeTheme: true,
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
 * frasco, com peso maior no meio-tom. É o que faz o círculo do decant
 * combinar com cada perfume sem ninguém escolher cor.
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

// ── Indicador (a linha dourada entre o frasco e o decant) ──────────────────

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

// ── A cena ──────────────────────────────────────────────────────────────────

export interface AreasInterativas {
  circulo: Retangulo | null
}

function cenaLuxo(ctx: Ctx, a: Ajustes, imagens: ImagensDaCena, tema: Tema): AreasInterativas {
  const areas: AreasInterativas = { circulo: null }

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
  if (imagens.decant) {
    const fitD = ajustarDentro(
      imagens.decant.width,
      imagens.decant.height,
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
    ctx.drawImage(imagens.decant, dx, dy, fitD.w, fitD.h)
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
 * A transformação de escala fica no contexto — a cena desenha sempre em
 * coordenadas de 1000×1250, e a exportação em alta é só um canvas maior.
 */
export function renderizarCena(
  canvas: HTMLCanvasElement,
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

  const areas = cenaLuxo(ctx, a, imagens, tema)
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
