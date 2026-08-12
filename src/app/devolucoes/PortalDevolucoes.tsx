'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'

import {
  BlocoAviso,
  BotaoPrimario,
  BotaoSecundario,
  Corpo,
  PORTAL,
  RotuloCampo,
  SlotImagem,
  TituloPasso,
} from '@/components/portal/primitivos'
import {
  MOTIVOS,
  PRAZO_DEVOLUCAO_DIAS,
  brl,
  descreveVariante,
  ehDanificado,
  fotosCompletas,
  frascoDe,
  plural,
  statusDevolucao,
} from '@/domain'
import type { MotivoDevolucao, Pedido } from '@/domain'

import { abrirDevolucao, buscarPedidos } from './actions'

const PASSOS = ['Acesso', 'Pedidos', 'Itens', 'Motivo', 'Fotos', 'Pronto'] as const

type Metodo = 'email' | 'cpf'

export function PortalDevolucoes() {
  const [passo, setPasso] = useState(1)
  const [metodo, setMetodo] = useState<Metodo>('email')
  const [ident, setIdent] = useState('')
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [buscando, iniciarBusca] = useTransition()
  const [pedidoId, setPedidoId] = useState<string | null>(null)
  const [itens, setItens] = useState<string[]>([])
  const [motivo, setMotivo] = useState<MotivoDevolucao | ''>('')
  const [comentario, setComentario] = useState('')
  const [fotos, setFotos] = useState({ nivel: false, lacre: false })
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
  const fotosOk = fotosCompletas(motivo, fotos)

  const voltar = () => setPasso((p) => Math.max(1, p - 1))

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
    setFotos({ nivel: false, lacre: false })
  }

  return (
    <div
      className="portal"
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 0 40px',
        background: PORTAL.fundo,
        color: PORTAL.tinta,
      }}
    >
      <div
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
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: PORTAL.header,
            padding: '18px 22px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
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
              style={{ width: 118, height: 'auto', display: 'block' }}
            />
            <div style={{ flex: 1 }} />
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9,
                lineHeight: 1,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'rgba(239,209,140,.72)',
              }}
            >
              Devoluções
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={PASSOS.length}
            aria-valuenow={passo}
            aria-label={`Passo ${passo} de ${PASSOS.length}: ${PASSOS[passo - 1]}`}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}
          >
            {PASSOS.map((p, i) => (
              <span key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span
                  style={{
                    height: 3,
                    borderRadius: 2,
                    display: 'block',
                    background: i + 1 <= passo ? PORTAL.ouro : 'rgba(239,209,140,.22)',
                  }}
                />
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    lineHeight: 1.2,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                    color: i + 1 === passo ? PORTAL.ouroClaro : 'rgba(239,209,140,.66)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p}
                </span>
              </span>
            ))}
          </div>
        </header>

        {passo === 1 && (
          <Passo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <h1
                className="font-display"
                style={{ margin: 0, fontWeight: 600, fontSize: 26, lineHeight: 1.15, letterSpacing: '.01em' }}
              >
                Vamos resolver isso
              </h1>
              <Corpo>Informe o e-mail ou o CPF da compra para encontrarmos seu pedido.</Corpo>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
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
                      boxShadow: ativo ? '0 1px 4px rgba(36,31,24,.1)' : 'none',
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
                inputMode={metodo === 'cpf' ? 'numeric' : 'email'}
                placeholder={metodo === 'email' ? 'seu@email.com' : '000.000.000-00'}
                className="font-sans focus:border-[#B08D4B]"
                style={{
                  height: 50,
                  padding: '0 15px',
                  border: `1px solid rgba(36,31,24,.16)`,
                  background: PORTAL.card,
                  color: PORTAL.tinta,
                  fontWeight: 500,
                  fontSize: 15,
                  borderRadius: 11,
                  outline: 0,
                }}
              />
            </label>

            <BotaoPrimario
              ativo={ident.trim().length > 0 && !buscando}
              onClick={buscar}
              style={{ height: 52, fontSize: 14 }}
            >
              {buscando ? 'Buscando…' : 'Buscar meus pedidos'}
            </BotaoPrimario>

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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
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
              <RotuloCampo>{`Pedido ${pedido.id} · entregue em ${pedido.entregueEm}`}</RotuloCampo>
              <TituloPasso>O que você quer devolver?</TituloPasso>
              <Corpo>
                {(() => {
                  const s = statusDevolucao(pedido.diasDesdeEntrega)
                  return s.restam === 1
                    ? `Hoje é o último dia do prazo de ${PRAZO_DEVOLUCAO_DIAS} dias. Marque os itens que quer devolver.`
                    : `Você está no ${pedido.diasDesdeEntrega}º dia dos ${PRAZO_DEVOLUCAO_DIAS} disponíveis. Marque os itens que quer devolver.`
                })()}
              </Corpo>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 13,
                      padding: '12px 14px',
                      border: `1px solid ${ativo ? PORTAL.ouro : PORTAL.borda}`,
                      background: ativo ? 'rgba(176,141,75,.07)' : PORTAL.card,
                      borderRadius: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      aria-hidden
                      className="font-sans"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: `1.5px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.24)'}`,
                        background: ativo ? PORTAL.ouro : 'transparent',
                        color: PORTAL.coluna,
                        fontWeight: 700,
                        fontSize: 12,
                        lineHeight: '19px',
                        textAlign: 'center',
                        flex: 'none',
                      }}
                    >
                      {ativo ? '✓' : ''}
                    </span>
                    <SlotImagem legenda={`${item.perfume} ${item.variante} ml`} />
                    <span
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
                    >
                      <span
                        className="font-sans"
                        style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, textWrap: 'pretty' }}
                      >
                        {item.perfume}
                      </span>
                      <span
                        className="font-sans"
                        style={{
                          fontSize: 10,
                          lineHeight: 1.25,
                          letterSpacing: '.05em',
                          textTransform: 'uppercase',
                          color: 'rgba(176,141,75,.85)',
                        }}
                      >
                        {item.marca}
                      </span>
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
              <TituloPasso>Por que está devolvendo?</TituloPasso>
              <Corpo>Escolha o motivo mais próximo. Isso define como cuidamos do seu caso.</Corpo>
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
                      border: `1px solid ${ativo ? PORTAL.ouro : PORTAL.borda}`,
                      background: ativo ? 'rgba(176,141,75,.07)' : PORTAL.card,
                      borderRadius: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `1.5px solid ${ativo ? PORTAL.ouro : 'rgba(36,31,24,.24)'}`,
                        background: ativo ? PORTAL.ouro : 'transparent',
                        flex: 'none',
                        marginTop: 1,
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
                  border: `1px solid rgba(36,31,24,.16)`,
                  background: PORTAL.card,
                  color: PORTAL.tinta,
                  fontSize: 13,
                  lineHeight: 1.6,
                  borderRadius: 11,
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
              <SlotFoto
                marca="1"
                titulo="Nível do líquido no frasco"
                descricao={`Contra a luz, mostrando quanto perfume tem dentro. É assim que confirmamos que o decant não foi usado${
                  selecionados.length
                    ? ` — um decant de ${selecionados[0].variante} ml num frasco de ${frascoDe(selecionados[0].variante)} ml fica parcialmente cheio.`
                    : '.'
                }`}
                obrigatoria
                feita={fotos.nivel}
                aoAlternar={() => setFotos((f) => ({ ...f, nivel: !f.nivel }))}
              />
              <SlotFoto
                marca="2"
                titulo={danificado ? 'Frasco danificado' : 'Lacre (recrave) do decant'}
                descricao={
                  danificado
                    ? 'Mostre o vazamento ou a parte danificada. Como o frasco chegou com defeito, não exigimos o lacre intacto.'
                    : 'De perto, mostrando o recrave sem sinais de abertura.'
                }
                obrigatoria={!danificado}
                feita={fotos.lacre}
                aoAlternar={() => setFotos((f) => ({ ...f, lacre: !f.lacre }))}
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
              <BotaoPrimario
                ativo={fotosOk && !enviando}
                onClick={() => {
                  if (!fotosOk || !pedido || enviando) return
                  setErroEnvio(null)
                  iniciarEnvio(async () => {
                    const r = await abrirDevolucao({
                      pedidoId: pedido.id,
                      motivo,
                      itens: selecionados.map((i) => `${i.perfume} · ${i.variante} ml`),
                      comentario,
                      fotos,
                    })
                    // Só avança quando a solicitação existe do outro lado.
                    // Mostrar "enviada" e não ter registrado nada é o erro que
                    // o cliente só descobre quando cobra uma resposta.
                    if (!r.ok) {
                      setErroEnvio(r.erro)
                      return
                    }
                    setProtocolo(r.protocolo)
                    setPasso(6)
                  })
                }}
                style={{ flex: 1 }}
              >
                {enviando ? 'Enviando…' : 'Enviar solicitação'}
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
                  width: 52,
                  height: 52,
                  border: `1px solid rgba(176,141,75,.5)`,
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
                style={{ margin: 0, fontWeight: 600, fontSize: 24, lineHeight: 1.2 }}
              >
                Solicitação enviada
              </h1>
              <Corpo>
                {`Protocolo ${protocolo ?? '—'} aberto para o pedido ${pedido.id}. Guarde este número: é por ele que encontramos a sua solicitação.`}
              </Corpo>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '18px 18px 6px',
                borderRadius: 14,
                background: PORTAL.card,
                border: `1px solid rgba(36,31,24,.1)`,
              }}
            >
              <span style={{ paddingBottom: 14 }}>
                <RotuloCampo>O que acontece agora</RotuloCampo>
              </span>
              {[
                {
                  marca: '✓',
                  feito: true,
                  titulo: 'Recebemos suas fotos',
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
                  titulo: 'Enviamos o código reverso por e-mail',
                  // O reverso sai na mesma plataforma que emitiu a etiqueta de ida.
                  desc: `Postagem sem custo pela ${pedido.gateway}, com o passo a passo`,
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
          style={{
            padding: '18px 22px 26px',
            borderTop: `1px solid rgba(36,31,24,.08)`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(36,31,24,.45)', textWrap: 'pretty' }}
          >
            Dúvidas? Fale com a gente pelo WhatsApp{' '}
            <a href="https://wa.me/5511900004821" style={{ color: PORTAL.link }}>
              (11) 9•••• 4821
            </a>
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(36,31,24,.32)' }}
          >
            FRENESI Perfumes · devolucoes.frenesiperfumes.com.br
          </span>
        </footer>
      </div>
    </div>
  )
}

function Passo({
  children,
  padding = '24px 22px 30px',
}: {
  children: React.ReactNode
  padding?: string
}) {
  return (
    <div
      className="animate-[pt-in_.26s_ease_both]"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding }}
    >
      {children}
    </div>
  )
}

function CartaoPedido({
  pedido,
  selecionado,
  aoEscolher,
}: {
  pedido: Pedido
  selecionado: boolean
  aoEscolher: () => void
}) {
  // Elegibilidade e cópia saem da mesma função que o ERP usa.
  const s = statusDevolucao(pedido.diasDesdeEntrega)
  const corPrazo = s.elegivel ? (s.restam <= 2 ? PORTAL.link : PORTAL.ok) : PORTAL.erro

  return (
    <button
      type="button"
      onClick={s.elegivel ? aoEscolher : undefined}
      disabled={!s.elegivel}
      aria-disabled={!s.elegivel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        padding: '15px 16px',
        border: `1px solid ${!s.elegivel ? 'rgba(36,31,24,.1)' : selecionado ? PORTAL.ouro : PORTAL.borda}`,
        background: !s.elegivel
          ? 'rgba(36,31,24,.03)'
          : selecionado
            ? 'rgba(176,141,75,.07)'
            : PORTAL.card,
        borderRadius: 13,
        cursor: s.elegivel ? 'pointer' : 'not-allowed',
        textAlign: 'left',
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
          {`comprado em ${pedido.data} · ${pedido.entregueEm ? `entregue em ${pedido.entregueEm}` : 'em trânsito'}`}
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

function SlotFoto({
  marca,
  titulo,
  descricao,
  obrigatoria,
  feita,
  aoAlternar,
}: {
  marca: string
  titulo: string
  descricao: string
  obrigatoria: boolean
  feita: boolean
  aoAlternar: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 16px',
        border: `1px dashed ${feita ? 'rgba(63,122,82,.4)' : 'rgba(36,31,24,.2)'}`,
        background: feita ? 'rgba(63,122,82,.05)' : PORTAL.card,
        borderRadius: 14,
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
      <button
        type="button"
        onClick={aoAlternar}
        className="font-sans"
        style={{
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
        {feita ? 'Foto anexada · trocar' : 'Tirar ou anexar foto'}
      </button>
    </div>
  )
}
