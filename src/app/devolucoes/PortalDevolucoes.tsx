'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'

import {
  BlocoAviso,
  BotaoPrimario,
  BotaoSecundario,
  Corpo,
  PORTAL,
  RotuloCampo,
  TituloPasso,
} from '@/components/portal/primitivos'
import {
  MOTIVOS,
  PRAZO_DEVOLUCAO_DIAS,
  brl,
  descreveVariante,
  ehDanificado,
  fotosCompletas,
  plural,
  statusDevolucao,
} from '@/domain'
import type { MotivoDevolucao, PedidoPortal } from '@/domain'

import { abrirDevolucao, buscarPedidos } from './actions'

/**
 * Portal de devoluções — a vitrine da marca no pior momento da compra.
 *
 * Direção de arte: luxo editorial. Sério nos títulos (Cormorant), generoso no
 * respiro, dourado SÓ onde há ação ou estado — o resto é creme e tinta. As
 * fotos agora sobem de verdade: o cliente anexa, o arquivo vai para o bucket
 * e a triagem do ERP as vê sem pedir nada por WhatsApp.
 */

const PASSOS = ['Acesso', 'Pedidos', 'Itens', 'Motivo', 'Fotos', 'Pronto'] as const

type Metodo = 'email' | 'cpf'

/** Telefone do cadastro no formato do wa.me: só dígitos, com o DDI 55. */
function paraWaMe(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')
  return digitos.startsWith('55') ? digitos : `55${digitos}`
}

/** dd/MM legível — o timestamptz cru do banco não é coisa de mostrar a cliente. */
function dataPt(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const SOMBRA_CARTAO = '0 1px 2px rgba(36,31,24,.05), 0 14px 34px -16px rgba(36,31,24,.22)'

export function PortalDevolucoes({
  contato,
}: {
  /** Contato do cadastro da empresa. Vazio = a linha não aparece. */
  contato: { telefone: string; email: string }
}) {
  const [passo, setPasso] = useState(1)
  const [metodo, setMetodo] = useState<Metodo>('email')
  const [ident, setIdent] = useState('')
  const [pedidos, setPedidos] = useState<PedidoPortal[]>([])
  const [buscando, iniciarBusca] = useTransition()
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [itens, setItens] = useState<string[]>([])
  const [motivo, setMotivo] = useState<MotivoDevolucao | ''>('')
  const [comentario, setComentario] = useState('')
  const [arquivos, setArquivos] = useState<{ nivel: File | null; lacre: File | null }>({
    nivel: null,
    lacre: null,
  })
  const [protocolo, setProtocolo] = useState<string | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [enviando, iniciarEnvio] = useTransition()

  const pedido = pedidos.find((p) => p.id === pedidoId) ?? null
  const chaveItem = (idx: number) => `${pedidoId}-${idx}`

  const selecionados = pedido
    ? pedido.itens.filter((_, idx) => itens.includes(chaveItem(idx)))
    : []
  const total = selecionados.reduce((a, i) => a + i.preco, 0)

  const danificado = ehDanificado(motivo)
  const fotosOk = fotosCompletas(motivo, {
    nivel: Boolean(arquivos.nivel),
    lacre: Boolean(arquivos.lacre),
  })

  const voltar = () => setPasso((p) => Math.max(1, p - 1))

  // Cada passo começa do topo: avançar depois de uma lista longa no celular
  // deixava o passo novo aberto no meio da rolagem.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [passo])

  const buscar = () => {
    iniciarBusca(async () => {
      const encontrados = await buscarPedidos(metodo, ident)
      setPedidos(encontrados)
      setItens([])
      setPedidoId(null)
      setPasso(2)
    })
  }

  const recomecar = () => {
    setPasso(1)
    setPedidos([])
    setPedidoId(null)
    setItens([])
    setMotivo('')
    setComentario('')
    setArquivos({ nivel: null, lacre: null })
  }

  const enviar = () => {
    if (!fotosOk || !pedido || enviando) return
    setErroEnvio(null)
    const form = new FormData()
    form.set('pedidoId', pedido.id)
    form.set('motivo', motivo)
    form.set('comentario', comentario)
    for (const i of selecionados) form.append('item', `${i.perfume} · ${i.variante} ml`)
    if (arquivos.nivel) form.set('fotoNivel', arquivos.nivel)
    if (arquivos.lacre) form.set('fotoLacre', arquivos.lacre)
    iniciarEnvio(async () => {
      const r = await abrirDevolucao(form)
      // Só avança quando a solicitação existe do outro lado. Mostrar
      // "enviada" e não ter registrado nada é o erro que o cliente só
      // descobre quando cobra uma resposta.
      if (!r.ok) {
        setErroEnvio(r.erro)
        return
      }
      setProtocolo(r.protocolo)
      setPasso(6)
    })
  }

  return (
    <div
      className="portal"
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 0 40px',
        // O brilho dourado no alto é a única licença decorativa da página —
        // dá profundidade ao creme sem competir com o conteúdo.
        background: `radial-gradient(1100px 480px at 50% -12%, rgba(176,141,75,.16), transparent 70%), ${PORTAL.fundo}`,
        color: PORTAL.tinta,
      }}
    >
      <div
        className="portal-coluna"
        style={{
          width: '100%',
          maxWidth: 430,
          background: PORTAL.coluna,
          minHeight: '100vh',
          boxShadow: 'var(--shadow-coluna)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          className="portal-header"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: `radial-gradient(640px 190px at 50% -40%, rgba(239,209,140,.16), transparent 75%), ${PORTAL.header}`,
            padding: '22px 22px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image
              src="/assets/frenesi-logo.png"
              alt="FRENESI"
              // Tamanho real do arquivo; o CSS abaixo escala proporcionalmente.
              width={3791}
              height={795}
              priority
              style={{ width: 122, height: 'auto', display: 'block' }}
            />
            <div style={{ flex: 1 }} />
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9,
                lineHeight: 1,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: 'rgba(239,209,140,.72)',
              }}
            >
              Central de devoluções
            </span>
          </div>

          <Etapas passo={passo} />
        </header>

        {passo === 1 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
              <h1
                className="font-display"
                style={{
                  margin: 0,
                  fontWeight: 600,
                  fontSize: 31,
                  lineHeight: 1.12,
                  letterSpacing: '.005em',
                  textWrap: 'balance',
                }}
              >
                Solicite sua devolução
              </h1>
              <Corpo>
                Sem burocracia: localize a compra, conte o que houve e acompanhe pelo protocolo.
                Para começar, informe o e-mail ou o CPF usado no pedido.
              </Corpo>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: '18px 18px 20px',
                background: PORTAL.card,
                border: '1px solid rgba(36,31,24,.08)',
                borderRadius: 16,
                boxShadow: SOMBRA_CARTAO,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: 4,
                  background: 'rgba(36,31,24,.05)',
                  borderRadius: 11,
                }}
              >
                {(['email', 'cpf'] as Metodo[]).map((m) => {
                  const ativo = metodo === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMetodo(m)
                        setIdent('')
                      }}
                      className="font-sans"
                      style={{
                        flex: 1,
                        height: 38,
                        border: 0,
                        background: ativo ? PORTAL.card : 'transparent',
                        color: ativo ? PORTAL.tinta : PORTAL.terciario,
                        fontWeight: 600,
                        fontSize: 12.5,
                        borderRadius: 8,
                        cursor: 'pointer',
                        boxShadow: ativo ? '0 1px 4px rgba(36,31,24,.12)' : 'none',
                        transition: 'background .15s ease',
                      }}
                    >
                      {m === 'email' ? 'E-mail' : 'CPF'}
                    </button>
                  )
                })}
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <RotuloCampo>{metodo === 'email' ? 'E-mail da compra' : 'CPF do titular'}</RotuloCampo>
                <input
                  value={ident}
                  onChange={(e) => setIdent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ident.trim() && !buscando) buscar()
                  }}
                  inputMode={metodo === 'cpf' ? 'numeric' : 'email'}
                  placeholder={metodo === 'email' ? 'seu@email.com' : '000.000.000-00'}
                  className="font-sans focus:border-[#B08D4B]"
                  style={{
                    height: 52,
                    padding: '0 15px',
                    border: `1px solid rgba(36,31,24,.14)`,
                    background: PORTAL.coluna,
                    color: PORTAL.tinta,
                    fontWeight: 500,
                    fontSize: 15,
                    borderRadius: 11,
                    outline: 0,
                    transition: 'border-color .15s ease',
                  }}
                />
              </label>

              <BotaoPrimario
                ativo={ident.trim().length > 0 && !buscando}
                onClick={buscar}
                style={{ height: 52, fontSize: 14 }}
              >
                {buscando ? 'Localizando…' : 'Localizar meus pedidos'}
              </BotaoPrimario>
            </div>

            <BlocoAviso
              titulo="Antes de começar"
              itens={[
                `Você tem ${PRAZO_DEVOLUCAO_DIAS} dias corridos após a entrega para pedir a devolução.`,
                'O decant precisa estar com o lacre (recrave) intacto e sem uso aparente.',
                'Vamos pedir duas fotos: o nível do líquido no frasco e o lacre.',
              ]}
            />
          </Passo>
        )}

        {passo === 2 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TituloPasso>
                {/* Três títulos distintos: não achamos nada, achamos mas nada
                    elegível, ou tudo certo. Confundir os dois primeiros faria o
                    cliente achar que a compra dele sumiu. */}
                {pedidos.length === 0
                  ? 'Não encontramos pedidos'
                  : pedidos.some((p) => statusDevolucao(p.diasDesdeEntrega).elegivel)
                    ? 'Escolha o pedido'
                    : 'Nenhum pedido elegível agora'}
              </TituloPasso>
              <Corpo>
                {pedidos.length === 0
                  ? `Nenhuma compra encontrada para ${metodo === 'email' ? 'esse e-mail' : 'esse CPF'}. Confira o dado ou tente pelo ${metodo === 'email' ? 'CPF' : 'e-mail'} da compra.`
                  : `O prazo de ${PRAZO_DEVOLUCAO_DIAS} dias começa a contar quando o pedido é marcado como entregue.`}
              </Corpo>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pedidos.map((p) => (
                <CartaoPedido
                  key={p.id}
                  pedido={p}
                  selecionado={p.id === pedidoId}
                  aoEscolher={() => {
                    setPedidoId(p.id)
                    setItens([])
                    setPasso(3)
                  }}
                />
              ))}
            </div>

            <BotaoSecundario onClick={voltar} style={{ height: 48 }}>
              Usar outro e-mail ou CPF
            </BotaoSecundario>
          </Passo>
        )}

        {passo === 3 && pedido && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <RotuloCampo>
                {(() => {
                  const entrega = dataPt(pedido.entregueEm)
                  return entrega ? `Pedido ${pedido.id} · entregue em ${entrega}` : `Pedido ${pedido.id}`
                })()}
              </RotuloCampo>
              <TituloPasso>Quais itens você quer devolver?</TituloPasso>
              <Corpo>Marque os itens que deseja devolver.</Corpo>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pedido.itens.map((item, idx) => {
                const chave = chaveItem(idx)
                const ativo = itens.includes(chave)
                return (
                  <button
                    key={chave}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() =>
                      setItens((s) =>
                        s.includes(chave) ? s.filter((x) => x !== chave) : [...s, chave],
                      )
                    }
                    className="hover:-translate-y-px"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 13,
                      padding: '12px 14px',
                      border: `1px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.09)'}`,
                      background: ativo ? 'rgba(176,141,75,.07)' : PORTAL.card,
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxShadow: ativo ? '0 0 0 3px rgba(176,141,75,.12)' : SOMBRA_CARTAO,
                      transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
                    }}
                  >
                    <span
                      aria-hidden
                      className="font-sans"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        border: `1.5px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.22)'}`,
                        background: ativo ? PORTAL.ouro : 'transparent',
                        color: PORTAL.coluna,
                        fontWeight: 700,
                        fontSize: 12,
                        lineHeight: '19px',
                        textAlign: 'center',
                        flex: 'none',
                        transition: 'background .15s ease',
                      }}
                    >
                      {ativo ? '✓' : ''}
                    </span>
                    <Miniatura url={item.imagem} legenda={item.perfume} />
                    <span
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
                    >
                      <span
                        className="font-sans"
                        style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, textWrap: 'pretty' }}
                      >
                        {item.perfume}
                      </span>
                      {item.marca && (
                        <span
                          className="font-sans"
                          style={{
                            fontSize: 10,
                            lineHeight: 1.25,
                            letterSpacing: '.06em',
                            textTransform: 'uppercase',
                            color: 'rgba(176,141,75,.85)',
                          }}
                        >
                          {item.marca}
                        </span>
                      )}
                      {/* O frasco vem da regra de fracionamento, não do texto do pedido. */}
                      <span
                        className="font-sans"
                        style={{ fontSize: 11.5, lineHeight: 1.35, color: 'rgba(36,31,24,.52)' }}
                      >
                        {descreveVariante(item.variante)}
                      </span>
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontWeight: 500, fontSize: 13, color: PORTAL.link, whiteSpace: 'nowrap' }}
                    >
                      {brl(item.preco)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(36,31,24,.04)',
              }}
            >
              <span
                className="font-sans"
                style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: PORTAL.secundario }}
              >
                {selecionados.length
                  ? plural(selecionados.length, 'item selecionado', 'itens selecionados')
                  : 'Nenhum item selecionado ainda'}
              </span>
              <span
                className="font-mono"
                style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}
              >
                {brl(total)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 9 }}>
              <BotaoSecundario onClick={voltar}>Outro pedido</BotaoSecundario>
              <BotaoPrimario
                ativo={selecionados.length > 0}
                onClick={() => setPasso(4)}
                style={{ flex: 1 }}
              >
                Continuar
              </BotaoPrimario>
            </div>
          </Passo>
        )}

        {passo === 4 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TituloPasso>Motivo da devolução</TituloPasso>
              <Corpo>Escolha o motivo que melhor descreve o caso — é ele que orienta a análise.</Corpo>
            </div>

            <div role="radiogroup" aria-label="Motivo da devolução" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {MOTIVOS.map((m) => {
                const ativo = motivo === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setMotivo(m.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '14px 15px',
                      border: `1px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.09)'}`,
                      background: ativo ? 'rgba(176,141,75,.07)' : PORTAL.card,
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxShadow: ativo ? '0 0 0 3px rgba(176,141,75,.12)' : SOMBRA_CARTAO,
                      transition: 'box-shadow .15s ease, border-color .15s ease',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `1.5px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.24)'}`,
                        background: ativo
                          ? `radial-gradient(circle at center, ${PORTAL.ouro} 45%, transparent 52%)`
                          : 'transparent',
                        flex: 'none',
                        marginTop: 1,
                        transition: 'border-color .15s ease',
                      }}
                    />
                    <span
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
                    >
                      <span
                        className="font-sans"
                        style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, textWrap: 'pretty' }}
                      >
                        {m.label}
                      </span>
                      <span
                        className="font-sans"
                        style={{
                          fontSize: 11.5,
                          lineHeight: 1.45,
                          color: 'rgba(36,31,24,.52)',
                          textWrap: 'pretty',
                        }}
                      >
                        {m.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RotuloCampo>Conte com suas palavras</RotuloCampo>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Opcional, mas ajuda a agilizar a análise"
                className="font-sans focus:border-[#B08D4B]"
                style={{
                  minHeight: 88,
                  padding: '13px 14px',
                  border: `1px solid rgba(36,31,24,.14)`,
                  background: PORTAL.card,
                  color: PORTAL.tinta,
                  fontSize: 13,
                  lineHeight: 1.6,
                  borderRadius: 12,
                  outline: 0,
                  resize: 'vertical',
                }}
              />
            </label>

            <div style={{ display: 'flex', gap: 9 }}>
              <BotaoSecundario onClick={voltar}>Voltar</BotaoSecundario>
              <BotaoPrimario ativo={Boolean(motivo)} onClick={() => setPasso(5)} style={{ flex: 1 }}>
                Continuar
              </BotaoPrimario>
            </div>
          </Passo>
        )}

        {passo === 5 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TituloPasso>Fotos do produto</TituloPasso>
              {/* A cópia é derivada da mesma regra que valida o passo. */}
              <Corpo>
                {danificado
                  ? 'Como o frasco chegou com defeito, só a foto do nível é obrigatória. A do dano acelera a análise.'
                  : 'Precisamos ver que o decant não foi usado. As duas fotos são obrigatórias.'}
              </Corpo>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <UploadFoto
                marca="1"
                titulo="Nível do líquido no frasco"
                descricao="Contra a luz, mostrando quanto perfume tem dentro do frasco."
                obrigatoria
                arquivo={arquivos.nivel}
                aoEscolher={(f) => setArquivos((s) => ({ ...s, nivel: f }))}
              />
              <UploadFoto
                marca="2"
                titulo={danificado ? 'Frasco danificado' : 'Lacre (recrave) do decant'}
                descricao={
                  danificado
                    ? 'Mostre o vazamento ou a parte danificada. Como o frasco chegou com defeito, não exigimos o lacre intacto.'
                    : 'De perto, mostrando o recrave sem sinais de abertura.'
                }
                obrigatoria={!danificado}
                arquivo={arquivos.lacre}
                aoEscolher={(f) => setArquivos((s) => ({ ...s, lacre: f }))}
              />
            </div>

            {/* Sem menção ao critério interno dos 10% — ele nunca aparece ao cliente. */}
            <BlocoAviso
              titulo="O que não é aceito"
              tom="erro"
              itens={[
                'Decant nitidamente usado.',
                'Lacre rompido, remontado ou frasco trocado.',
                'Fotos escuras, tremidas ou que não mostrem o frasco por inteiro.',
              ]}
            />

            {erroEnvio && (
              <Corpo>
                <span style={{ color: '#9b3d3d' }}>{erroEnvio}</span>
              </Corpo>
            )}

            <div style={{ display: 'flex', gap: 9 }}>
              <BotaoSecundario onClick={voltar}>Voltar</BotaoSecundario>
              <BotaoPrimario ativo={fotosOk && !enviando} onClick={enviar} style={{ flex: 1 }}>
                {enviando ? 'Enviando fotos…' : 'Enviar solicitação'}
              </BotaoPrimario>
            </div>
          </Passo>
        )}

        {passo === 6 && pedido && (
          <Passo padding="32px 22px 30px">
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 14,
                textAlign: 'center',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 54,
                  height: 54,
                  border: `1px solid rgba(176,141,75,.5)`,
                  background: 'rgba(176,141,75,.06)',
                  transform: 'rotate(45deg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="font-sans"
                  style={{ transform: 'rotate(-45deg)', fontSize: 20, color: PORTAL.link }}
                >
                  ✓
                </span>
              </span>
              <h1
                className="font-display"
                style={{ margin: 0, fontWeight: 600, fontSize: 26, lineHeight: 1.2 }}
              >
                Solicitação enviada
              </h1>
              <Corpo>
                {`Sua solicitação para o pedido ${pedido.id} foi registrada. Guarde o protocolo: é por ele que encontramos o seu caso.`}
              </Corpo>
              <CaixaProtocolo protocolo={protocolo ?? '—'} />
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '18px 18px 6px',
                borderRadius: 16,
                background: PORTAL.card,
                border: `1px solid rgba(36,31,24,.08)`,
                boxShadow: SOMBRA_CARTAO,
              }}
            >
              <span style={{ paddingBottom: 14 }}>
                <RotuloCampo>O que acontece agora</RotuloCampo>
              </span>
              {[
                {
                  marca: '✓',
                  feito: true,
                  titulo: 'Solicitação e fotos recebidas',
                  desc: 'Análise em até 1 dia útil',
                },
                {
                  marca: '2',
                  feito: false,
                  titulo: 'Avaliamos a sua solicitação',
                  desc: motivo
                    ? `Motivo informado: ${MOTIVOS.find((m) => m.id === motivo)!.label.toLowerCase()}`
                    : 'Conferência do produto',
                },
                {
                  marca: '3',
                  feito: false,
                  titulo: 'Você recebe o código de postagem',
                  // O reverso sai na mesma plataforma que emitiu a etiqueta de
                  // ida, e quem o entrega é o ATENDIMENTO — os e-mails
                  // automáticos ficam desligados até o sistema rodar 100%.
                  desc: `Nossa equipe entra em contato com o código e o passo a passo · postagem sem custo pela ${pedido.gateway}`,
                },
                {
                  marca: '4',
                  feito: false,
                  titulo: 'Reembolso após a chegada',
                  desc: `Estorno de ${brl(total)} em até 5 dias úteis depois da conferência`,
                },
              ].map((e) => (
                <span
                  key={e.titulo}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px minmax(0,1fr)',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      height: '100%',
                    }}
                  >
                    <span
                      className="font-sans"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        border: `1px solid ${e.feito ? 'rgba(63,122,82,.4)' : 'rgba(176,141,75,.4)'}`,
                        background: e.feito ? 'rgba(63,122,82,.1)' : 'transparent',
                        color: e.feito ? PORTAL.ok : PORTAL.tinta,
                        fontWeight: 600,
                        fontSize: 10,
                        lineHeight: '20px',
                        textAlign: 'center',
                        flex: 'none',
                      }}
                    >
                      {e.marca}
                    </span>
                    <span
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 12,
                        background: 'rgba(36,31,24,.12)',
                        display: 'block',
                      }}
                    />
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      paddingBottom: 16,
                      minWidth: 0,
                    }}
                  >
                    <span
                      className="font-sans"
                      style={{
                        fontWeight: 600,
                        fontSize: 12.5,
                        lineHeight: 1.35,
                        color: e.feito ? PORTAL.ok : PORTAL.tinta,
                        textWrap: 'pretty',
                      }}
                    >
                      {e.titulo}
                    </span>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: 'rgba(36,31,24,.55)',
                        textWrap: 'pretty',
                      }}
                    >
                      {e.desc}
                    </span>
                  </span>
                </span>
              ))}
            </div>

            <BlocoAviso titulo="Guarde o produto assim">
              <span
                className="font-sans"
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'rgba(36,31,24,.68)',
                  textWrap: 'pretty',
                }}
              >
                Deixe o decant na embalagem original com o lacre como está. Não abra nem
                transfira o conteúdo — isso invalida a devolução.
              </span>
            </BlocoAviso>

            <BotaoSecundario onClick={recomecar} style={{ height: 48 }}>
              Abrir outra devolução
            </BotaoSecundario>
          </Passo>
        )}

        <footer
          className="portal-rodape"
          style={{
            padding: '18px 22px 26px',
            borderTop: `1px solid rgba(36,31,24,.08)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {/* Contato real do cadastro da empresa, ou linha nenhuma — número
              inventado aqui mandaria cliente para o WhatsApp de um estranho. */}
          {contato.telefone ? (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(36,31,24,.45)', textWrap: 'pretty' }}
            >
              Dúvidas? Fale com a gente pelo WhatsApp{' '}
              <a href={`https://wa.me/${paraWaMe(contato.telefone)}`} style={{ color: PORTAL.link }}>
                {contato.telefone}
              </a>
            </span>
          ) : contato.email ? (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(36,31,24,.45)', textWrap: 'pretty' }}
            >
              Dúvidas? Fale com a gente:{' '}
              <a href={`mailto:${contato.email}`} style={{ color: PORTAL.link }}>
                {contato.email}
              </a>
            </span>
          ) : null}
          <span
            className="font-sans"
            style={{
              fontSize: 9.5,
              lineHeight: 1.5,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'rgba(36,31,24,.32)',
            }}
          >
            FRENESI Perfumes · devolucoes.frenesiperfumes.com.br
          </span>
        </footer>
      </div>
    </div>
  )
}

/**
 * A régua dos seis passos: círculos numerados unidos por um fio. O passo
 * vencido fecha em dourado, o atual acende, o futuro espera apagado — o
 * cliente sabe onde está sem ler manual.
 */
function Etapas({ passo }: { passo: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={PASSOS.length}
      aria-valuenow={passo}
      aria-label={`Passo ${passo} de ${PASSOS.length}: ${PASSOS[passo - 1]}`}
      style={{ display: 'flex', alignItems: 'flex-start', paddingBottom: 16 }}
    >
      {PASSOS.map((p, i) => {
        const feito = i + 1 < passo
        const atual = i + 1 === passo
        return (
          <span
            key={p}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              position: 'relative',
            }}
          >
            {/* O fio passa por trás dos círculos, de centro a centro. */}
            {i > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 11,
                  right: '50%',
                  width: '100%',
                  height: 1,
                  background: feito || atual ? 'rgba(239,209,140,.45)' : 'rgba(239,209,140,.14)',
                }}
              />
            )}
            <span
              className="font-sans"
              style={{
                position: 'relative',
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: `1px solid ${feito || atual ? 'rgba(239,209,140,.8)' : 'rgba(239,209,140,.25)'}`,
                background: feito ? PORTAL.ouroClaro : atual ? 'rgba(239,209,140,.14)' : PORTAL.header,
                color: feito ? '#1A150C' : atual ? PORTAL.ouroClaro : 'rgba(239,209,140,.45)',
                fontWeight: 700,
                fontSize: 10,
                lineHeight: '20px',
                textAlign: 'center',
                transition: 'background .2s ease, color .2s ease',
              }}
            >
              {feito ? '✓' : i + 1}
            </span>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 8.5,
                lineHeight: 1.2,
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                color: atual ? PORTAL.ouroClaro : feito ? 'rgba(239,209,140,.66)' : 'rgba(239,209,140,.35)',
                whiteSpace: 'nowrap',
              }}
            >
              {p}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** O protocolo em destaque, copiável num toque — é o número que o cliente
    vai precisar ditar para o atendimento. */
function CaixaProtocolo({ protocolo }: { protocolo: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(protocolo)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1800)
        } catch {
          // Sem clipboard (navegador antigo), o número continua legível.
        }
      }}
      title="Copiar protocolo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        margin: '4px auto 0',
        border: '1px solid rgba(176,141,75,.4)',
        background: 'rgba(176,141,75,.07)',
        borderRadius: 12,
        cursor: 'pointer',
      }}
    >
      <span
        className="font-mono"
        style={{ fontWeight: 700, fontSize: 19, letterSpacing: '.04em', color: PORTAL.link }}
      >
        {protocolo}
      </span>
      <span
        className="font-sans"
        style={{
          fontWeight: 600,
          fontSize: 10,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: copiado ? PORTAL.ok : 'rgba(36,31,24,.45)',
        }}
      >
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </span>
    </button>
  )
}

function Passo({
  children,
  padding = '26px 22px 32px',
}: {
  children: React.ReactNode
  padding?: string
}) {
  return (
    <div
      className="portal-passo animate-[pt-in_.26s_ease_both]"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding }}
    >
      {children}
    </div>
  )
}

/** Foto do produto vinda do catálogo; sem foto, o monograma segura o lugar. */
function Miniatura({ url, legenda }: { url?: string | null; legenda: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={legenda}
        style={{
          width: 62,
          height: 62,
          flex: 'none',
          borderRadius: 11,
          objectFit: 'cover',
          border: '1px solid rgba(36,31,24,.08)',
          background: PORTAL.coluna,
        }}
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={`Foto de ${legenda}`}
      className="font-display"
      style={{
        width: 62,
        height: 62,
        flex: 'none',
        borderRadius: 11,
        border: '1px solid rgba(176,141,75,.28)',
        background: 'linear-gradient(160deg, rgba(176,141,75,.1), rgba(176,141,75,.03))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 24,
        color: 'rgba(176,141,75,.75)',
      }}
    >
      F
    </span>
  )
}

function CartaoPedido({
  pedido,
  selecionado,
  aoEscolher,
}: {
  pedido: PedidoPortal
  selecionado: boolean
  aoEscolher: () => void
}) {
  // Elegibilidade e cópia saem da mesma função que o ERP usa. Exceção
  // honesta: pedido entregue cuja data de entrega o sistema não tem — não dá
  // para contar prazo do que não se sabe, e "aguardando entrega" seria
  // mentira. O caminho é o atendimento.
  const semData = pedido.situacao === 'entregue' && pedido.diasDesdeEntrega === null
  const s = semData
    ? {
        elegivel: false,
        estado: 'aguardando-entrega' as const,
        restam: 0,
        selo: 'Fale com a gente',
        mensagem: 'Não temos a data exata desta entrega — fale com o atendimento para abrir a devolução.',
      }
    : statusDevolucao(pedido.diasDesdeEntrega)
  const corPrazo = s.elegivel ? (s.restam <= 2 ? PORTAL.link : PORTAL.ok) : PORTAL.erro

  return (
    <button
      type="button"
      onClick={s.elegivel ? aoEscolher : undefined}
      disabled={!s.elegivel}
      aria-disabled={!s.elegivel}
      className={s.elegivel ? 'hover:-translate-y-px' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '15px 16px',
        border: `1px solid ${!s.elegivel ? 'rgba(36,31,24,.08)' : selecionado ? PORTAL.ouro : 'rgba(36,31,24,.09)'}`,
        background: !s.elegivel
          ? 'rgba(36,31,24,.03)'
          : selecionado
            ? 'rgba(176,141,75,.07)'
            : PORTAL.card,
        borderRadius: 15,
        cursor: s.elegivel ? 'pointer' : 'not-allowed',
        textAlign: 'left',
        boxShadow: s.elegivel ? SOMBRA_CARTAO : 'none',
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span
          className="font-mono"
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: s.elegivel ? PORTAL.tinta : 'rgba(36,31,24,.45)',
          }}
        >
          {pedido.id}
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: s.elegivel ? PORTAL.ok : PORTAL.erro,
            background: s.elegivel ? 'rgba(63,122,82,.12)' : 'rgba(168,58,48,.1)',
            borderRadius: 20,
            padding: '5px 9px',
            whiteSpace: 'nowrap',
          }}
        >
          {s.selo}
        </span>
      </span>

      <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.4, color: PORTAL.terciario }}>
          {(() => {
            const entrega = dataPt(pedido.entregueEm)
            const situacao = entrega
              ? `entregue em ${entrega}`
              : pedido.situacao === 'entregue'
                ? 'entregue'
                : 'em trânsito'
            return `comprado em ${pedido.data} · ${situacao}`
          })()}
        </span>
        <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.4, color: PORTAL.terciario }}>
          {plural(pedido.itens.length, 'item', 'itens')}
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="font-mono"
          style={{ fontWeight: 500, fontSize: 13, color: PORTAL.link, whiteSpace: 'nowrap' }}
        >
          {brl(pedido.valor)}
        </span>
      </span>

      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 10,
          borderTop: `1px solid rgba(36,31,24,.07)`,
          width: '100%',
        }}
      >
        <span
          aria-hidden
          style={{ width: 5, height: 5, borderRadius: '50%', background: corPrazo, flex: 'none' }}
        />
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.4, color: corPrazo, textWrap: 'pretty' }}
        >
          {s.mensagem}
        </span>
      </span>
    </button>
  )
}

/**
 * Upload de verdade: o cliente anexa o arquivo aqui e ele sobe junto com a
 * solicitação. A pré-visualização usa um object URL local, revogado quando o
 * arquivo troca — nada vai para a rede antes do "Enviar solicitação".
 */
function UploadFoto({
  marca,
  titulo,
  descricao,
  obrigatoria,
  arquivo,
  aoEscolher,
}: {
  marca: string
  titulo: string
  descricao: string
  obrigatoria: boolean
  arquivo: File | null
  aoEscolher: (arquivo: File | null) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!arquivo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(arquivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  const feita = Boolean(arquivo)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 16px',
        border: `1px ${feita ? 'solid rgba(63,122,82,.35)' : 'dashed rgba(36,31,24,.2)'}`,
        background: feita ? 'rgba(63,122,82,.05)' : PORTAL.card,
        borderRadius: 15,
        boxShadow: feita ? 'none' : SOMBRA_CARTAO,
        transition: 'border-color .15s ease, background .15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span
          aria-hidden
          className="font-sans"
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: feita ? PORTAL.ok : PORTAL.ouro,
            color: PORTAL.coluna,
            fontWeight: 700,
            fontSize: 11,
            lineHeight: '25px',
            textAlign: 'center',
            flex: 'none',
          }}
        >
          {feita ? '✓' : marca}
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="font-sans"
              style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, textWrap: 'pretty' }}
            >
              {titulo}
            </span>
            {/* Etiqueta derivada da regra, não fixa no markup. */}
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 10,
                lineHeight: 1,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: obrigatoria ? PORTAL.link : '#4A4238',
                background: obrigatoria ? 'rgba(176,141,75,.2)' : 'rgba(36,31,24,.08)',
                borderRadius: 20,
                padding: '5px 9px',
                whiteSpace: 'nowrap',
              }}
            >
              {obrigatoria ? 'Obrigatória' : 'Opcional'}
            </span>
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'rgba(36,31,24,.55)',
              textWrap: 'pretty',
            }}
          >
            {descricao}
          </span>
        </span>
      </div>

      {preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`Pré-visualização: ${titulo}`}
            style={{
              width: 84,
              height: 84,
              objectFit: 'cover',
              borderRadius: 11,
              border: '1px solid rgba(36,31,24,.1)',
            }}
          />
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(36,31,24,.55)', overflowWrap: 'anywhere' }}
          >
            {arquivo?.name}
          </span>
        </div>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          aoEscolher(f)
          // Permite escolher o MESMO arquivo de novo depois de remover.
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="font-sans"
          style={{
            flex: 1,
            height: 44,
            border: 0,
            background: feita ? 'rgba(63,122,82,.12)' : 'rgba(36,31,24,.06)',
            color: feita ? PORTAL.ok : PORTAL.tinta,
            fontWeight: 600,
            fontSize: 12.5,
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          {feita ? 'Trocar foto' : 'Tirar ou escolher foto'}
        </button>
        {feita && (
          <button
            type="button"
            onClick={() => aoEscolher(null)}
            className="font-sans"
            style={{
              height: 44,
              padding: '0 14px',
              border: '1px solid rgba(36,31,24,.14)',
              background: 'transparent',
              color: 'rgba(36,31,24,.6)',
              fontWeight: 600,
              fontSize: 12,
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            Remover
          </button>
        )}
      </div>
    </div>
  )
}
