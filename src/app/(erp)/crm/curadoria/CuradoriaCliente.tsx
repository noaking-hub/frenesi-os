'use client'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { PainelDaCuradoria } from '@/data/quiz'
import { brl, plural } from '@/domain'

/**
 * O painel da Curadoria Olfativa.
 *
 * Três perguntas, nesta ordem: o quiz está trazendo gente? (ritmo e leads),
 * o que essa gente quer? (perfumes clicados e perfil olfativo), e isso vira
 * dinheiro? (cupons usados e receita). Tudo derivado das respostas
 * importadas — nada aqui é editável, porque o fato acontece no quiz.
 */

const dataBr = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

const ROTULO_TITULO: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgba(242,237,227,.45)',
}

function Barra({ rotulo, qtd, maior, tom }: { rotulo: string; qtd: number; maior: number; tom?: 'ouro' }) {
  const largura = Math.max(4, Math.round((qtd / Math.max(1, maior)) * 100))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,220px) 1fr auto', gap: 10, alignItems: 'center' }}>
      <span
        className="font-sans"
        style={{ fontSize: 11.5, lineHeight: 1.3, color: 'rgba(242,237,227,.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {rotulo}
      </span>
      <span style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            width: `${largura}%`,
            height: '100%',
            borderRadius: 4,
            background: tom === 'ouro' ? 'rgba(239,209,140,.75)' : 'rgba(242,237,227,.32)',
          }}
        />
      </span>
      <span className="font-mono" style={{ fontSize: 11, color: tom === 'ouro' ? COR.ouro : 'rgba(242,237,227,.6)', whiteSpace: 'nowrap' }}>
        {qtd}
      </span>
    </div>
  )
}

export function CuradoriaCliente({ painel }: { painel: PainelDaCuradoria }) {
  const kpis: Kpi[] = [
    {
      label: 'Interações no quiz',
      valor: String(painel.interacoes),
      hint: 'cliques em recomendações, desde o início',
    },
    {
      label: 'Leads capturados',
      valor: String(painel.leads),
      hint: 'deixaram e-mail em troca do cupom',
      tom: painel.leads ? 'ok' : 'neutro',
    },
    {
      label: 'Viraram clientes',
      valor: String(painel.viraramClientes),
      hint: painel.leads
        ? `${Math.round((painel.viraramClientes / painel.leads) * 100)}% dos leads têm cadastro de cliente`
        : 'nenhum lead ainda',
    },
    {
      label: 'Cupons usados',
      valor: painel.leads ? `${painel.cuponsUsados} de ${painel.leads}` : '—',
      hint: 'CURA10 aplicado em pedido pago',
      tom: painel.cuponsUsados ? 'ok' : 'neutro',
    },
    {
      label: 'Receita via cupom',
      valor: brl(painel.receitaViaCupom),
      hint: 'atribuição determinística — o pedido usou o código',
      tom: painel.receitaViaCupom ? 'ouro' : 'neutro',
    },
    {
      label: 'Receita pós-resposta',
      valor: brl(painel.receitaPorJanela),
      hint: 'pedidos pagos do mesmo e-mail depois do quiz',
    },
  ]

  const maiorPerfume = Math.max(1, ...painel.topPerfumes.map((p) => p.cliques))
  const maiorDia = Math.max(1, ...painel.cliquesPorDia.map((d) => d.qtd))

  const colunas: Coluna<PainelDaCuradoria['leadsRecentes'][number]>[] = [
    {
      chave: 'email',
      titulo: 'Lead',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {l.email}
        </span>
      ),
    },
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '90px',
      alinhamento: 'right',
      render: (l) => (
        <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.55)' }}>{dataBr(l.quando)}</span>
      ),
    },
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '150px',
      render: (l) =>
        l.cupom ? (
          <span className="font-mono" style={{ fontSize: 11, color: l.cupomUsado ? COR.ok : 'rgba(239,209,140,.7)' }}>
            {l.cupom}
          </span>
        ) : (
          <span style={{ color: 'rgba(242,237,227,.3)' }}>—</span>
        ),
    },
    {
      chave: 'estado',
      titulo: 'Situação',
      largura: '130px',
      render: (l) =>
        l.cupomUsado ? (
          <Badge tom="ok">comprou com cupom</Badge>
        ) : l.virouCliente ? (
          <Badge tom="ouro">é cliente</Badge>
        ) : (
          <Badge tom="neutro">lead</Badge>
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {painel.desviados.length > 0 && (
        <span
          className="font-sans"
          style={{
            padding: '9px 13px',
            borderRadius: 10,
            border: '1px solid rgba(230,180,80,.35)',
            background: 'rgba(230,180,80,.08)',
            color: COR.atencao,
            fontSize: 11.5,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {`${plural(painel.desviados.length, 'cupom usado', 'cupons usados')} por e-mail diferente do dono: `}
          {painel.desviados.slice(0, 3).map((d) => `${d.cupom} (${d.pedido})`).join(' · ')}
          {' — o código é de uso único, mas padrão repetido é farming.'}
        </span>
      )}

      <div className="empilha-1100" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <TituloSecao tamanho={13.5}>Perfumes mais desejados</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              cliques nas recomendações do quiz
            </span>
          </div>
          {painel.topPerfumes.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              Nenhum clique registrado ainda.
            </span>
          ) : (
            painel.topPerfumes.map((p) => (
              <Barra key={p.nome} rotulo={p.nome} qtd={p.cliques} maior={maiorPerfume} tom="ouro" />
            ))
          )}
        </section>

        <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <TituloSecao tamanho={13.5}>Perfil olfativo do público</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              as respostas mais comuns, pergunta a pergunta
            </span>
          </div>
          {painel.perfil.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              As respostas ainda não trazem perfil legível.
            </span>
          ) : (
            painel.perfil.map((p) => (
              <div key={p.pergunta} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="font-sans" style={ROTULO_TITULO}>{p.pergunta.replace(/_/g, ' ')}</span>
                {p.valores.map((v) => (
                  <Barra
                    key={v.valor}
                    rotulo={v.valor}
                    qtd={v.qtd}
                    maior={Math.max(1, ...p.valores.map((x) => x.qtd))}
                  />
                ))}
              </div>
            ))
          )}
        </section>
      </div>

      {painel.cliquesPorDia.length > 0 && (
        <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <TituloSecao tamanho={13.5}>Ritmo do quiz</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              interações por dia · últimos 30 dias
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 64, overflowX: 'auto', paddingBottom: 2 }}>
            {painel.cliquesPorDia.map((d) => (
              <div key={d.dia} title={`${dataBr(d.dia)} · ${d.qtd}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 18 }}>
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: Math.max(3, Math.round((d.qtd / maiorDia) * 52)),
                    background: 'rgba(239,209,140,.65)',
                    borderRadius: 2,
                  }}
                />
                <span className="font-mono" style={{ fontSize: 8.5, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                  {dataBr(d.dia).slice(0, 5)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Tabela
        colunas={colunas}
        itens={painel.leadsRecentes}
        chaveDe={(l) => `${l.email}-${l.quando}`}
        cabecalho={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid var(--color-borda)' }}>
            <TituloSecao tamanho={13}>Leads recentes</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              um cupom por e-mail · o perfil de cada lead fica guardado junto da resposta
            </span>
          </div>
        }
        vazio={
          <div style={{ padding: '24px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum lead ainda — eles aparecem aqui assim que alguém deixar o e-mail no quiz.
            </span>
          </div>
        }
      />
    </div>
  )
}
