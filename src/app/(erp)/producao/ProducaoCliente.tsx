'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import {
  BotaoOuro,
  BotaoSecundario,
  EstadoVazio,
  Ponto,
  Rotulo,
  TituloSecao,
  Valor,
} from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { Modal } from '@/components/erp/Modal'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  VARIANTES,
  brl,
  coberturaDe,
  frascoDe,
  pad2,
  parseNum,
  pct,
  plural,
  resumirMovimentacoes,
  resumirOrdens,
  simularOrdem,
  volume,
} from '@/domain'
import type {
  Movimentacao,
  OrdemProducao,
  ParametrosPrecificacao,
  PerdaReal,
  PerfumeBase,
  StatusOrdem,
  VarianteMl,
} from '@/domain'

import { abrirOrdem, concluirEnvase } from './actions'

const TOM_STATUS: Record<StatusOrdem, Tom> = {
  'Em envase': 'info',
  'Aguardando conferência': 'ouro',
  Bloqueada: 'erro',
  Concluída: 'ok',
}

interface Props {
  ordens: OrdemProducao[]
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
  movimentacoes: Movimentacao[]
  /** Perda real dos lotes encerrados — a mesma de Estoque → Lotes. */
  perda: PerdaReal
  /** Custo do volume baixado em produção no mês, derivado das movimentações. */
  custoProduzido: number
}

export function ProducaoCliente({
  ordens,
  bases,
  parametros,
  movimentacoes,
  perda,
  custoProduzido,
}: Props) {
  const [modalAberto, setModalAberto] = useState(false)
  const [envasando, setEnvasando] = useState<OrdemProducao | null>(null)

  const r = resumirOrdens(ordens)
  const movs = resumirMovimentacoes(movimentacoes)

  const kpis: Kpi[] = [
    {
      label: 'Ordens abertas',
      valor: pad2(r.abertas),
      hint: r.bloqueadas
        ? `${plural(r.bloqueadas, 'bloqueada', 'bloqueadas')} por falta de base`
        : 'Nenhuma bloqueada por falta de base',
      tom: r.bloqueadas ? 'erro' : 'ok',
    },
    {
      label: 'Volume em envase',
      valor: volume(r.volumeEmEnvaseMl),
      hint: 'Nas ordens em andamento · fora as bloqueadas',
      tom: 'info',
    },
    {
      label: 'Unidades a produzir',
      valor: String(r.unidadesAProduzir),
      hint: `Nas ${plural(r.abertas, 'ordem aberta', 'ordens abertas')}`,
      tom: 'ouro',
    },
    {
      // Produção baixa só o envasado: a perda não é medida aqui. Este KPI lê a
      // MESMA conta de Lotes — uma grandeza, um cálculo.
      label: 'Perda real medida',
      valor: pct(perda.mediaPct),
      hint: perda.lotesEncerrados
        ? `${plural(perda.lotesEncerrados, 'lote encerrado', 'lotes encerrados')} · parâmetro ${pct(parametros.perdaPct)}`
        : 'Nenhum frasco declarado vazio ainda',
      tom: perda.lotesEncerrados === 0 ? 'neutro' : perda.mediaPct <= parametros.perdaPct ? 'ok' : 'atencao',
    },
    {
      label: 'Custo produzido no mês',
      valor: brl(custoProduzido),
      hint: 'Volume baixado em produção ao custo por ml de cada base',
    },
  ]

  const colunas: Coluna<OrdemProducao>[] = [
    {
      chave: 'ordem',
      titulo: 'Ordem',
      largura: '88px',
      render: (o) => (
        <Valor tamanho={11.5} tom="ouro">
          {o.id}
        </Valor>
      ),
    },
    {
      chave: 'base',
      titulo: 'Perfume base',
      largura: 'minmax(0,1fr)',
      render: (o) => {
        const base = bases.find((b) => b.id === o.baseId)
        const motivo =
          o.motivo === 'AUTO_COBERTURA' && base
            ? `Reposição · estoque acaba em ${coberturaDe(base).cobertura}`
            : o.motivo
        return <CelulaDupla principal={o.perfume} secundaria={motivo} />
      },
    },
    {
      chave: 'variante',
      titulo: 'Variante',
      largura: '96px',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {`${o.variante} ml`}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}
          >
            {`frasco ${frascoDe(o.variante)} ml`}
          </span>
        </span>
      ),
    },
    {
      chave: 'qtd',
      titulo: 'Qtd',
      largura: '84px',
      alinhamento: 'right',
      render: (o) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
          {`${o.quantidade} un`}
        </Valor>
      ),
    },
    {
      chave: 'volume',
      titulo: 'Volume',
      largura: '96px',
      alinhamento: 'right',
      render: (o) => <Valor tamanho={12}>{volume(o.volumeMl)}</Valor>,
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '168px',
      render: (o) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.3,
              color: COR[TOM_STATUS[o.status]],
              whiteSpace: 'nowrap',
            }}
          >
            <Ponto tom={TOM_STATUS[o.status]} />
            {o.status}
          </span>
          {o.status === 'Bloqueada' ? (
            <Link
              href="/estoque"
              className="font-sans hover:bg-[rgba(194,90,80,.12)]"
              style={{
                height: 24,
                padding: '0 8px',
                border: '1px solid rgba(194,90,80,.3)',
                color: 'var(--color-erro-claro)',
                fontWeight: 600,
                fontSize: 9.5,
                lineHeight: '22px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
              }}
            >
              Ver estoque
            </Link>
          ) : (
            o.status !== 'Concluída' && (
              <button
                type="button"
                onClick={() => setEnvasando(o)}
                className="font-sans hover:bg-[rgba(239,209,140,.12)]"
                style={{
                  height: 24,
                  padding: '0 8px',
                  border: '1px solid rgba(239,209,140,.28)',
                  background: 'transparent',
                  color: 'var(--color-ouro)',
                  fontWeight: 600,
                  fontSize: 9.5,
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                Concluir envase
              </button>
            )
          )}
        </span>
      ),
    },
    {
      chave: 'responsavel',
      titulo: 'Responsável',
      largura: '132px',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.72)' }}
          >
            {o.responsavel}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.3, color: COR[TOM_STATUS[o.status]] }}
          >
            {o.prazo}
          </span>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Ordens de produção</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34} onClick={() => setModalAberto(true)}>
          Nova ordem de produção
        </BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={ordens}
        chaveDe={(o) => o.id}
        bandeiraDe={(o) =>
          o.status === 'Bloqueada' ? 'erro' : o.status === 'Aguardando conferência' ? 'ouro' : null
        }
      />

      {modalAberto && (
        <ModalNovaOrdem
          bases={bases}
          parametros={parametros}
          aoFechar={() => setModalAberto(false)}
        />
      )}

      {envasando && (
        <ModalConcluirEnvase
          ordem={envasando}
          base={bases.find((b) => b.id === envasando.baseId)}
          aoFechar={() => setEnvasando(null)}
        />
      )}
    </div>
  )
}

/**
 * Conclusão do envase: o único ponto da tela que move estoque.
 *
 * Pergunta quantas unidades saíram de fato, porque o planejado e o envasado
 * divergem — quebra frasco, falta insumo. Baixar o planejado quando saíram
 * menos poria no estoque um decant que não existe.
 */
function ModalConcluirEnvase({
  ordem,
  base,
  aoFechar,
}: {
  ordem: OrdemProducao
  base: PerfumeBase | undefined
  aoFechar: () => void
}) {
  const [texto, setTexto] = useState(String(ordem.quantidade))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const envasadas = Math.max(0, Math.floor(parseNum(texto)))
  const liquidoMl = envasadas * ordem.variante
  const volumeBase = base?.volumeMl ?? 0
  const sobra = volumeBase - liquidoMl

  const impedimento =
    envasadas === 0
      ? 'Informe quantas unidades foram envasadas.'
      : envasadas > ordem.quantidade
        ? `A ordem planejou ${ordem.quantidade} un. Para envasar mais, abra outra ordem.`
        : liquidoMl > volumeBase
          ? `${volume(volumeBase)} em estoque não envasam ${envasadas} un de ${ordem.variante} ml (${volume(liquidoMl)}).`
          : null

  const confirmar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await concluirEnvase(ordem.id, envasadas)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const linhas = [
    { label: 'Planejado na ordem', valor: `${ordem.quantidade} un de ${ordem.variante} ml`, tom: 'var(--color-corrente)' },
    { label: 'Sai do estoque', valor: volume(liquidoMl), tom: COR.ouro },
    { label: 'Volume da base depois', valor: volume(Math.max(0, sobra)), tom: sobra < 0 ? COR.erro : 'var(--color-corrente)' },
    { label: 'Decants vendáveis criados', valor: `${envasadas} un`, tom: COR.ok },
  ]

  return (
    <Modal titulo={`Concluir o envase da ordem ${ordem.id}`} largura={520} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>{`Concluir envase · ${ordem.id}`}</Rotulo>
        <TituloSecao tamanho={15}>{ordem.perfume}</TituloSecao>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Unidades efetivamente envasadas</Rotulo>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          autoFocus
          className="font-mono focus:border-ouro/45"
          style={{
            height: 40,
            padding: '0 13px',
            border: '1px solid rgba(239,209,140,.4)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
            color: 'var(--color-corrente)',
            fontWeight: 500,
            fontSize: 15,
            outline: 0,
          }}
        />
      </label>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(255,255,255,.05)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {linhas.map((l) => (
          <span
            key={l.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '11px 13px',
              background: 'var(--color-painel)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--color-secundario)' }}
            >
              {l.label}
            </span>
            <Valor tamanho={12.5} tom={l.tom}>
              {l.valor}
            </Valor>
          </span>
        ))}
      </div>

      <span
        className="font-sans"
        style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
      >
        Sai do estoque o volume envasado, não o envasado mais a perda estimada: a perda ainda não
        foi medida. Ela aparece inteira quando este frasco for declarado vazio, em Estoque → Lotes.
        O consumo é rateado nos lotes abertos, do mais antigo para o mais novo.
      </span>

      {(impedimento || erro) && (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
        >
          {erro ?? impedimento}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <button
          type="button"
          onClick={confirmar}
          disabled={pendente || impedimento !== null}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 36,
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            cursor: pendente ? 'wait' : impedimento ? 'not-allowed' : 'pointer',
            opacity: pendente || impedimento ? 0.5 : 1,
          }}
        >
          {pendente ? 'Baixando…' : 'Confirmar envase'}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Modal de nova ordem: mostra o impacto no estoque ANTES de confirmar e
 * bloqueia a confirmação quando o volume não sustenta a quantidade.
 */
function ModalNovaOrdem({
  bases,
  parametros,
  aoFechar,
}: {
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
  aoFechar: () => void
}) {
  const [baseId, setBaseId] = useState(bases[0]?.id ?? '')
  const [variante, setVariante] = useState<VarianteMl>(5)
  const [qtdTexto, setQtdTexto] = useState('12')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const base = bases.find((b) => b.id === baseId) ?? bases[0]

  // Sem perfume base cadastrado não há o que produzir.
  if (!base) {
    return (
      <Modal titulo="Nova ordem de produção" aoFechar={aoFechar}>
        <EstadoVazio
          titulo="Nenhum perfume base cadastrado"
          instrucao="Cadastre um perfume base com volume em estoque para abrir ordens."
        />
      </Modal>
    )
  }

  const quantidade = Math.max(0, Math.floor(parseNum(qtdTexto)))
  const sim = simularOrdem(base, variante, quantidade, parametros)
  const podeConfirmar = quantidade > 0 && !sim.insuficiente && !pendente

  const abrir = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await abrirOrdem({ baseId: base.id, variante, quantidade, motivo })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const tomImpacto: Tom = sim.insuficiente ? 'erro' : 'ok'

  const impacto = [
    { label: 'Volume disponível', valor: volume(base.volumeMl), tom: 'var(--color-corrente)' },
    {
      label: `Consumo com ${pct(parametros.perdaPct)} de perda`,
      valor: volume(sim.consumoMl),
      tom: COR.atencao,
    },
    {
      label: 'Restante depois',
      valor: volume(Math.abs(sim.restanteMl)) + (sim.insuficiente ? ' faltando' : ''),
      tom: sim.insuficiente ? COR.erro : COR.ok,
    },
    { label: 'Envasado líquido', valor: volume(sim.liquidoMl), tom: 'var(--color-corrente)' },
  ]

  return (
    <Modal titulo="Nova ordem de produção" largura={660} padding={0} aoFechar={aoFechar}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '22px 26px 18px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
            <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>Produção</Rotulo>
            <span
              className="font-display"
              style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.1, color: 'var(--color-tinta)' }}
            >
              Nova ordem de produção
            </span>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="hover:border-ouro/35 hover:text-ouro"
            style={{
              width: 30,
              height: 30,
              border: '1px solid rgba(255,255,255,.1)',
              background: 'transparent',
              color: 'var(--color-secundario)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Perfume base
              </span>
              <select
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="font-sans"
                style={{
                  height: 38,
                  padding: '0 11px',
                  border: '1px solid rgba(239,209,140,.35)',
                  background: '#151417',
                  color: 'var(--color-corrente)',
                  fontWeight: 500,
                  fontSize: 12.5,
                  borderRadius: 8,
                }}
              >
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {`${b.nome} · ${volume(b.volumeMl)}`}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Variante e frasco de envase
              </span>
              <select
                value={variante}
                onChange={(e) => setVariante(Number(e.target.value) as VarianteMl)}
                className="font-sans"
                style={{
                  height: 38,
                  padding: '0 11px',
                  border: '1px solid rgba(255,255,255,.1)',
                  background: '#151417',
                  color: 'var(--color-corrente)',
                  fontWeight: 500,
                  fontSize: 12.5,
                  borderRadius: 8,
                }}
              >
                {VARIANTES.map((v) => (
                  <option key={v} value={v}>
                    {`${v} ml · frasco de ${frascoDe(v)} ml`}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Quantidade
              </span>
              <input
                value={qtdTexto}
                onChange={(e) => setQtdTexto(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="font-mono focus:border-ouro/45"
                style={{
                  height: 38,
                  padding: '0 11px',
                  border: '1px solid rgba(255,255,255,.1)',
                  background: '#151417',
                  color: 'var(--color-corrente)',
                  fontWeight: 500,
                  fontSize: 12.5,
                  borderRadius: 8,
                  outline: 0,
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Perda técnica
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 9,
                  height: 38,
                  padding: '0 11px',
                  border: '1px solid var(--color-borda)',
                  background: 'rgba(255,255,255,.02)',
                  borderRadius: 8,
                }}
              >
                {/* O parâmetro não se edita aqui — mora em Configurações. */}
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 12.5, color: 'rgba(242,237,227,.7)' }}>
                  {pct(parametros.perdaPct)}
                </span>
                <Link
                  href="/configuracoes/precificacao"
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 9.5,
                    letterSpacing: '.05em',
                    color: 'var(--color-ouro)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Configurações
                </Link>
              </span>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span
              className="font-sans"
              style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
            >
              Motivo da ordem
            </span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Reposição, pedidos da semana, kit descoberta…"
              className="font-sans focus:border-ouro/45"
              style={{
                height: 38,
                padding: '0 11px',
                border: '1px solid rgba(255,255,255,.1)',
                background: '#151417',
                color: 'var(--color-corrente)',
                fontSize: 12.5,
                borderRadius: 8,
                outline: 0,
              }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '17px 18px',
              borderRadius: 13,
              background: sim.insuficiente ? 'rgba(194,90,80,.07)' : 'rgba(92,158,112,.06)',
              border: `1px solid ${sim.insuficiente ? 'rgba(194,90,80,.28)' : 'rgba(92,158,112,.22)'}`,
              transition: '.25s',
            }}
          >
            <Rotulo style={{ color: COR[tomImpacto] }}>Impacto antes de confirmar</Rotulo>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {impacto.map((i) => (
                <span key={i.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, lineHeight: 1.2, color: 'var(--color-terciario)' }}
                  >
                    {i.label}
                  </span>
                  <Valor tamanho={17} tom={i.tom}>
                    {i.valor}
                  </Valor>
                </span>
              ))}
            </div>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.5, color: COR[tomImpacto], textWrap: 'pretty' }}
            >
              {sim.mensagem}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 26px 20px',
            borderTop: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <span
            className="font-sans"
            style={{ flex: 1, fontSize: 11, lineHeight: 1.4, color: erro ? COR.erro : 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            {erro ??
              'Abrir a ordem não move estoque. A baixa acontece ao concluir o envase, e vai para Movimentações.'}
          </span>
          <button
            type="button"
            onClick={aoFechar}
            className="font-sans"
            style={{
              height: 38,
              padding: '0 16px',
              border: '1px solid rgba(255,255,255,.11)',
              background: 'transparent',
              color: 'rgba(242,237,227,.75)',
              fontWeight: 600,
              fontSize: 12,
              borderRadius: 9,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={podeConfirmar ? abrir : undefined}
            disabled={!podeConfirmar}
            className="font-sans"
            style={{
              height: 38,
              padding: '0 20px',
              border: 0,
              background: podeConfirmar
                ? 'linear-gradient(135deg,#EFD18C,#C9A868)'
                : 'rgba(255,255,255,.06)',
              color: podeConfirmar ? 'var(--color-sobre-ouro)' : 'rgba(242,237,227,.3)',
              fontWeight: 700,
              fontSize: 12,
              borderRadius: 9,
              cursor: pendente ? 'wait' : podeConfirmar ? 'pointer' : 'not-allowed',
              boxShadow: podeConfirmar ? 'var(--shadow-ouro)' : 'none',
            }}
          >
            {pendente ? 'Abrindo…' : 'Abrir ordem'}
          </button>
        </div>
    </Modal>
  )
}
