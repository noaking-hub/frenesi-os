import { EstadoVazio } from '@/components/erp/primitivos'
import { sessaoAtual } from '@/data/sessao'

import { listarUsuarios } from '../../perfil/actions'
import { UsuariosCliente } from './UsuariosCliente'

export const dynamic = 'force-dynamic'

export default async function Usuarios() {
  const eu = await sessaoAtual()

  // A checagem se repete aqui e nas ações de propósito: a tela esconde, mas
  // quem esconde não protege — quem protege é o servidor, em cada chamada.
  if (!eu) {
    return (
      <EstadoVazio
        titulo="Sem sessão"
        instrucao="Entre no ERP para administrar os acessos."
      />
    )
  }
  if (eu.papel !== 'dono') {
    return (
      <EstadoVazio
        titulo="Área do dono"
        instrucao="Só quem tem papel de dono administra os acessos ao ERP. Fale com quem administra o sistema."
      />
    )
  }

  return <UsuariosCliente usuarios={await listarUsuarios()} meuId={eu.id} />
}
