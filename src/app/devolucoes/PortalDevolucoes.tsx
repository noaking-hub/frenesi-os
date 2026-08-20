'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Turnstile } from '@/components/Turnstile'
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
  PASSOS_DEVOLUCAO,
  PRAZO_DEVOLUCAO_DIAS,
  brl,
  descreveVariante,
  ehDanificado,
  plural,
  provasCompletas,
  statusDevolucao,
  videoObrigatorio,
} from '@/domain'
import type { MotivoDevolucao, PedidoPortal } from '@/domain'

import {
  abrirDevolucao,
  buscarPedidos,
  consultarDevolucao,
  prepararEnvioDeProvas,
  reenviarProvas,
} from './actions'
import type { AcompanhamentoDevolucao, CampoDeProva } from './actions'

/**
 * Portal de devoluções — a vitrine da marca no pior momento da compra.
 *
 * Direção de arte: luxo editorial. Sério nos títulos (Cormorant), generoso no
 * respiro, dourado SÓ onde há ação ou estado — o resto é creme e tinta. As
 * fotos agora sobem de verdade: o cliente anexa, o arquivo vai para o bucket
 * e a triagem do ERP as vê sem pedir nada por WhatsApp.
 */

const PASSOS = ['Acesso', 'Pedidos', 'Itens', 'Motivo', 'Fotos', 'Pronto'] as const

/**
 * Sobe um arquivo direto para o Storage, pela URL assinada.
 *
 * XHR e não fetch por um motivo só: `upload.onprogress`. Um vídeo de 40 MB em
 * rede de celular leva um minuto, e barra parada em "Enviando…" faz o cliente
 * fechar a aba achando que travou — e aí não há devolução nem prova.
 */
function subirDireto(url: string, arquivo: File, aoProgredir: (bytes: number) => void) {
  return new Promise<void>((resolve, reject) => {
    // Multipart com o campo vazio: é exatamente o que o SDK do Supabase manda
    // no navegador para uma URL assinada. Escrever à mão o caminho binário
    // funcionaria, mas divergir do cliente oficial em algo que só quebra em
    // produção não vale a economia de três linhas.
    const corpo = new FormData()
    corpo.append('cacheControl', '3600')
    corpo.append('', arquivo)

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.upload.onprogress = (e) => aoProgredir(e.loaded)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('rede'))
    xhr.onabort = () => reject(new Error('cancelado'))
    xhr.send(corpo)
  })
}

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
  // 'fluxo' é o assistente de abertura; 'acompanhar' é a consulta por
  // protocolo — o comprovante do reembolso mora lá.
  const [tela, setTela] = useState<'fluxo' | 'acompanhar'>('fluxo')
  const [protocoloConsulta, setProtocoloConsulta] = useState('')
  // Quando o acompanhamento vem de um cartão, o cliente JÁ se identificou no
  // passo 1: repetir o e-mail/CPF ali seria pedir duas vezes a mesma coisa.
  const [identConsulta, setIdentConsulta] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('email')
  const [ident, setIdent] = useState('')
  // Ficha do Turnstile e erro da busca. Sem chave configurada, o widget não
  // aparece e a ficha fica nula — o servidor deixa passar do mesmo jeito.
  const [fichaRobo, setFichaRobo] = useState<string | null>(null)
  const [rodadaRobo, setRodadaRobo] = useState(0)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState<PedidoPortal[]>([])
  const [buscando, iniciarBusca] = useTransition()
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [itens, setItens] = useState<string[]>([])
  const [motivo, setMotivo] = useState<MotivoDevolucao | ''>('')
  const [comentario, setComentario] = useState('')
  const [arquivos, setArquivos] = useState<Record<CampoDeProva, File | null>>({
    nivel: null,
    lacre: null,
    video: null,
  })
  const [protocolo, setProtocolo] = useState<string | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [enviando, iniciarEnvio] = useTransition()
  // Progresso do upload direto, 0..100. Vídeo em rede de celular demora, e
  // uma tela parada com "Enviando…" faz o cliente fechar a aba.
  const [progresso, setProgresso] = useState<number | null>(null)

  const pedido = pedidos.find((p) => p.id === pedidoId) ?? null
  const chaveItem = (idx: number) => `${pedidoId}-${idx}`

  const selecionados = pedido
    ? pedido.itens.filter((_, idx) => itens.includes(chaveItem(idx)))
    : []
  const total = selecionados.reduce((a, i) => a + i.preco, 0)

  const danificado = ehDanificado(motivo)
  const pedeVideo = videoObrigatorio(motivo)
  const fotosOk = provasCompletas(motivo, {
    nivel: Boolean(arquivos.nivel),
    lacre: Boolean(arquivos.lacre),
    video: Boolean(arquivos.video),
  })

  const voltar = () => setPasso((p) => Math.max(1, p - 1))

  // Cada passo começa do topo: avançar depois de uma lista longa no celular
  // deixava o passo novo aberto no meio da rolagem.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [passo, tela])

  const buscar = () => {
    setErroBusca(null)
    iniciarBusca(async () => {
      const r = await buscarPedidos(metodo, ident, fichaRobo)
      // Token do Turnstile é de uso único: gastar e não pedir outro deixaria a
      // segunda busca sem ficha, e ela seria recusada sem o cliente entender.
      setFichaRobo(null)
      setRodadaRobo((n) => n + 1)
      if (r.erro) {
        setErroBusca(r.erro)
        return
      }
      setPedidos(r.pedidos)
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
    setArquivos({ nivel: null, lacre: null, video: null })
  }

  const enviar = () => {
    if (!fotosOk || !pedido || enviando) return
    setErroEnvio(null)

    const aEnviar = (['nivel', 'lacre', 'video'] as CampoDeProva[])
      .map((campo) => ({ campo, arquivo: arquivos[campo] }))
      .filter((x): x is { campo: CampoDeProva; arquivo: File } => Boolean(x.arquivo))

    iniciarEnvio(async () => {
      // 1. O servidor assina os destinos. Ele confere o pedido antes de
      //    assinar — URL de upload não sai de graça para quem passar por aqui.
      const preparo = await prepararEnvioDeProvas(
        pedido.id,
        aEnviar.map(({ campo, arquivo }) => ({
          campo,
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })),
        ident,
      )
      if (!preparo.ok) {
        setErroEnvio(preparo.erro)
        return
      }

      // 2. Os bytes vão do celular DIRETO para o Storage. É o que permite
      //    vídeo: pela server action, nada acima de ~6 MB passaria.
      const totalBytes = aEnviar.reduce((a, x) => a + x.arquivo.size, 0)
      const enviados = new Map<CampoDeProva, number>()
      setProgresso(0)
      try {
        for (const destino of preparo.destinos) {
          const item = aEnviar.find((x) => x.campo === destino.campo)
          if (!item) continue
          await subirDireto(destino.url, item.arquivo, (bytes) => {
            enviados.set(destino.campo, bytes)
            const feito = [...enviados.values()].reduce((a, b) => a + b, 0)
            setProgresso(Math.min(99, Math.round((feito / totalBytes) * 100)))
          })
        }
      } catch {
        setProgresso(null)
        setErroEnvio(
          'O envio dos arquivos falhou no meio do caminho. Confira a conexão e tente de novo.',
        )
        return
      }
      setProgresso(100)

      // 3. Só então a solicitação nasce — com os caminhos, não com os bytes.
      const form = new FormData()
      form.set('pedidoId', pedido.id)
      // O e-mail/CPF do passo 1 vai junto: é ele que prova, do lado do
      // servidor, que este pedido é de quem está pedindo.
      form.set('identificacao', ident)
      form.set('motivo', motivo)
      form.set('comentario', comentario)
      form.set('rascunho', preparo.rascunho)
      for (const d of preparo.destinos) {
        form.set(
          d.campo === 'nivel' ? 'provaNivel' : d.campo === 'lacre' ? 'provaLacre' : 'provaVideo',
          d.caminho,
        )
      }
      for (const i of selecionados) {
        form.append('item', i.variante === null ? i.perfume : `${i.perfume} · ${i.variante} ml`)
      }

      const r = await abrirDevolucao(form)
      setProgresso(null)
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

          {tela === 'fluxo' && <Etapas passo={passo} />}
          {tela === 'acompanhar' && <div style={{ paddingBottom: 18 }} />}
        </header>

        {tela === 'acompanhar' && (
          <Acompanhar
            protocoloInicial={protocoloConsulta}
            identInicial={identConsulta}
            aoVoltar={() => setTela('fluxo')}
          />
        )}

        {tela === 'fluxo' && passo === 1 && (
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

              {/* Sem chave configurada não renderiza nada — e o servidor
                  também não exige ficha. Ligar a proteção é trocar variável
                  de ambiente, não mexer no código. */}
              <Turnstile acao="portal-devolucoes" tema="light" aoResolver={setFichaRobo} rodada={rodadaRobo} />

              {erroBusca ? (
                <BlocoAviso titulo="Não deu para consultar agora" tom="erro">
                  {erroBusca}
                </BlocoAviso>
              ) : null}

              <BotaoPrimario
                ativo={ident.trim().length > 0 && !buscando}
                onClick={buscar}
                style={{ height: 52, fontSize: 14 }}
              >
                {buscando ? 'Localizando…' : 'Localizar meus pedidos'}
              </BotaoPrimario>
            </div>

            <button
              type="button"
              onClick={() => setTela('acompanhar')}
              className="font-sans"
              style={{
                border: 0,
                background: 'transparent',
                color: PORTAL.link,
                fontWeight: 600,
                fontSize: 12.5,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                cursor: 'pointer',
                alignSelf: 'flex-start',
                padding: 0,
              }}
            >
              Já abriu uma devolução? Acompanhar pelo protocolo
            </button>

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

        {tela === 'fluxo' && passo === 2 && (
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
                    // Pedido com devolução aberta não recomeça o fluxo: leva
                    // direto ao acompanhamento dela, já identificado.
                    if (p.devolucaoAberta) {
                      setProtocoloConsulta(p.devolucaoAberta)
                      setIdentConsulta(ident)
                      setTela('acompanhar')
                      return
                    }
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

        {tela === 'fluxo' && passo === 3 && pedido && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <RotuloCampo>
                {(() => {
                  const entrega = dataPt(pedido.entregueEm)
                  return entrega ? `Pedido ${pedido.codigo} · entregue em ${entrega}` : `Pedido ${pedido.codigo}`
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
                      {/* O frasco vem da regra de fracionamento, não do texto
                          do pedido — e some quando o item não é fracionado,
                          como kit e vidro lacrado. */}
                      {item.variante !== null && (
                        <span
                          className="font-sans"
                          style={{ fontSize: 11.5, lineHeight: 1.35, color: 'rgba(36,31,24,.52)' }}
                        >
                          {descreveVariante(item.variante)}
                        </span>
                      )}
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

        {tela === 'fluxo' && passo === 4 && (
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

        {tela === 'fluxo' && passo === 5 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TituloPasso>{pedeVideo ? 'Fotos e vídeo do produto' : 'Fotos do produto'}</TituloPasso>
              {/* A cópia é derivada da mesma regra que valida o passo. */}
              <Corpo>
                {pedeVideo
                  ? 'Para casos de vazamento, pedimos duas fotos e um vídeo curto.'
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
                titulo={danificado ? 'Lacre (recrave) e o dano no frasco' : 'Lacre (recrave) do decant'}
                descricao={
                  danificado
                    ? 'De perto, mostrando o recrave e o ponto do vazamento ou da avaria.'
                    : 'De perto, mostrando o recrave sem sinais de abertura.'
                }
                obrigatoria
                arquivo={arquivos.lacre}
                aoEscolher={(f) => setArquivos((s) => ({ ...s, lacre: f }))}
              />
              {pedeVideo && (
                <UploadFoto
                  marca="3"
                  midia="video"
                  titulo="Vídeo do vazamento"
                  descricao="Um vídeo curto mostrando o vazamento e o lacre do frasco."
                  obrigatoria
                  arquivo={arquivos.video}
                  aoEscolher={(f) => setArquivos((s) => ({ ...s, video: f }))}
                />
              )}
            </div>

            {progresso !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 6,
                    background: 'rgba(36,31,24,.09)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${progresso}%`,
                      background: PORTAL.ouro,
                      borderRadius: 6,
                      transition: 'width .2s ease',
                    }}
                  />
                </div>
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(36,31,24,.55)' }}
                >
                  {progresso < 100
                    ? `Enviando arquivos… ${progresso}%. Não feche esta página.`
                    : 'Arquivos enviados. Registrando a solicitação…'}
                </span>
              </div>
            )}

            {/* Sem menção ao critério interno dos 10% — ele nunca aparece ao cliente. */}
            <BlocoAviso
              titulo="O que não é aceito"
              tom="erro"
              itens={[
                'Decant nitidamente usado.',
                'Lacre rompido, remontado ou frasco trocado.',
                'Fotos escuras, tremidas ou que não mostrem o frasco por inteiro.',
                ...(pedeVideo ? ['Vídeo que não mostre o vazamento e o lacre.'] : []),
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
                {enviando ? 'Enviando…' : 'Enviar solicitação'}
              </BotaoPrimario>
            </div>
          </Passo>
        )}

        {tela === 'fluxo' && passo === 6 && pedido && (
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
                {`Sua solicitação para o pedido ${pedido.codigo} foi registrada. Guarde o protocolo: é por ele que encontramos o seu caso.`}
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
                  // Nada de nome de fornecedor aqui: Frenet e Melhor Envio são
                  // assunto nosso. O cliente vai a uma agência dos Correios.
                  desc: 'Para levar a uma agência dos Correios · postagem sem custo',
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

            <BotaoPrimario
              onClick={() => {
                setProtocoloConsulta(protocolo ?? '')
                setIdentConsulta(ident)
                setTela('acompanhar')
              }}
              style={{ height: 48 }}
            >
              Acompanhar esta devolução
            </BotaoPrimario>
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
 * Acompanhamento por protocolo — a devolução vista pelo cliente.
 *
 * Dupla chave (protocolo + e-mail ou CPF): protocolo sozinho circula em
 * print; a identidade não. Aprovada, o código de postagem aparece aqui;
 * concluída com reembolso, o COMPROVANTE fica disponível para baixar.
 */
function Acompanhar({
  protocoloInicial,
  identInicial = '',
  aoVoltar,
}: {
  protocoloInicial: string
  /** Vem preenchida quando o cliente chegou por um cartão de pedido. */
  identInicial?: string
  aoVoltar: () => void
}) {
  const [protocolo, setProtocolo] = useState(protocoloInicial)
  const [ident, setIdent] = useState(identInicial)
  const [resultado, setResultado] = useState<AcompanhamentoDevolucao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [consultando, iniciar] = useTransition()

  const consultar = (protocoloAlvo = protocolo, identAlvo = ident) => {
    setErro(null)
    iniciar(async () => {
      const r = await consultarDevolucao(protocoloAlvo, identAlvo)
      if (!r.ok) {
        setResultado(null)
        setErro(r.erro)
        return
      }
      setResultado(r.devolucao)
    })
  }

  // Chegando por um cartão, os dois campos já vêm preenchidos: mostrar um
  // formulário cheio esperando um clique seria trabalho sem propósito.
  const jaConsultou = useRef(false)
  useEffect(() => {
    if (jaConsultou.current) return
    if (!protocoloInicial || !identInicial) return
    jaConsultou.current = true
    consultar(protocoloInicial, identInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocoloInicial, identInicial])

  const d = resultado

  return (
    <Passo>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
        <h1
          className="font-display"
          style={{ margin: 0, fontWeight: 600, fontSize: 28, lineHeight: 1.15, textWrap: 'balance' }}
        >
          Acompanhar devolução
        </h1>
        <Corpo>
          Informe o protocolo que enviamos por e-mail e o e-mail ou CPF usado na compra.
        </Corpo>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '18px 18px 20px',
          background: PORTAL.card,
          border: '1px solid rgba(36,31,24,.08)',
          borderRadius: 16,
          boxShadow: SOMBRA_CARTAO,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <RotuloCampo>Protocolo</RotuloCampo>
          <input
            value={protocolo}
            // Maiúsculas na digitação: o protocolo é maiúsculo por natureza
            // e o cliente que digita minúsculo não pode receber "não
            // encontrada" por causa disso.
            onChange={(e) => setProtocolo(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            className="font-mono focus:border-[#B08D4B]"
            style={{
              height: 48,
              padding: '0 15px',
              border: '1px solid rgba(36,31,24,.14)',
              background: PORTAL.coluna,
              color: PORTAL.tinta,
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: '.04em',
              borderRadius: 11,
              outline: 0,
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <RotuloCampo>E-mail ou CPF da compra</RotuloCampo>
          <input
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && protocolo.trim() && ident.trim() && !consultando) consultar()
            }}
            placeholder="seu@email.com"
            className="font-sans focus:border-[#B08D4B]"
            style={{
              height: 48,
              padding: '0 15px',
              border: '1px solid rgba(36,31,24,.14)',
              background: PORTAL.coluna,
              color: PORTAL.tinta,
              fontWeight: 500,
              fontSize: 14,
              borderRadius: 11,
              outline: 0,
            }}
          />
        </label>
        <BotaoPrimario
          ativo={protocolo.trim().length > 0 && ident.trim().length > 0 && !consultando}
          onClick={() => consultar()}
          style={{ height: 50 }}
        >
          {consultando ? 'Consultando…' : 'Consultar'}
        </BotaoPrimario>
        {erro && (
          <Corpo>
            <span style={{ color: '#9b3d3d' }}>{erro}</span>
          </Corpo>
        )}
      </div>

      {d && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '18px 18px 20px',
            background: PORTAL.card,
            border: '1px solid rgba(36,31,24,.08)',
            borderRadius: 16,
            boxShadow: SOMBRA_CARTAO,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="font-mono" style={{ fontWeight: 700, fontSize: 16, color: PORTAL.link }}>
              {d.protocolo}
            </span>
            <span className="font-sans" style={{ fontSize: 11.5, color: PORTAL.terciario }}>
              {`pedido ${d.pedidoId} · aberta em ${d.abertaEm}`}
            </span>
            <span style={{ flex: 1 }} />
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9,
                letterSpacing: '.07em',
                textTransform: 'uppercase',
                color: d.recusada ? PORTAL.erro : PORTAL.ok,
                background: d.recusada ? 'rgba(168,58,48,.1)' : 'rgba(63,122,82,.12)',
                borderRadius: 20,
                padding: '5px 9px',
                whiteSpace: 'nowrap',
              }}
            >
              {d.status}
            </span>
          </div>

          {/* A régua do caso, na mesma gramática do ERP. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${PASSOS_DEVOLUCAO.length},1fr)`,
              gap: 8,
            }}
          >
            {PASSOS_DEVOLUCAO.map((p, i) => {
              const feito = i < d.etapa
              const atual = i === d.etapa
              const cor = atual && d.recusada ? PORTAL.erro : PORTAL.ouro
              return (
                <span key={p} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span
                    style={{
                      height: 3,
                      borderRadius: 2,
                      display: 'block',
                      background: feito
                        ? 'rgba(63,122,82,.45)'
                        : atual
                          ? d.recusada
                            ? 'rgba(168,58,48,.4)'
                            : 'rgba(176,141,75,.5)'
                          : 'rgba(36,31,24,.1)',
                    }}
                  />
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 8.5,
                      lineHeight: 1.25,
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      color: feito ? PORTAL.ok : atual ? cor : 'rgba(36,31,24,.35)',
                    }}
                  >
                    {p}
                  </span>
                </span>
              )
            })}
          </div>

          {/* "Pedir mais fotos" antes só mudava o status: o cliente via
              "Aguardando fotos" e não tinha como responder. Agora o pedido
              chega escrito, com o campo de reenvio logo abaixo. */}
          {d.status === 'Aguardando fotos' && (
            <ReenvioDeProvas devolucao={d} identificacao={ident} aoConcluir={() => consultar()} />
          )}

          {d.reverso && !d.resolucao && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '16px 14px',
                borderRadius: 12,
                border: '1px solid rgba(176,141,75,.35)',
                background: 'rgba(176,141,75,.06)',
                textAlign: 'center',
              }}
            >
              <RotuloCampo>Código de postagem reversa</RotuloCampo>
              <span
                className="font-mono"
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: '.08em',
                  color: PORTAL.tinta,
                  border: '1px dashed rgba(176,141,75,.5)',
                  borderRadius: 9,
                  padding: '10px 18px',
                }}
              >
                {d.reverso}
              </span>
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: PORTAL.secundario }}>
                Apresente este código no balcão de uma agência dos Correios — a postagem não tem custo.
              </span>
            </div>
          )}

          {d.resolucao && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '16px 14px',
                borderRadius: 12,
                border: '1px solid rgba(63,122,82,.3)',
                background: 'rgba(63,122,82,.05)',
              }}
            >
              <RotuloCampo>Resolução</RotuloCampo>
              <span className="font-sans" style={{ fontWeight: 600, fontSize: 14, color: PORTAL.tinta }}>
                {d.resolucao}
              </span>
              {d.reembolsoValor != null && (
                <span className="font-sans" style={{ fontSize: 12.5, lineHeight: 1.55, color: PORTAL.secundario }}>
                  {`Reembolso de ${brl(d.reembolsoValor)}${d.reembolsoForma ? ` por ${d.reembolsoForma === 'pix' ? 'Pix' : 'estorno no cartão'}` : ''}${d.reembolsoEm ? `, efetuado em ${d.reembolsoEm}` : ''}.`}
                </span>
              )}
              {d.trocaPedidoId && (
                <span className="font-sans" style={{ fontSize: 12.5, lineHeight: 1.55, color: PORTAL.secundario }}>
                  {`Novo pedido do reenvio: ${d.trocaPedidoId}.`}
                </span>
              )}
              {d.comprovanteUrl && (
                <a
                  href={d.comprovanteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 46,
                    borderRadius: 11,
                    border: '1px solid rgba(176,141,75,.45)',
                    background: 'rgba(176,141,75,.1)',
                    color: PORTAL.link,
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  Baixar comprovante do reembolso
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <BotaoSecundario onClick={aoVoltar} style={{ height: 48 }}>
        Abrir uma nova devolução
      </BotaoSecundario>
    </Passo>
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
  const s = pedido.devolucaoAberta
    ? {
        // Devolução aberta trava o pedido. Deixar clicar levaria o cliente a
        // refazer o fluxo inteiro para receber o mesmo protocolo no fim.
        elegivel: false,
        estado: 'elegivel' as const,
        restam: 0,
        selo: 'Em andamento',
        mensagem: `Devolução ${pedido.devolucaoAberta} já aberta · toque para acompanhar`,
      }
    : semData
      ? {
          elegivel: false,
          estado: 'aguardando-entrega' as const,
          restam: 0,
          selo: 'Fale com a gente',
          mensagem: 'Não temos a data exata desta entrega — fale com o atendimento para abrir a devolução.',
        }
      : statusDevolucao(pedido.diasDesdeEntrega)
  const corPrazo = s.elegivel ? (s.restam <= 2 ? PORTAL.link : PORTAL.ok) : PORTAL.erro
  // Devolução aberta não abre outra, mas LEVA à que existe: o cliente já se
  // identificou aqui, mandá-lo à consulta por protocolo seria pedir de novo.
  const clicavel = s.elegivel || Boolean(pedido.devolucaoAberta)

  return (
    <button
      type="button"
      onClick={clicavel ? aoEscolher : undefined}
      disabled={!clicavel}
      aria-disabled={!clicavel}
      className={clicavel ? 'hover:-translate-y-px' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '15px 16px',
        border: `1px solid ${!clicavel ? 'rgba(36,31,24,.08)' : selecionado ? PORTAL.ouro : 'rgba(36,31,24,.09)'}`,
        background: !clicavel
          ? 'rgba(36,31,24,.03)'
          : selecionado
            ? 'rgba(176,141,75,.07)'
            : PORTAL.card,
        borderRadius: 15,
        cursor: clicavel ? 'pointer' : 'not-allowed',
        textAlign: 'left',
        boxShadow: clicavel ? SOMBRA_CARTAO : 'none',
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span
          className="font-mono"
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: clicavel ? PORTAL.tinta : 'rgba(36,31,24,.45)',
          }}
        >
          {pedido.codigo}
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
            // Devolução em andamento não é erro: é estado normal, e vermelho
            // ali faria o cliente achar que algo deu errado com o caso dele.
            color: s.elegivel ? PORTAL.ok : pedido.devolucaoAberta ? PORTAL.link : PORTAL.erro,
            background: s.elegivel
              ? 'rgba(63,122,82,.12)'
              : pedido.devolucaoAberta
                ? 'rgba(176,141,75,.16)'
                : 'rgba(168,58,48,.1)',
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
  midia = 'foto',
}: {
  marca: string
  titulo: string
  descricao: string
  obrigatoria: boolean
  arquivo: File | null
  aoEscolher: (arquivo: File | null) => void
  /** Vídeo troca a câmera do celular, a pré-visualização e os rótulos. */
  midia?: 'foto' | 'video'
}) {
  const ehVideo = midia === 'video'
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
              {obrigatoria ? (ehVideo ? 'Obrigatório' : 'Obrigatória') : 'Opcional'}
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
          {/* O vídeo é reproduzível aqui mesmo: o cliente confere se o
              vazamento aparece ANTES de enviar, e não depois da recusa. */}
          {ehVideo ? (
            <video
              src={preview}
              controls
              playsInline
              preload="metadata"
              style={{
                width: 132,
                height: 84,
                objectFit: 'cover',
                borderRadius: 11,
                border: '1px solid rgba(36,31,24,.1)',
                background: '#000',
              }}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
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
          )}
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
        accept={ehVideo ? 'video/*' : 'image/*'}
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
          {feita
            ? ehVideo
              ? 'Trocar vídeo'
              : 'Trocar foto'
            : ehVideo
              ? 'Gravar ou escolher vídeo'
              : 'Tirar ou escolher foto'}
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

/**
 * O cliente responde ao pedido de novas provas, sem sair do acompanhamento.
 *
 * Reaproveita a mesma máquina do envio original: o servidor assina, o
 * navegador sobe direto e depois confirma. Aqui nada é obrigatório — a
 * triagem pode ter pedido só uma das fotos.
 */
function ReenvioDeProvas({
  devolucao,
  identificacao,
  aoConcluir,
}: {
  devolucao: AcompanhamentoDevolucao
  identificacao: string
  aoConcluir: () => void
}) {
  const [arquivos, setArquivos] = useState<Record<CampoDeProva, File | null>>({
    nivel: null,
    lacre: null,
    video: null,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [enviando, iniciar] = useTransition()

  const escolhidos = (['nivel', 'lacre', 'video'] as CampoDeProva[])
    .map((campo) => ({ campo, arquivo: arquivos[campo] }))
    .filter((x): x is { campo: CampoDeProva; arquivo: File } => Boolean(x.arquivo))

  const enviar = () => {
    if (!escolhidos.length || enviando) return
    setErro(null)
    iniciar(async () => {
      const preparo = await prepararEnvioDeProvas(
        devolucao.pedidoId,
        escolhidos.map(({ campo, arquivo }) => ({
          campo,
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })),
        identificacao,
        devolucao.protocolo,
      )
      if (!preparo.ok) {
        setErro(preparo.erro)
        return
      }

      const totalBytes = escolhidos.reduce((a, x) => a + x.arquivo.size, 0)
      const enviados = new Map<CampoDeProva, number>()
      setProgresso(0)
      try {
        for (const destino of preparo.destinos) {
          const item = escolhidos.find((x) => x.campo === destino.campo)
          if (!item) continue
          await subirDireto(destino.url, item.arquivo, (bytes) => {
            enviados.set(destino.campo, bytes)
            const feito = [...enviados.values()].reduce((a, b) => a + b, 0)
            setProgresso(Math.min(99, Math.round((feito / totalBytes) * 100)))
          })
        }
      } catch {
        setProgresso(null)
        setErro('O envio falhou no meio do caminho. Confira a conexão e tente de novo.')
        return
      }

      const caminhos: { nivel?: string; lacre?: string; video?: string } = {}
      for (const d of preparo.destinos) caminhos[d.campo] = d.caminho

      const r = await reenviarProvas(devolucao.protocolo, identificacao, preparo.rascunho, caminhos)
      setProgresso(null)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setArquivos({ nivel: null, lacre: null, video: null })
      aoConcluir()
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 14px',
        borderRadius: 12,
        border: '1px solid rgba(176,141,75,.35)',
        background: 'rgba(176,141,75,.06)',
      }}
    >
      <RotuloCampo>Precisamos de novas fotos</RotuloCampo>
      <span className="font-sans" style={{ fontSize: 12.5, lineHeight: 1.55, color: PORTAL.tinta }}>
        {devolucao.pedidoDeFotos ?? 'Reenvie as fotos do produto para seguirmos com a análise.'}
      </span>

      <UploadFoto
        marca="1"
        titulo="Nível do líquido no frasco"
        descricao="Contra a luz, mostrando quanto perfume tem dentro do frasco."
        obrigatoria={false}
        arquivo={arquivos.nivel}
        aoEscolher={(f) => setArquivos((s) => ({ ...s, nivel: f }))}
      />
      <UploadFoto
        marca="2"
        titulo="Lacre (recrave) do decant"
        descricao="De perto, mostrando o recrave sem sinais de abertura."
        obrigatoria={false}
        arquivo={arquivos.lacre}
        aoEscolher={(f) => setArquivos((s) => ({ ...s, lacre: f }))}
      />
      <UploadFoto
        marca="3"
        midia="video"
        titulo="Vídeo"
        descricao="Se pedirmos um vídeo, envie por aqui."
        obrigatoria={false}
        arquivo={arquivos.video}
        aoEscolher={(f) => setArquivos((s) => ({ ...s, video: f }))}
      />

      {progresso !== null && (
        <span className="font-sans" style={{ fontSize: 11, color: PORTAL.secundario }}>
          {`Enviando… ${progresso}%. Não feche esta página.`}
        </span>
      )}
      {erro && (
        <span className="font-sans" style={{ fontSize: 12, color: PORTAL.erro }}>
          {erro}
        </span>
      )}

      <BotaoPrimario ativo={escolhidos.length > 0 && !enviando} onClick={enviar}>
        {enviando ? 'Enviando…' : 'Reenviar fotos'}
      </BotaoPrimario>
    </div>
  )
}
