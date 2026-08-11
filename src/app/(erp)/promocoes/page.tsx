import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, FaixaAlerta } from '@/components/erp/primitivos'
import { lerCuponsYampi, type CupomYampi } from '@/data/yampi-crm'
import { yampiConfigurada } from '@/data/yampi'
import { plural } from '@/domain'

import { ListaCupons, type Situacao } from './ListaCupons'
import { NovoCupom } from './NovoCupom'

export const dynamic = 'force-dynamic'

/**
 * Cupons, lidos ao vivo da Yampi.
 *
 * O checkout é dela — o cupom que vale é o que está publicado lá, não uma
 * cópia local. A tela mostra o estado real de cada código: vigência, usos
 * contra o limite e o que está para expirar. Busca, filtros e ordenação
 * vivem no cliente (`ListaCupons`); aqui é a leitura e os totais.
 */

function situacaoDe(c: CupomYampi, agora: number): Situacao {
  if (!c.ativo) return 'Pausado'
  if (c.expiraEm && new Date(c.expiraEm).getTime() < agora) return 'Expirado'
  if (c.comecaEm && new Date(c.comecaEm).getTime() > agora) return 'Agendado'
  if (c.limite !== null && c.usos >= c.limite) return 'Esgotado'
  return 'Ativo'
}

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
      <FaixaAlerta
        tom="erro"
        texto={`A Yampi não respondeu a leitura de cupons: ${erro ?? 'sem detalhe'}. Esta tela lê ao vivo — recarregue quando a conexão voltar.`}
      />
    )
  }

  const agora = Date.now()
  const cupons = leitura.cupons.map((c) => ({ ...c, situacao: situacaoDe(c, agora) }))
  const ativos = cupons.filter((c) => c.situacao === 'Ativo')
  const usosTotais = cupons.reduce((a, c) => a + c.usos, 0)
  const seteDias = agora + 7 * 24 * 60 * 60 * 1000
  const expirando = ativos.filter((c) => c.expiraEm && new Date(c.expiraEm).getTime() <= seteDias)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {expirando.length > 0 && (
        <FaixaAlerta
          tom="atencao"
          texto={
            expirando.length === 1
              ? `${expirando[0].codigo} expira em breve. Se a campanha continua, renove antes do checkout recusar o código.`
              : `${plural(expirando.length, 'cupom expira', 'cupons expiram')} nos próximos 7 dias: ${expirando.map((c) => c.codigo).join(', ')}.`
          }
        />
      )}

      <ListaCupons cupons={cupons} />
    </div>
  )
}
