import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, FaixaAlerta, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import { lerCuponsYampi, type CupomYampi } from '@/data/yampi-crm'
import { yampiConfigurada } from '@/data/yampi'
import { plural } from '@/domain'

import { AcoesCupom, LoteCupons } from './GerirCupons'
import { NovoCupom } from './NovoCupom'

export const dynamic = 'force-dynamic'

/**
 * Cupons, lidos ao vivo da Yampi.
 *
 * O checkout é dela — o cupom que vale é o que está publicado lá, não uma
 * cópia local. A tela mostra o estado real de cada código: vigência, usos
 * contra o limite e o que está para expirar.
 */

function dataBr(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

type Situacao = 'Ativo' | 'Expirado' | 'Esgotado' | 'Pausado' | 'Agendado'

function situacaoDe(c: CupomYampi, agora: number): Situacao {
  if (!c.ativo) return 'Pausado'
  if (c.expiraEm && new Date(c.expiraEm).getTime() < agora) return 'Expirado'
  if (c.comecaEm && new Date(c.comecaEm).getTime() > agora) return 'Agendado'
  if (c.limite !== null && c.usos >= c.limite) return 'Esgotado'
  return 'Ativo'
}

const TOM_SITUACAO = {
  Ativo: 'ok',
  Expirado: 'neutro',
  Esgotado: 'atencao',
  Pausado: 'neutro',
  Agendado: 'info',
} as const

export default async function Cupons() {
  if (!yampiConfigurada()) {
    return (
      <EstadoVazio
        titulo="Yampi não configurada"
        instrucao="Os cupons vivem no checkout da Yampi. Configure YAMPI_ALIAS, YAMPI_USER_TOKEN e YAMPI_SECRET_KEY no .env.local."
      />
    )
  }

  let leitura: Awaited<ReturnType<typeof lerCuponsYampi>> | null = null
  let erro: string | null = null
  try {
    leitura = await lerCuponsYampi()
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  if (erro || !leitura) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <FaixaAlerta
          tom="erro"
          texto={`A Yampi não respondeu a leitura de cupons: ${erro ?? 'sem detalhe'}. Esta tela lê ao vivo — recarregue quando a conexão voltar.`}
        />
      </div>
    )
  }

  const agora = Date.now()
  const cupons = leitura.cupons.map((c) => ({ ...c, situacao: situacaoDe(c, agora) }))
  const ativos = cupons.filter((c) => c.situacao === 'Ativo')
  const usosTotais = cupons.reduce((a, c) => a + c.usos, 0)
  const seteDias = agora + 7 * 24 * 60 * 60 * 1000
  const expirando = ativos.filter(
    (c) => c.expiraEm && new Date(c.expiraEm).getTime() <= seteDias,
  )
  const semFreio = ativos.filter((c) => c.limite === null && !c.expiraEm)

  if (cupons.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <NovoCupom />
        </div>
        <EstadoVazio
          titulo="Nenhum cupom publicado"
          instrucao="A Yampi respondeu, mas não há cupons no checkout. Crie o primeiro aqui em cima — o ERP publica direto lá."
        />
      </div>
    )
  }

  const kpis: Kpi[] = [
    {
      label: 'Cupons ativos',
      valor: String(ativos.length),
      hint: `${cupons.length} cadastrados no checkout`,
      tom: 'ouro',
    },
    {
      label: 'Usos acumulados',
      valor: String(usosTotais),
      hint: 'Somando todos os códigos',
    },
    {
      label: 'Expirando em 7 dias',
      valor: String(expirando.length),
      hint: expirando.length
        ? expirando.map((c) => c.codigo).slice(0, 3).join(', ')
        : 'Nenhum vencimento próximo',
      tom: expirando.length ? 'atencao' : 'ok',
    },
    {
      label: 'Sem limite nem prazo',
      valor: String(semFreio.length),
      hint: semFreio.length ? 'Descontos sem data para acabar' : 'Todos têm freio',
      tom: semFreio.length ? 'atencao' : 'ok',
    },
  ]

  const colunas: Coluna<(typeof cupons)[number]>[] = [
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '150px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-ouro)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.codigo}
          </span>
          {c.descricao && (
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.descricao}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'regra',
      titulo: 'Regra',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span className="font-sans" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}>
          {c.regra}
        </span>
      ),
    },
    {
      chave: 'usos',
      titulo: 'Usos',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => {
        const pctUsos = c.limite ? Math.min(100, Math.round((c.usos / c.limite) * 100)) : null
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
              {c.limite ? `${c.usos} / ${c.limite}` : plural(c.usos, 'uso', 'usos')}
            </span>
            {pctUsos !== null && (
              <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${pctUsos}%`,
                    background: pctUsos > 80 ? COR.atencao : 'rgba(239,209,140,.55)',
                    borderRadius: 2,
                  }}
                />
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'vigencia',
      titulo: 'Vigência',
      largura: '150px',
      render: (c) => {
        const inicio = dataBr(c.comecaEm)
        const fim = dataBr(c.expiraEm)
        return (
          <Valor tamanho={11.5}>
            {inicio && fim ? `${inicio} → ${fim}` : fim ? `até ${fim}` : inicio ? `desde ${inicio}` : 'Sem prazo'}
          </Valor>
        )
      },
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '96px',
      render: (c) => <Badge tom={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '108px',
      render: (c) => <AcoesCupom cupom={c} />,
    },
  ]

  const semRegra = cupons.filter((c) => c.regra === 'Regra não informada pela Yampi')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Cupons do checkout</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Lidos ao vivo da Yampi — o que está aqui é o que o checkout aceita agora
        </span>
        <div style={{ flex: 1 }} />
        <LoteCupons />
        <NovoCupom />
      </div>

      {expirando.length > 0 && (
        <FaixaAlerta
          tom="atencao"
          texto={
            expirando.length === 1
              ? `${expirando[0].codigo} expira em ${dataBr(expirando[0].expiraEm)}. Se a campanha continua, renove no painel da Yampi antes do checkout recusar o código.`
              : `${expirando.length} cupons expiram nos próximos 7 dias: ${expirando.map((c) => c.codigo).join(', ')}.`
          }
        />
      )}

      <Tabela
        colunas={colunas}
        itens={cupons}
        chaveDe={(c) => c.codigo}
        bandeiraDe={(c) => (c.situacao === 'Esgotado' ? 'atencao' : null)}
      />

      {semRegra.length > 0 && (
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
          {`${plural(semRegra.length, 'cupom veio', 'cupons vieram')} sem regra legível. Campos que a Yampi devolveu: ${leitura.camposCrus.join(', ') || 'nenhum'}.`}
        </span>
      )}
    </div>
  )
}
