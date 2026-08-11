import { Sidebar } from '@/components/erp/Sidebar'
import { Topbar } from '@/components/erp/Topbar'
import { carregarDashboard } from '@/data/consultas'
import { origemDados } from '@/data/repository'

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  // A contagem de alertas do topo é a mesma que alimenta as pendências do
  // Dashboard — uma grandeza, um cálculo.
  const { pendencias } = await carregarDashboard()
  const alertas = pendencias.filter((p) => p.contagem > 0 && p.tom !== 'ouro').length

  return (
    <div
      className="erp superficie-erp"
      style={{ display: 'flex', minHeight: '100vh', minWidth: 1366 }}
    >
      <Sidebar origem={origemDados()} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar alertas={alertas} />
        <div
          className="animate-[fr-in_.32s_ease_both]"
          style={{ flex: 1, padding: '26px 30px 46px' }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
