'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { PresetDoGerador } from '@/data/gerador-presets'

import { excluirPreset, salvarPreset } from './actions'
import {
  AJUSTES_PADRAO,
  CANVAS_H,
  CANVAS_W,
  PRESETS_DE_FABRICA,
  apararTransparencia,
  baixarBlob,
  canvasDeExportacao,
  canvasParaBlob,
  carregarImagem,
  criarZip,
  extrairDecant,
  nomeDeArquivoSeguro,
  pontoNoRetangulo,
  prepararPerfume,
  removerFundoClaro,
  renderizarCena,
  type Ajustes,
  type AreasInterativas,
  type ImagensDaCena,
  type Modo,
} from './motor'

/**
 * Gerador de imagens de produto — a ferramenta que compõe a foto do perfume
 * com o frasco de decant da FRENESI.
 *
 * A imagem que sai daqui É a imagem do catálogo da Shopify; a foto que entra é
 * a crua do frasco original. Por isso a entrada continua sendo upload (puxar
 * do catálogo seria circular: lá já está a composição pronta), e a saída ganha
 * nome de arquivo limpo para subir direto.
 *
 * O motor de desenho veio intacto do projeto original. O que mudou:
 * - o estado virou UM objeto (`ajustes`) em vez de cinquenta useState;
 * - os presets moram no banco, com autor, em vez do localStorage;
 * - a interface fala a língua do ERP.
 */

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: 'default', rotulo: 'Padrão' },
  { valor: 'hover', rotulo: 'Hover' },
  { valor: 'luxury', rotulo: 'Luxo' },
]

const TIPOS_DE_SETA = [
  ['bold', 'Bloco'],
  ['straight', 'Reta'],
  ['curve', 'Curva premium'],
  ['short', 'Curta'],
  ['minimal', 'Minimal'],
  ['double', 'Dupla'],
  ['dash', 'Tracejada'],
  ['none', 'Sem seta'],
] as const

const TIPOS_DE_INDICADOR = [
  ['swoosh', 'Swoosh premium'],
  ['curve', 'Curva suave'],
  ['s-curve', 'Curva em S'],
  ['arrow', 'Seta clássica'],
  ['straight', 'Reta diagonal'],
  ['needle', 'Seta fina'],
  ['open', 'Seta aberta'],
  ['minimal', 'Minimal'],
  ['double', 'Duplo'],
  ['dash', 'Tracejado'],
  ['hook', 'Curva gancho'],
  ['none', 'Sem indicador'],
] as const

interface ItemDoLote {
  id: string
  file: File
  nome: string
  estado: 'pendente' | 'processando' | 'concluída'
}

export function GeradorCliente({ presets }: { presets: PresetDoGerador[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const areasRef = useRef<AreasInterativas>({ selo: null, circulo: null })
  const arrastoRef = useRef<{ alvo: 'selo' | 'circulo'; dx: number; dy: number } | null>(null)

  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO)
  const [perfumeImg, setPerfumeImg] = useState<HTMLCanvasElement | null>(null)
  const [nomeDoPerfume, setNomeDoPerfume] = useState('')
  const [decantImg, setDecantImg] = useState<HTMLCanvasElement | null>(null)
  const [decantLuxoImg, setDecantLuxoImg] = useState<HTMLCanvasElement | null>(null)
  const [escalaExport, setEscalaExport] = useState(2)
  const [nomePreset, setNomePreset] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const [lote, setLote] = useState<ItemDoLote[]>([])
  const [presetsDoLote, setPresetsDoLote] = useState<Record<string, boolean>>({
    catalogo: true,
    hover: true,
    luxo: false,
    ads: false,
  })
  const [presetsSalvosNoLote, setPresetsSalvosNoLote] = useState<Record<string, boolean>>({})
  const [statusDoLote, setStatusDoLote] = useState('')
  const [exportandoLote, setExportandoLote] = useState(false)

  const imagens: ImagensDaCena = useMemo(
    () => ({ perfume: perfumeImg, decant: decantImg, decantLuxo: decantLuxoImg }),
    [perfumeImg, decantImg, decantLuxoImg],
  )

  const mudar = useCallback(<K extends keyof Ajustes>(chave: K, valor: Ajustes[K]) => {
    setAjustes((a) => ({ ...a, [chave]: valor }))
  }, [])

  // O frasco de decant da marca, preparado uma vez: fundo fora e recorte do
  // frasco certo dentro da foto composta.
  useEffect(() => {
    carregarImagem('/gerador/decants.png')
      .then((img) => setDecantImg(extrairDecant(removerFundoClaro(img, 245, 20))))
      .catch(() => setErro('Não foi possível carregar a imagem do decant (public/gerador/decants.png).'))
    carregarImagem('/gerador/decant-luxury.png')
      .then((img) => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        c.getContext('2d')!.drawImage(img, 0, 0)
        setDecantLuxoImg(apararTransparencia(c, 2))
      })
      .catch(() => console.warn('decant-luxury.png não carregou — o modo Luxo usa o decant padrão.'))
  }, [])

  // Redesenha a prévia a cada mudança. O canvas de exibição é o mesmo 1000×1250
  // do arquivo final — o que se vê é o que sai.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    areasRef.current = renderizarCena(canvas, ajustes.mode, ajustes, imagens)
  }, [ajustes, imagens])

  function aoEnviarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNomeDoPerfume(file.name)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const img = await carregarImagem(String(reader.result))
        setPerfumeImg(prepararPerfume(img))
        setErro(null)
      } catch {
        setErro('Não foi possível ler a imagem do perfume.')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Arrasto do selo e do círculo, direto na prévia ────────────────────────

  function pontoDoCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((e.clientY - rect.top) * CANVAS_H) / rect.height,
    }
  }

  function aoPressionar(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = pontoDoCanvas(e)
    if (!p) return
    const { selo, circulo } = areasRef.current
    if ((ajustes.mode === 'hover' || ajustes.mode === 'luxury') && circulo && pontoNoRetangulo(p, circulo)) {
      arrastoRef.current = { alvo: 'circulo', dx: p.x - circulo.x, dy: p.y - circulo.y }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    if (ajustes.mode === 'default' && ajustes.showBadge && selo && pontoNoRetangulo(p, selo)) {
      arrastoRef.current = { alvo: 'selo', dx: p.x - selo.x, dy: p.y - selo.y }
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function aoMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const arrasto = arrastoRef.current
    if (!arrasto) return
    const p = pontoDoCanvas(e)
    if (!p) return
    if (arrasto.alvo === 'circulo') {
      if (ajustes.mode === 'luxury') {
        setAjustes((a) => ({ ...a, luxuryCircleX: p.x - arrasto.dx, luxuryCircleY: p.y - arrasto.dy }))
      } else {
        setAjustes((a) => ({ ...a, hoverCircleX: p.x - arrasto.dx, hoverCircleY: p.y - arrasto.dy }))
      }
      return
    }
    setAjustes((a) => ({ ...a, badgeX: p.x - arrasto.dx, badgeY: p.y - arrasto.dy }))
  }

  function aoSoltar() {
    arrastoRef.current = null
  }

  // ── Exportação ────────────────────────────────────────────────────────────

  const nomeBase = nomeDeArquivoSeguro(nomeDoPerfume)

  async function exportarAtual() {
    const canvas = canvasDeExportacao(escalaExport)
    renderizarCena(canvas, ajustes.mode, ajustes, imagens)
    baixarBlob(await canvasParaBlob(canvas), `${nomeBase}-${ajustes.mode}.png`)
  }

  function aplicarPreset(valores: Partial<Ajustes>) {
    setAjustes((a) => ({ ...AJUSTES_PADRAO, ...a, ...valores }))
  }

  function aoAdicionarAoLote(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setLote((atual) => [
      ...atual,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        nome: file.name,
        estado: 'pendente' as const,
      })),
    ])
    setStatusDoLote(`${files.length} imagem(ns) adicionada(s) ao lote.`)
    e.target.value = ''
  }

  async function exportarLote() {
    if (!lote.length || !decantImg || exportandoLote) return
    const escolhidos = [
      ...PRESETS_DE_FABRICA.filter((p) => presetsDoLote[p.chave]).map((p) => ({
        chave: p.chave,
        valores: { ...ajustes, ...p.valores } as Ajustes,
      })),
      ...presets
        .filter((p) => presetsSalvosNoLote[p.id])
        .map((p) => ({
          chave: `personalizado-${nomeDeArquivoSeguro(p.nome)}`,
          valores: { ...AJUSTES_PADRAO, ...ajustes, ...(p.valores as Partial<Ajustes>) } as Ajustes,
        })),
    ]
    if (!escolhidos.length) {
      setStatusDoLote('Escolha ao menos um preset para o lote.')
      return
    }

    setExportandoLote(true)
    try {
      const entradas: { nome: string; dados: Uint8Array }[] = []
      for (const [i, item] of lote.entries()) {
        setLote((atual) => atual.map((r) => (r.id === item.id ? { ...r, estado: 'processando' } : r)))
        const url = URL.createObjectURL(item.file)
        try {
          const preparado = prepararPerfume(await carregarImagem(url))
          for (const preset of escolhidos) {
            setStatusDoLote(`Processando ${i + 1}/${lote.length}: ${item.nome} — ${preset.chave}`)
            const canvas = canvasDeExportacao(escalaExport)
            renderizarCena(canvas, preset.valores.mode, preset.valores, {
              perfume: preparado,
              decant: decantImg,
              decantLuxo: decantLuxoImg,
            })
            const blob = await canvasParaBlob(canvas)
            entradas.push({
              nome: `${preset.chave}/${nomeDeArquivoSeguro(item.nome)}-${preset.chave}.png`,
              dados: new Uint8Array(await blob.arrayBuffer()),
            })
          }
        } finally {
          URL.revokeObjectURL(url)
        }
        setLote((atual) => atual.map((r) => (r.id === item.id ? { ...r, estado: 'concluída' } : r)))
      }
      baixarBlob(criarZip(entradas), `frenesi-lote-${Date.now()}.zip`)
      setStatusDoLote(`${entradas.length} imagem(ns) geradas no ZIP.`)
    } catch (e) {
      console.error(e)
      setStatusDoLote('Erro ao exportar o lote. Confira as imagens e tente de novo.')
    } finally {
      setExportandoLote(false)
    }
  }

  // ── Interface ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao>Gerador de imagens</TituloSecao>
        <span style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          a foto crua do perfume entra; a imagem do catálogo sai
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={escalaExport}
            onChange={(e) => setEscalaExport(Number(e.target.value))}
            style={campo}
          >
            <option value={1}>Padrão — 1000×1250</option>
            <option value={2}>Alta — 2000×2500</option>
            <option value={3}>Ultra — 3000×3750</option>
          </select>
          <BotaoOuro onClick={() => void exportarAtual()} altura={34} desabilitado={!perfumeImg}>
            Baixar PNG
          </BotaoOuro>
        </div>
      </div>

      {erro && <div style={{ fontSize: 12.5, color: COR.erro }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Prévia */}
        <div style={{ flex: '1 1 420px', minWidth: 340, maxWidth: 560 }}>
          <div
            style={{
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#EDE6DA',
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={aoPressionar}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerLeave={aoSoltar}
              style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: 'grab' }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-terciario)', paddingTop: 8 }}>
            {ajustes.mode === 'default'
              ? 'Arraste o selo 100% direto na prévia.'
              : 'Arraste o círculo do decant direto na prévia.'}
          </div>
        </div>

        {/* Controles */}
        <div style={{ flex: '1 1 420px', minWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Grupo titulo="Foto do perfume">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                border: '1px dashed rgba(239,209,140,.4)',
                borderRadius: 10,
                padding: '16px 12px',
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--color-secundario)',
              }}
            >
              <input type="file" accept="image/*" onChange={aoEnviarFoto} style={{ display: 'none' }} />
              {perfumeImg ? `Trocar foto (${nomeDoPerfume})` : 'Enviar a foto crua do frasco original'}
            </label>
            <div style={{ display: 'flex', gap: 14, paddingTop: 10, flexWrap: 'wrap' }}>
              <Marcar
                rotulo="Tema pela cor do perfume"
                valor={ajustes.usePerfumeTheme}
                aoMudar={(v) => mudar('usePerfumeTheme', v)}
              />
              <Marcar
                rotulo="Legendas premium"
                valor={ajustes.showInfoLabels}
                aoMudar={(v) => mudar('showInfoLabels', v)}
              />
            </div>
          </Grupo>

          <Grupo titulo="Modo da cena">
            <div style={{ display: 'flex', gap: 6 }}>
              {MODOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => mudar('mode', m.valor)}
                  style={{
                    flex: 1,
                    height: 32,
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: 'pointer',
                    border: `1px solid ${ajustes.mode === m.valor ? 'rgba(239,209,140,.5)' : 'rgba(255,255,255,.12)'}`,
                    background: ajustes.mode === m.valor ? 'rgba(239,209,140,.12)' : 'transparent',
                    color: ajustes.mode === m.valor ? COR.ouro : 'var(--color-secundario)',
                  }}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, paddingTop: 8, flexWrap: 'wrap' }}>
              {PRESETS_DE_FABRICA.map((p) => (
                <BotaoSecundario key={p.chave} altura={28} onClick={() => aplicarPreset(p.valores)}>
                  {p.nome}
                </BotaoSecundario>
              ))}
              <BotaoSecundario altura={28} onClick={() => setAjustes(AJUSTES_PADRAO)}>
                Restaurar padrão
              </BotaoSecundario>
            </div>
          </Grupo>

          {ajustes.mode === 'default' && (
            <>
              <Grupo titulo="Frasco principal">
                <Faixa rotulo="Escala do perfume" v={ajustes.perfumeScale} min={0.55} max={1.35} passo={0.01} aoMudar={(v) => mudar('perfumeScale', v)} />
                <Faixa rotulo="Horizontal do perfume" v={ajustes.perfumeX} min={-220} max={220} aoMudar={(v) => mudar('perfumeX', v)} />
                <Faixa rotulo="Vertical do perfume" v={ajustes.perfumeY} min={-180} max={180} aoMudar={(v) => mudar('perfumeY', v)} />
              </Grupo>
              <Grupo titulo="Decant no cartão">
                <Faixa rotulo="Escala do decant" v={ajustes.decantScale} min={0.65} max={1.35} passo={0.01} aoMudar={(v) => mudar('decantScale', v)} />
                <Faixa rotulo="Horizontal do decant" v={ajustes.decantX} min={-180} max={180} aoMudar={(v) => mudar('decantX', v)} />
                <Faixa rotulo="Vertical do decant" v={ajustes.decantY} min={-180} max={180} aoMudar={(v) => mudar('decantY', v)} />
              </Grupo>
              <Grupo titulo="Seta e selo">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Marcar rotulo="Seta" valor={ajustes.showArrow} aoMudar={(v) => mudar('showArrow', v)} />
                  <select value={ajustes.arrowType} onChange={(e) => mudar('arrowType', e.target.value)} style={campo}>
                    {TIPOS_DE_SETA.map(([v, r]) => (
                      <option key={v} value={v}>{r}</option>
                    ))}
                  </select>
                  <select
                    value={ajustes.arrowColor}
                    onChange={(e) => mudar('arrowColor', e.target.value as 'gold' | 'black')}
                    style={campo}
                  >
                    <option value="gold">Dourada</option>
                    <option value="black">Preta</option>
                  </select>
                </div>
                <Faixa rotulo="Altura da seta" v={ajustes.arrowY} min={-140} max={140} aoMudar={(v) => mudar('arrowY', v)} />
                <Faixa rotulo="Escala da seta" v={ajustes.arrowScale} min={0.6} max={1.8} passo={0.01} aoMudar={(v) => mudar('arrowScale', v)} />
                <div style={{ paddingTop: 4 }}>
                  <Marcar rotulo="Selo 100% original" valor={ajustes.showBadge} aoMudar={(v) => mudar('showBadge', v)} />
                </div>
                {ajustes.showBadge && (
                  <Faixa rotulo="Tamanho do selo" v={ajustes.badgeScale} min={0.5} max={1.8} passo={0.01} aoMudar={(v) => mudar('badgeScale', v)} />
                )}
              </Grupo>
            </>
          )}

          {ajustes.mode === 'hover' && (
            <>
              <Grupo titulo="Fundo e frasco">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Rotulo>Cor do fundo</Rotulo>
                  <input
                    type="color"
                    value={ajustes.hoverBgColor}
                    onChange={(e) => mudar('hoverBgColor', e.target.value)}
                    style={{ width: 44, height: 30, border: 0, background: 'none', cursor: 'pointer' }}
                  />
                </div>
                <Faixa rotulo="Escala do perfume" v={ajustes.hoverPerfumeScale} min={0.7} max={1.4} passo={0.01} aoMudar={(v) => mudar('hoverPerfumeScale', v)} />
                <Faixa rotulo="Horizontal do perfume" v={ajustes.hoverPerfumeX} min={-180} max={180} aoMudar={(v) => mudar('hoverPerfumeX', v)} />
                <Faixa rotulo="Vertical do perfume" v={ajustes.hoverPerfumeY} min={-180} max={180} aoMudar={(v) => mudar('hoverPerfumeY', v)} />
                <Faixa rotulo="Opacidade do perfume" v={ajustes.hoverBottleOpacity} min={0.2} max={1} passo={0.01} aoMudar={(v) => mudar('hoverBottleOpacity', v)} />
              </Grupo>
              <Grupo titulo="Círculo do decant">
                <Faixa rotulo="Tamanho do círculo" v={ajustes.hoverCircleSize} min={220} max={420} aoMudar={(v) => mudar('hoverCircleSize', v)} />
                <Faixa rotulo="Escala do decant" v={ajustes.hoverDecantScale} min={0.8} max={1.9} passo={0.01} aoMudar={(v) => mudar('hoverDecantScale', v)} />
                <Faixa rotulo="Decant no eixo X" v={ajustes.hoverDecantOffsetX} min={-120} max={120} aoMudar={(v) => mudar('hoverDecantOffsetX', v)} />
                <Faixa rotulo="Decant no eixo Y" v={ajustes.hoverDecantOffsetY} min={-180} max={120} aoMudar={(v) => mudar('hoverDecantOffsetY', v)} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
                  <Marcar rotulo="Texto sob o círculo" valor={ajustes.showHoverLabel} aoMudar={(v) => mudar('showHoverLabel', v)} />
                  <input
                    value={ajustes.hoverLabel}
                    onChange={(e) => mudar('hoverLabel', e.target.value)}
                    style={{ ...campo, width: 140 }}
                  />
                </div>
                {ajustes.showHoverLabel && (
                  <Faixa rotulo="Tamanho do texto" v={ajustes.hoverLabelSize} min={24} max={72} aoMudar={(v) => mudar('hoverLabelSize', v)} />
                )}
              </Grupo>
            </>
          )}

          {ajustes.mode === 'luxury' && (
            <>
              <Grupo titulo="Frasco principal">
                <Faixa rotulo="Escala do perfume" v={ajustes.luxuryPerfumeScale} min={0.75} max={1.2} passo={0.01} aoMudar={(v) => mudar('luxuryPerfumeScale', v)} />
                <Faixa rotulo="Horizontal do perfume" v={ajustes.luxuryPerfumeX} min={-220} max={220} aoMudar={(v) => mudar('luxuryPerfumeX', v)} />
                <Faixa rotulo="Vertical do perfume" v={ajustes.luxuryPerfumeY} min={-180} max={220} aoMudar={(v) => mudar('luxuryPerfumeY', v)} />
              </Grupo>
              <Grupo titulo="Círculo do decant">
                <Faixa rotulo="Tamanho do círculo" v={ajustes.luxuryCircleSize} min={220} max={360} aoMudar={(v) => mudar('luxuryCircleSize', v)} />
                <Faixa rotulo="Escala do decant" v={ajustes.luxuryDecantScale} min={0.65} max={1.2} passo={0.01} aoMudar={(v) => mudar('luxuryDecantScale', v)} />
                <Faixa rotulo="Decant no eixo X" v={ajustes.luxuryDecantOffsetX} min={-80} max={80} aoMudar={(v) => mudar('luxuryDecantOffsetX', v)} />
                <Faixa rotulo="Decant no eixo Y" v={ajustes.luxuryDecantOffsetY} min={-40} max={120} aoMudar={(v) => mudar('luxuryDecantOffsetY', v)} />
              </Grupo>
              <Grupo titulo="Indicador e etiqueta">
                <select value={ajustes.luxuryArrowType} onChange={(e) => mudar('luxuryArrowType', e.target.value)} style={campo}>
                  {TIPOS_DE_INDICADOR.map(([v, r]) => (
                    <option key={v} value={v}>{r}</option>
                  ))}
                </select>
                <Faixa rotulo="Curvatura do indicador" v={ajustes.luxuryArrowLift} min={40} max={220} aoMudar={(v) => mudar('luxuryArrowLift', v)} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 }}>
                  <Marcar rotulo="Etiqueta do decant" valor={ajustes.luxuryShowLabel} aoMudar={(v) => mudar('luxuryShowLabel', v)} />
                  <input
                    value={ajustes.luxuryLabelText}
                    onChange={(e) => mudar('luxuryLabelText', e.target.value)}
                    style={{ ...campo, width: 140 }}
                  />
                </div>
                {ajustes.luxuryShowLabel && (
                  <Faixa rotulo="Tamanho da etiqueta" v={ajustes.luxuryLabelSize} min={16} max={30} aoMudar={(v) => mudar('luxuryLabelSize', v)} />
                )}
              </Grupo>
            </>
          )}

          <Grupo titulo="Meus presets">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {presets.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--color-terciario)' }}>
                  Nenhum preset salvo ainda — ajuste a cena e salve com um nome.
                </span>
              )}
              {presets.map((p) => (
                <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <BotaoSecundario altura={28} onClick={() => aplicarPreset(p.valores as Partial<Ajustes>)}>
                    {p.nome}
                  </BotaoSecundario>
                  <button
                    type="button"
                    title={`Excluir "${p.nome}"`}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await excluirPreset(p.id)
                        if (!r.ok) setErro(r.erro)
                      })
                    }
                    style={{ background: 'none', border: 0, color: 'var(--color-terciario)', cursor: 'pointer', fontSize: 13 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <input
                value={nomePreset}
                onChange={(e) => setNomePreset(e.target.value)}
                placeholder="nome do preset"
                style={{ ...campo, flex: 1 }}
              />
              <BotaoOuro
                altura={32}
                desabilitado={pendente || !nomePreset.trim()}
                onClick={() =>
                  iniciar(async () => {
                    setErro(null)
                    const r = await salvarPreset(nomePreset, ajustes as unknown as Record<string, unknown>)
                    if (!r.ok) setErro(r.erro)
                    else {
                      setNomePreset('')
                      setAviso('Preset salvo.')
                      setTimeout(() => setAviso(null), 2500)
                    }
                  })
                }
              >
                Salvar preset
              </BotaoOuro>
            </div>
            {aviso && <div style={{ fontSize: 12, color: COR.ok, paddingTop: 6 }}>{aviso}</div>}
          </Grupo>

          <Grupo titulo="Exportação em lote">
            <div style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Envie várias fotos cruas; cada uma sai nos presets marcados, num ZIP organizado por pasta.
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: '1px dashed rgba(255,255,255,.2)',
                borderRadius: 8,
                padding: '10px 14px',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--color-secundario)',
                marginTop: 8,
              }}
            >
              <input type="file" accept="image/*" multiple onChange={aoAdicionarAoLote} style={{ display: 'none' }} />
              Adicionar fotos ao lote
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
              {PRESETS_DE_FABRICA.map((p) => (
                <Marcar
                  key={p.chave}
                  rotulo={p.nome}
                  valor={Boolean(presetsDoLote[p.chave])}
                  aoMudar={(v) => setPresetsDoLote((s) => ({ ...s, [p.chave]: v }))}
                />
              ))}
              {presets.map((p) => (
                <Marcar
                  key={p.id}
                  rotulo={p.nome}
                  valor={Boolean(presetsSalvosNoLote[p.id])}
                  aoMudar={(v) => setPresetsSalvosNoLote((s) => ({ ...s, [p.id]: v }))}
                />
              ))}
            </div>
            {lote.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 8 }}>
                {lote.map((item) => (
                  <div key={item.id} style={{ fontSize: 11.5, color: 'var(--color-secundario)' }}>
                    {item.estado === 'concluída' ? '✓' : item.estado === 'processando' ? '…' : '·'} {item.nome}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 10 }}>
              <BotaoOuro
                altura={32}
                desabilitado={!lote.length || exportandoLote}
                onClick={() => void exportarLote()}
              >
                {exportandoLote ? 'Gerando…' : 'Exportar lote em ZIP'}
              </BotaoOuro>
              {lote.length > 0 && !exportandoLote && (
                <BotaoSecundario altura={32} onClick={() => setLote([])}>
                  Limpar lote
                </BotaoSecundario>
              )}
            </div>
            {statusDoLote && (
              <div style={{ fontSize: 12, color: 'var(--color-secundario)', paddingTop: 6 }}>{statusDoLote}</div>
            )}
          </Grupo>
        </div>
      </div>
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 12,
        padding: '14px 16px',
        background: 'rgba(255,255,255,.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <Rotulo>{titulo}</Rotulo>
      {children}
    </div>
  )
}

function Faixa({
  rotulo,
  v,
  min,
  max,
  passo = 1,
  aoMudar,
}: {
  rotulo: string
  v: number
  min: number
  max: number
  passo?: number
  aoMudar: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
        {rotulo}: <span className="font-mono">{passo < 1 ? v.toFixed(2) : Math.round(v)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={v}
        onChange={(e) => aoMudar(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#D4AF6A' }}
      />
    </label>
  )
}

function Marcar({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string
  valor: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-secundario)', cursor: 'pointer' }}>
      <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} style={{ accentColor: '#D4AF6A' }} />
      {rotulo}
    </label>
  )
}

const campo = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12,
  outline: 0,
} as const
