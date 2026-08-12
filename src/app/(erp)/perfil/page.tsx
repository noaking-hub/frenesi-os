
import { EstadoVazio } from '@/components/erp/primitivos'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { PerfilCliente } from './PerfilCliente'

export const dynamic = 'force-dynamic'

export default async function Perfil() {
  const usuario = await sessaoAtual()
  if (!usuario) {
    // Sem autenticação configurada não há perfil que faça sentido editar.
    return (
      <EstadoVazio
        titulo="Sem sessão"
        instrucao="A autenticação não está configurada neste ambiente. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY para o ERP pedir login."
      />
    )
  }

  let ultimoAcesso: string | null = null
  if (supabaseConfigurado()) {
    const { data } = await supabaseServer()
      .from('usuarios')
      .select('ultimo_acesso_em')
      .eq('id', usuario.id)
      .maybeSingle()
    ultimoAcesso = (data as { ultimo_acesso_em: string | null } | null)?.ultimo_acesso_em ?? null
  }

  return <PerfilCliente usuario={usuario} ultimoAcesso={ultimoAcesso} />
}
