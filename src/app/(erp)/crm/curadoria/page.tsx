import { EstadoVazio } from '@/components/erp/primitivos'
import { painelDaCuradoria, quizConfigurado } from '@/data/quiz'
import { supabaseConfigurado } from '@/data/supabase'

import { CuradoriaCliente } from './CuradoriaCliente'

export const dynamic = 'force-dynamic'

/**
 * CRM → Curadoria Olfativa: o quiz virando número.
 *
 * O quiz roda em projeto próprio; o ERP importa cada clique (com o perfil de
 * respostas junto) e cada lead com cupom. Esta tela é onde isso vira decisão:
 * quais perfumes o público quer, que perfil responde o quiz, quantos leads
 * viram clientes e quanto o cupom CURA traz de venda.
 */
export default async function Curadoria() {
  if (!supabaseConfigurado()) {
    return (
      <EstadoVazio
        titulo="Supabase não configurado"
        instrucao="A Curadoria lê as respostas importadas do quiz — configure o banco primeiro."
      />
    )
  }

  const painel = await painelDaCuradoria()

  if (painel.interacoes === 0 && painel.leads === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma resposta importada ainda"
        instrucao={
          quizConfigurado()
            ? 'A importação roda de hora em hora. Assim que alguém usar o quiz, os números aparecem aqui.'
            : 'Configure QUIZ_SUPABASE_URL e QUIZ_SUPABASE_SERVICE_KEY na Netlify para ligar a importação.'
        }
      />
    )
  }

  return <CuradoriaCliente painel={painel} />
}
