import Link from 'next/link'

import { BORDA, COR, FAIXA, FUNDO } from '@/components/erp/tokens'
import { Ico, type NomeIcone } from '@/components/erp/IconesUi'
import { brl } from '@/domain'
import { ROTULO_DA_SEVERIDADE, type Prioridade, type Severidade } from '@/domain'
import type { Briefing } from '@/domain'
import type { ResumoExecutivo } from '@/data/assessor/prioridades'

/**
 * Os blocos da Central do Gerente, na ordem do escopo §3.1.
 *
 * A ordem não é gosto: indicador de atualização, "Prioridades agora", briefing
 * executivo, resumo do dia, e só então a conversa. O escopo põe a conversa
 * DEPOIS porque a Central responde às quatro perguntas do produto — o que está
 * acontecendo, o que exige atenção, o que você recomenda, execute isso — e as
 * três primeiras não deveriam exigir que alguém digitasse nada.
 */

const TOM: Record<Severidade, { cor: string; fundo: string; borda: string; icone: NomeIcone }> = {
  critico: { cor: COR.erro, fundo: FUNDO.erro, borda: BORDA.erro, icone: 'alerta' },
  alto: { cor: COR.atencao, fundo: FUNDO.atencao, borda: BORDA.atencao, icone: 'alerta' },
  medio: { cor: COR.info, fundo: FUNDO.info, borda: BORDA.info, icone: 'info' },
  informativo: { cor: COR.neutro, fundo: FUNDO.neutro, borda: BORDA.neutro, icone: 'info' },
}

const NIVEL_DA_CONFIANCA: Record<'alta' | 'media' | 'baixa', string> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
}

// ── §3.1: indicador de atualização e módulos consultados ───────────────────

export function IndicadorDeAtualizacao({
  apuradoEm,
  modulos,
}: {
  apuradoEm: string
  modulos: string[]
}) {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(apuradoEm))

  return (
    <div
      className="font-sans"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexWrap: 'wrap',
        fontSize: 10.5,
        color: 'rgba(242,237,227,.38)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: COR.ok }}>
        <span
          aria-hidden
          style={{ width: 5, height: 5, borderRadius: '50%', background: COR.ok, flex: 'none' }}
        />
        Dados apurados às {hora}
      </span>
      <span aria-hidden>·</span>
      <span>{modulos.join(' · ')}</span>
    </div>
  )
}

// ── §3.1: bloco "Prioridades agora" ────────────────────────────────────────

export function PrioridadesAgora({ itens, resumo }: { itens: Prioridade[]; resumo: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Cabecalho titulo="Prioridades agora" nota={`${resumo} Ranqueadas por regra do ERP, não pela IA.`} />

      {itens.length === 0 ? (
        <Tranquilo texto="Caixa, conciliação, estoque e lançamentos conferidos: nada exige decisão agora." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map((p) => (
            <ItemDaFila key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Um item com os SETE campos que o escopo §7.1 exige. */
function ItemDaFila({ p }: { p: Prioridade }) {
  const t = TOM[p.severidade]
  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        padding: '13px 15px',
        borderRadius: 13,
        background: t.fundo,
        border: `1px solid ${t.borda}`,
        minWidth: 0,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: t.cor, display: 'grid', placeItems: 'center', marginTop: 1 }}>
          <Ico n={t.icone} tamanho={15} />
        </span>
        <h3
          className="font-display"
          style={{
            margin: 0,
            flex: 1,
            minWidth: 180,
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--color-tinta)',
          }}
        >
          {p.titulo}
        </h3>
        <span
          className="font-sans"
          style={{
            flex: 'none',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '.09em',
            textTransform: 'uppercase',
            color: t.cor,
            border: `1px solid ${t.borda}`,
            borderRadius: 'var(--radius-chip)',
            padding: '4px 8px',
          }}
        >
          {ROTULO_DA_SEVERIDADE[p.severidade]}
        </span>
      </header>

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '9px 18px',
        }}
      >
        {p.impactoFinanceiro !== null && (
          <Campo rotulo="Impacto financeiro">
            <span style={{ color: p.impactoFinanceiro < 0 ? COR.erro : COR.ouro, fontWeight: 600 }}>
              {brl(p.impactoFinanceiro)}
            </span>
          </Campo>
        )}
        <Campo rotulo="Impacto operacional">{p.impactoOperacional}</Campo>
        <Campo rotulo="Urgência">{p.urgencia}</Campo>
        <Campo rotulo={NIVEL_DA_CONFIANCA[p.confianca.nivel]}>{p.confianca.motivo}</Campo>
      </dl>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          paddingTop: 9,
          borderTop: `1px solid ${t.borda}`,
        }}
      >
        <span
          className="font-sans"
          style={{ fontSize: 10.5, color: 'rgba(242,237,227,.42)' }}
        >
          Responsável sugerido: <strong style={{ fontWeight: 600 }}>{p.responsavel}</strong>
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <Link
          href={p.proximaAcao.href}
          className="font-sans hover:brightness-125"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            color: t.cor,
            textDecoration: 'none',
          }}
        >
          {p.proximaAcao.texto}
          <Ico n="chevron" tamanho={12} />
        </Link>
      </footer>
    </article>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <dt
        className="font-sans"
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'rgba(242,237,227,.32)',
        }}
      >
        {rotulo}
      </dt>
      <dd
        className="font-sans"
        style={{
          margin: 0,
          fontSize: 11.5,
          lineHeight: 1.45,
          color: 'rgba(242,237,227,.72)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </dd>
    </div>
  )
}

// ── §7.2: briefing executivo ───────────────────────────────────────────────

export function BriefingExecutivo({ briefing }: { briefing: Briefing }) {
  const vazio =
    briefing.mudou.length === 0 &&
    briefing.exigeAcao.length === 0 &&
    briefing.acompanhar.length === 0
  // O escopo manda não repetir indicador estável sem motivo. Briefing sem
  // notícia não vira briefing com "tudo normal" repetido todo dia: some.
  if (vazio) return null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Cabecalho titulo="Briefing executivo" nota="No máximo cinco assuntos, sem repetir o que não mudou." />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 10,
        }}
      >
        <Secao titulo="O que mudou" itens={briefing.mudou} tom={COR.info} />
        <Secao titulo="O que exige ação" itens={briefing.exigeAcao} tom={COR.atencao} />
        <Secao titulo="O que acompanhar" itens={briefing.acompanhar} tom={COR.neutro} />
      </div>
    </section>
  )
}

function Secao({ titulo, itens, tom }: { titulo: string; itens: string[]; tom: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '13px 15px',
        borderRadius: 13,
        border: '1px solid var(--color-borda)',
        background: '#0F0F10',
        minWidth: 0,
      }}
    >
      <span
        className="font-sans"
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '.11em',
          textTransform: 'uppercase',
          color: tom,
        }}
      >
        {titulo}
      </span>
      {itens.length === 0 ? (
        <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.28)' }}>
          Nada aqui.
        </span>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {itens.map((t, i) => (
            <li
              key={i}
              className="font-sans"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                fontSize: 11.5,
                lineHeight: 1.45,
                color: 'rgba(242,237,227,.72)',
                textWrap: 'pretty',
              }}
            >
              <span
                aria-hidden
                style={{ width: 4, height: 4, flex: 'none', transform: 'rotate(45deg)', background: tom }}
              />
              <span style={{ minWidth: 0 }}>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── §3.1: resumo executivo do dia ──────────────────────────────────────────

export function ResumoDoDia({ e }: { e: ResumoExecutivo }) {
  const celulas: { rotulo: string; valor: string; nota: string; icone: NomeIcone; href: string }[] = [
    { rotulo: 'Vendas', valor: brl(e.vendas.valor), nota: e.vendas.rotulo, icone: 'cifrao', href: '/relatorios' },
    { rotulo: 'Pedidos', valor: String(e.pedidos.qtd), nota: e.pedidos.rotulo, icone: 'caixa', href: '/pedidos' },
    { rotulo: 'Estoque', valor: String(e.estoque.criticos), nota: e.estoque.rotulo, icone: 'frasco', href: '/estoque' },
    { rotulo: 'Produção', valor: String(e.producao.qtd), nota: e.producao.rotulo, icone: 'lista', href: '/envase' },
    { rotulo: 'Caixa', valor: brl(e.caixa.valor), nota: e.caixa.rotulo, icone: 'carteira', href: '/financeiro' },
    { rotulo: 'Margem', valor: `${e.margem.pct.toFixed(1)}%`, nota: e.margem.rotulo, icone: 'porcento', href: '/financeiro/dre' },
    { rotulo: 'CRM', valor: String(e.crm.qtd), nota: e.crm.rotulo, icone: 'pessoas', href: '/crm' },
  ]

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Cabecalho titulo="Resumo executivo do dia" nota="Os mesmos números das telas, sem recálculo." />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
        }}
      >
        {celulas.map((c) => (
          <Link
            key={c.rotulo}
            href={c.href}
            className="hover:brightness-125"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--color-borda)',
              background: '#0F0F10',
              textDecoration: 'none',
              minWidth: 0,
            }}
          >
            <span
              className="font-sans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '.11em',
                textTransform: 'uppercase',
                color: 'rgba(242,237,227,.34)',
              }}
            >
              <Ico n={c.icone} tamanho={12} />
              {c.rotulo}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.1,
                color: 'var(--color-tinta)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.valor}
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 10, lineHeight: 1.35, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
            >
              {c.nota}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Compartilhados ─────────────────────────────────────────────────────────

function Cabecalho({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <h2
        className="font-display"
        style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-tinta)' }}
      >
        {titulo}
      </h2>
      <span
        className="font-sans"
        style={{ fontSize: 11, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
      >
        {nota}
      </span>
    </div>
  )
}

function Tranquilo({ texto }: { texto: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 15px',
        borderRadius: 12,
        background: FAIXA.ok,
        border: `1px solid ${BORDA.ok}`,
      }}
    >
      <span style={{ color: COR.ok, display: 'grid', placeItems: 'center' }}>
        <Ico n="check" tamanho={15} />
      </span>
      <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.7)' }}>
        {texto}
      </span>
    </div>
  )
}
