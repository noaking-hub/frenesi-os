import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

import { EmpresaCliente } from './EmpresaCliente'
import type { DadosEmpresa } from './actions'

const VAZIA: DadosEmpresa = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  inscricao: '',
  regime: 'Simples Nacional',
  email: '',
  telefone: '',
  cep: '',
  logradouro: '',
  cidade: '',
  uf: '',
}

export default async function Empresa() {
  // Sem banco, o formulário abre em branco em vez de mostrar uma empresa
  // inventada com CNPJ plausível — que é o tipo de dado que alguém copia.
  if (!supabaseConfigurado()) {
    return <EmpresaCliente inicial={VAZIA} />
  }

  const { data } = await supabaseServer().from('empresa').select('*').eq('id', true).maybeSingle()
  if (!data) return <EmpresaCliente inicial={VAZIA} />

  return (
    <EmpresaCliente
      inicial={{
        razaoSocial: (data.razao_social as string) ?? '',
        nomeFantasia: (data.nome_fantasia as string) ?? '',
        cnpj: (data.cnpj as string) ?? '',
        inscricao: (data.inscricao as string) ?? '',
        regime: (data.regime as string) ?? 'Simples Nacional',
        email: (data.email as string) ?? '',
        telefone: (data.telefone as string) ?? '',
        cep: (data.cep as string) ?? '',
        logradouro: (data.logradouro as string) ?? '',
        cidade: (data.cidade as string) ?? '',
        uf: (data.uf as string) ?? '',
      }}
    />
  )
}
