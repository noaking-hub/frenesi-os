import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { estadoDasIntegracoes } from '@/data/integracoes'
import { melhorEnvioConectado } from '@/data/melhorenvio'
import { pad2, plural } from '@/domain'

import { IntegracoesCliente } from './IntegracoesCliente'

export const dynamic = 'force-dynamic'

/**
 * Configurações → Integrações.
 *
 * A tela antiga listava sete integrações "Conectadas" com ping "há 2 min",
 * texto fixo, independente de haver credencial. Um painel que garante que
 * está tudo bem sem ter tentado atrapalha justamente quando algo quebra —
 * é o primeiro lugar que se olha.
 */
export default async function Integracoes({
  searchParams,
}: {
  searchParams: Promise<{ me?: string }>
}) {
  const [integracoes, conectado, { me }] = await Promise.all([
    estadoDasIntegracoes(),
    melhorEnvioConectado(),
    searchParams,
  ])
  const ligadas = integracoes.filter((i) => i.configurada)
  const comAtividade = integracoes.filter((i) => i.ultimaAtividade)

  const kpis: Kpi[] = [
    {
      label: 'Com credencial',
      valor: pad2(ligadas.length),
      hint: `de ${integracoes.length} integrações previstas`,
      tom: 'ok',
    },
    {
      label: 'Sem credencial',
      valor: pad2(integracoes.length - ligadas.length),
      hint: integracoes.length - ligadas.length ? 'A tela mostra o que falta em cada uma' : 'Tudo configurado',
      tom: integracoes.length - ligadas.length ? 'atencao' : 'ok',
    },
    {
      label: 'Já produziram dado',
      valor: pad2(comAtividade.length),
      hint: `${plural(comAtividade.length, 'integração escreveu', 'integrações escreveram')} algo no banco`,
      tom: 'info',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />
      <IntegracoesCliente
        integracoes={integracoes}
        conectado={conectado}
        avisoMelhorEnvio={me === 'conectado' || me === 'falhou' || me === 'estado-invalido' ? me : undefined}
      />
    </div>
  )
}
