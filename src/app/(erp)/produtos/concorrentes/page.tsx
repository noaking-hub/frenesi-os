import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { VARIANTES, brl, nomeCurtoPerfume, plural } from '@/domain'

import { BuscaPrecos } from './BuscaPrecos'
import { FontesCliente, type TituloSemDono } from './FontesCliente'

export const dynamic = 'force-dynamic'

/**
 * O painel de mercado: a busca (a pergunta de todo dia), a NOSSA posição
 * contra o mercado produto a produto, os movimentos de preço dos
 * concorrentes desde a última vasculhada — e, por fim, a manutenção das
 * fontes.
 */

async function lerSemDono(): Promise<TituloSemDono[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('concorrente_precos')
    .select('titulo, preco, variante, concorrentes(nome)')
    .is('base_id', null)
    .order('titulo')
    .limit(200)
  if (error) throw error
  return (
    (data ?? []) as unknown as {
      titulo: string
      preco: number | string
      variante: number | null
      concorrentes: { nome: string } | null
    }[]
  ).map((l) => ({
    titulo: l.titulo,
    preco: Number(l.preco),
    variante: l.variante,
    fonte: l.concorrentes?.nome ?? '—',
  }))
}

interface PosicaoLinha {
  nome: string
  variante: number
  nosso: number
  menor: number
  fonteMenor: string
  diferenca: number
}

interface Mudanca {
  fonte: string
  titulo: string
  variante: number | null
  tipo: 'subiu' | 'baixou' | 'entrou' | 'saiu'
  precoDe: number | null
  precoPara: number | null
  quando: string
  /** O concorrente ficou abaixo do NOSSO preço publicado — chamada para ação. */
  furouNosso: boolean
}

/** Nossa posição × mercado, pelos vínculos que a coleta grava (base_id). */
async function visaoDeMercado(): Promise<{
  acima: PosicaoLinha[]
  abaixo: number
  soNossos: number
  comparados: number
  mudancas: Mudanca[]
}> {
  const vazio = { acima: [], abaixo: 0, soNossos: 0, comparados: 0, mudancas: [] }
  if (!supabaseConfigurado()) return vazio
  const sb = supabaseServer()

  const quatorzeDias = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [{ data: precos }, { data: nossos }, { data: bases }, { data: mudancasCruas }] =
    await Promise.all([
      sb.from('concorrente_precos').select('base_id, variante, preco, concorrentes(nome)').not('base_id', 'is', null).not('variante', 'is', null).limit(8000),
      sb.from('produtos_derivados').select('base_id, variante, preco_praticado').gt('preco_praticado', 0).limit(5000),
      sb.from('perfumes_base').select('id, nome').limit(2000),
      sb.from('concorrente_mudancas').select('titulo, variante, tipo, preco_de, preco_para, ocorrida_em, base_id, concorrentes:concorrente_id(nome)').gte('ocorrida_em', quatorzeDias).order('ocorrida_em', { ascending: false }).limit(400),
    ])

  const nomeDe = new Map(((bases ?? []) as { id: string; nome: string }[]).map((b) => [b.id, b.nome]))
  const nossoDe = new Map(
    ((nossos ?? []) as { base_id: string; variante: number; preco_praticado: number | string }[]).map(
      (n) => [`${n.base_id}|${n.variante}`, Number(n.preco_praticado)],
    ),
  )

  // Menor do mercado por (base, variante), com a fonte dona do menor.
  const menorDe = new Map<string, { preco: number; fonte: string }>()
  for (const p of (precos ?? []) as unknown as {
    base_id: string
    variante: number
    preco: number | string
    concorrentes: { nome: string } | null
  }[]) {
    const chave = `${p.base_id}|${p.variante}`
    const preco = Number(p.preco)
    const atual = menorDe.get(chave)
    if (!atual || preco < atual.preco) {
      menorDe.set(chave, { preco, fonte: p.concorrentes?.nome ?? '—' })
    }
  }

  const acima: PosicaoLinha[] = []
  let abaixo = 0
  let comparados = 0
  for (const [chave, nosso] of nossoDe) {
    const mercado = menorDe.get(chave)
    if (!mercado) continue
    comparados++
    const [baseId, variante] = chave.split('|')
    if (nosso > mercado.preco) {
      acima.push({
        nome: nomeCurtoPerfume(nomeDe.get(baseId) ?? baseId),
        variante: Number(variante),
        nosso,
        menor: mercado.preco,
        fonteMenor: mercado.fonte,
        diferenca: nosso - mercado.preco,
      })
    } else {
      abaixo++
    }
  }
  acima.sort((a, b) => b.diferenca - a.diferenca)

  const mudancas: Mudanca[] = ((mudancasCruas ?? []) as unknown as {
    titulo: string
    variante: number | null
    tipo: Mudanca['tipo']
    preco_de: number | string | null
    preco_para: number | string | null
    ocorrida_em: string
    base_id: string | null
    concorrentes: { nome: string } | null
  }[]).map((m) => {
    const nosso = m.base_id && m.variante ? nossoDe.get(`${m.base_id}|${m.variante}`) : undefined
    const para = m.preco_para === null ? null : Number(m.preco_para)
    return {
      fonte: m.concorrentes?.nome ?? '—',
      titulo: nomeCurtoPerfume(m.titulo),
      variante: m.variante,
      tipo: m.tipo,
      precoDe: m.preco_de === null ? null : Number(m.preco_de),
      precoPara: para,
      quando: m.ocorrida_em,
      furouNosso: Boolean(nosso && para !== null && m.tipo === 'baixou' && para < nosso),
    }
  })

  return { acima, abaixo, soNossos: nossoDe.size - comparados, comparados, mudancas: mudancas.slice(0, 30) }
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export default async function Concorrentes() {
  const repo = repositorio()
  const [bases, fontes, semDono, mercado] = await Promise.all([
    repo.perfumesBase(),
    repo.concorrentesFontes(),
    lerSemDono(),
    visaoDeMercado(),
  ])

  const atualizadoEm =
    fontes
      .map((f) => f.quando)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

  const furos = mercado.mudancas.filter((m) => m.furouNosso)
  const kpis: Kpi[] = [
    {
      label: 'Produtos comparados',
      valor: String(mercado.comparados),
      hint: `${mercado.soNossos} nossos sem concorrência mapeada`,
      tom: 'ouro',
    },
    {
      label: 'Estamos mais caros em',
      valor: String(mercado.acima.length),
      hint: mercado.acima[0]
        ? `pior caso: ${mercado.acima[0].nome} · ${brl(mercado.acima[0].diferenca)} acima`
        : 'Nenhum — mercado coberto',
      tom: mercado.acima.length ? 'atencao' : 'ok',
    },
    {
      label: 'Menor preço é nosso em',
      valor: String(mercado.abaixo),
      hint: 'Empate conta a nosso favor',
      tom: 'ok',
    },
    {
      label: 'Movimentos em 14 dias',
      valor: String(mercado.mudancas.length),
      hint: furos.length
        ? `${plural(furos.length, 'corte furou', 'cortes furaram')} nosso preço`
        : 'Nenhum corte abaixo do nosso preço',
      tom: furos.length ? 'erro' : 'neutro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <BuscaPrecos atualizadoEm={atualizadoEm} />

      {mercado.comparados > 0 && <FaixaKpis kpis={kpis} />}

      <div className="empilha-1180" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <section style={{ background: 'var(--color-mesa)', border: '1px solid var(--color-borda)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Onde o mercado nos bate</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.35)' }}>
              nosso preço publicado × menor do mercado
            </span>
          </div>
          {mercado.acima.length === 0 ? (
            <div style={{ padding: '26px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
                {mercado.comparados === 0
                  ? 'Ainda não há produto nosso com preço publicado E concorrência mapeada — a comparação nasce da vasculhada + preços publicados na Precificação.'
                  : 'Nenhum produto nosso está acima do menor do mercado. Posição dominante.'}
              </span>
            </div>
          ) : (
            mercado.acima.slice(0, 10).map((l) => (
              <div key={`${l.nome}|${l.variante}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 104px 104px', gap: 11, alignItems: 'center', padding: '11px 18px', borderTop: '1px solid var(--color-borda-sutil)' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="font-sans" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {`${l.nome} · ${l.variante} ml`}
                  </span>
                  <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.4)' }}>
                    {`menor é da ${l.fonteMenor}`}
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.6)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {brl(l.menor)}
                </span>
                <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--color-corrente)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {`nós ${brl(l.nosso)}`}
                </span>
                <span className="font-mono" style={{ fontWeight: 600, fontSize: 11.5, color: COR.atencao, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {`+${brl(l.diferenca)}`}
                </span>
              </div>
            ))
          )}
          {mercado.acima.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
                A decisão de acompanhar ou segurar é na Precificação — lá o menor do mercado aparece ao lado da margem.
              </span>
            </div>
          )}
        </section>

        <section style={{ background: 'var(--color-mesa)', border: '1px solid var(--color-borda)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Movimentos do mercado</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.35)' }}>
              últimos 14 dias
            </span>
          </div>
          {mercado.mudancas.length === 0 ? (
            <div style={{ padding: '26px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
                Nenhuma mudança registrada ainda. O registro nasce na comparação entre duas vasculhadas — a partir da próxima coleta, subidas, cortes e produtos novos dos concorrentes aparecem aqui.
              </span>
            </div>
          ) : (
            mercado.mudancas.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderTop: '1px solid var(--color-borda-sutil)', borderLeft: m.furouNosso ? `2px solid ${COR.erro}` : '2px solid transparent' }}>
                <Badge tom={m.tipo === 'baixou' ? 'erro' : m.tipo === 'subiu' ? 'ok' : 'neutro'}>
                  {m.tipo === 'baixou' ? '↓ baixou' : m.tipo === 'subiu' ? '↑ subiu' : m.tipo === 'entrou' ? 'novo' : 'saiu'}
                </Badge>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="font-sans" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.titulo}
                    {m.variante ? ` · ${m.variante} ml` : ''}
                  </span>
                  <span className="font-sans" style={{ fontSize: 9.5, color: m.furouNosso ? COR.erro : 'rgba(242,237,227,.4)' }}>
                    {`${m.fonte} · ${dataHora(m.quando)}${m.furouNosso ? ' · FICOU ABAIXO DO NOSSO PREÇO' : ''}`}
                  </span>
                </span>
                <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
                  {m.precoDe !== null && m.precoPara !== null
                    ? `${brl(m.precoDe)} → ${brl(m.precoPara)}`
                    : m.precoPara !== null
                      ? brl(m.precoPara)
                      : m.precoDe !== null
                        ? brl(m.precoDe)
                        : ''}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      <FontesCliente fontes={fontes} bases={bases} semDono={semDono} variantes={VARIANTES} />
    </div>
  )
}
