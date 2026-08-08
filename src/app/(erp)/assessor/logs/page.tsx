import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import type { ComandoIa } from '@/data/fixtures'
import { repositorio } from '@/data/repository'

const TOM_ESTADO: Record<ComandoIa['estado'], Tom> = {
  Executado: 'ok',
  Recusado: 'erro',
  Aguardando: 'atencao',
}

export default async function LogsIa() {
  const repo = repositorio()
  const [comandos, autorizados] = await Promise.all([repo.iaComandos(), repo.iaAutorizados()])

  const totalMes = autorizados.reduce((a, u) => a + u.comandos, 0)
  const hoje = comandos.filter((c) => c.quando.startsWith('hoje'))
  const executadosHoje = hoje.filter((c) => c.estado === 'Executado').length
  const aguardando = comandos.filter((c) => c.estado === 'Aguardando').length
  const recusados = comandos.filter((c) => c.estado === 'Recusado').length

  const kpis: Kpi[] = [
    {
      label: 'Comandos no mês',
      valor: String(totalMes),
      hint: 'Somando todos os números autorizados',
    },
    {
      label: 'Registros exibidos',
      valor: String(comandos.length),
      hint: `${executadosHoje} executados hoje · ${recusados} recusados`,
    },
    {
      label: 'Aguardando você',
      valor: String(aguardando),
      hint: aguardando ? 'Precisa de confirmação para seguir' : 'Nada pendente',
      tom: aguardando ? 'atencao' : 'ok',
    },
    {
      label: 'Tempo médio',
      valor: '38s',
      hint: 'Do áudio à ação registrada',
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<ComandoIa>[] = [
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '104px',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.5)', whiteSpace: 'nowrap' }}>
          {c.quando}
        </span>
      ),
    },
    {
      chave: 'canal',
      titulo: 'Canal',
      largura: '124px',
      render: (c) => (
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
          {c.canal}
        </span>
      ),
    },
    {
      chave: 'autor',
      titulo: 'Autor',
      largura: '124px',
      render: (c) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.3,
            color: c.autor === 'Número desconhecido' ? 'rgba(242,237,227,.45)' : 'rgba(242,237,227,.72)',
            textWrap: 'pretty',
          }}
        >
          {c.autor}
        </span>
      ),
    },
    {
      chave: 'comando',
      titulo: 'Comando',
      largura: 'minmax(0,1.4fr)',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(242,237,227,.78)', textWrap: 'pretty' }}>
            {c.comando}
          </span>
          <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.35, color: 'rgba(239,209,140,.5)', textWrap: 'pretty' }}>
            {c.interpretacao}
          </span>
        </span>
      ),
    },
    {
      chave: 'resultado',
      titulo: 'Resultado',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}>
          {c.resultado}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '116px',
      render: (c) => <Badge tom={TOM_ESTADO[c.estado]}>{c.estado}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <TituloSecao tamanho={16}>Tudo que foi pedido à IA</TituloSecao>

      <Tabela
        colunas={colunas}
        itens={comandos}
        chaveDe={(c) => `${c.quando}-${c.comando}`}
        bandeiraDe={(c) => (c.estado === 'Recusado' ? 'erro' : c.estado === 'Aguardando' ? 'atencao' : null)}
      />
    </div>
  )
}
