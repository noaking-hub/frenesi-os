import { Sidebar } from '@/components/erp/Sidebar'
import { Topbar } from '@/components/erp/Topbar'
import { carregarDashboard } from '@/data/consultas'
import { sessaoAtual } from '@/data/sessao'
import { origemDados } from '@/data/repository'

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  // O chip do topo agora ABRE a lista, então ele recebe as pendências
  // inteiras: a contagem que ele exibe é o tamanho do que ele mostra ao ser
  // clicado — uma grandeza, um cálculo, sem chance de o número dizer sete e a
  // lista trazer outra coisa.
  const [{ pendencias }, usuario] = await Promise.all([carregarDashboard(), sessaoAtual()])
  const alertas = pendencias.filter((p) => p.contagem > 0 && p.tom !== 'ouro')

  return (
    <div
      className="erp superficie-erp"
      style={{ display: 'flex', minHeight: '100vh' }}
    >
      <Sidebar origem={origemDados()} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar alertas={alertas} usuario={usuario} />
        <div
          className="animate-[fr-in_.32s_ease_both] conteudo-erp"
          style={{ flex: 1, padding: '26px 30px 46px' }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
