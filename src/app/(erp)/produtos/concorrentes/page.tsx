import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { VARIANTES } from '@/domain'

import { BuscaPrecos } from './BuscaPrecos'
import { FontesCliente, type TituloSemDono } from './FontesCliente'

/**
 * Títulos lidos que o casamento automático recusou.
 *
 * Continuam visíveis, mas recolhidos: são manutenção do cadastro, não a
 * pergunta que se faz todo dia. Ocupando a tela inteira, empurravam a consulta
 * de preço — que é o motivo do módulo existir — para o rodapé.
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

export default async function Concorrentes() {
  const repo = repositorio()
  const [bases, fontes, semDono] = await Promise.all([
    repo.perfumesBase(),
    repo.concorrentesFontes(),
    lerSemDono(),
  ])

  // A leitura mais recente entre as fontes: é a idade do preço que a busca
  // devolve, e quem consulta precisa saber se está olhando ontem ou o mês
  // passado.
  const atualizadoEm =
    fontes
      .map((f) => f.quando)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <BuscaPrecos atualizadoEm={atualizadoEm} />
      <FontesCliente fontes={fontes} bases={bases} semDono={semDono} variantes={VARIANTES} />
    </div>
  )
}
