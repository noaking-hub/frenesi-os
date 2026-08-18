import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio } from '@/components/erp/primitivos'
import { listarDescadastrados } from '@/data/descadastro'
import {
  avisosDeDevolucaoLigados,
  avisosDePedidoLigados,
  lerLogDeNotificacoes,
  resumoDeNotificacoes,
} from '@/data/notificacoes'
import { emailConfigurado } from '@/data/email'
import { lerRegrasDeEnvio } from '@/data/regras-de-envio'
import { supabaseConfigurado } from '@/data/supabase'
import { num } from '@/domain'

import { NotificacoesCliente } from './NotificacoesCliente'
import { RegrasDeEnvio } from './RegrasDeEnvio'

export const dynamic = 'force-dynamic'

/**
 * Notificações — o que o ERP escreveu para os clientes.
 *
 * Enquanto a Yampi mandava os avisos, esta tela não existia porque a resposta
 * para "o cliente foi avisado?" era "olhe na Yampi". Assumindo os envios, a
 * pergunta passa a ser nossa — e sem log ela só teria resposta na caixa de
 * entrada do cliente.
 *
 * Três coisas moram aqui, e as três são para o dia em que algo der errado:
 * o estado das travas (o que está ligado agora), o registro de cada aviso
 * com o motivo de quem não saiu, e a lista de quem cancelou a inscrição.
 */
export default async function Notificacoes({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; evento?: string }>
}) {
  if (!supabaseConfigurado()) {
    return (
      <EstadoVazio
        titulo="Sem banco configurado"
        instrucao="O Supabase precisa estar configurado para o ERP registrar e mostrar os avisos enviados."
      />
    )
  }

  const sp = await searchParams
  const [resumo, log, descadastrados, regras] = await Promise.all([
    resumoDeNotificacoes(),
    lerLogDeNotificacoes({ estado: sp.estado ?? null, evento: sp.evento ?? null }),
    listarDescadastrados(),
    lerRegrasDeEnvio(),
  ])

  const kpis: Kpi[] = [
    {
      label: 'Avisos de pedido',
      valor: avisosDePedidoLigados() ? 'Ligados' : 'Desligados',
      hint: avisosDePedidoLigados()
        ? 'AVISOS_DE_PEDIDO=1 — envio e entrega saem pelo ERP'
        : 'AVISOS_DE_PEDIDO não está em 1 — os fatos entram no log como dispensados',
      tom: avisosDePedidoLigados() ? 'ok' : 'neutro',
    },
    {
      label: 'Avisos de devolução',
      valor: avisosDeDevolucaoLigados() ? 'Ligados' : 'Desligados',
      hint: avisosDeDevolucaoLigados()
        ? 'AVISOS_DE_DEVOLUCAO=1 — abertura, aprovação e conclusão saem pelo ERP'
        : 'AVISOS_DE_DEVOLUCAO não está em 1 — nada sai',
      tom: avisosDeDevolucaoLigados() ? 'ok' : 'neutro',
    },
    {
      // A régua é a do Resend: 100 por dia e 3.000 por mês no plano atual.
      // A contagem é do log do ERP — testes e reenvios manuais feitos direto
      // no Resend não passam por aqui, então lá o número pode ser um pouco
      // maior.
      label: 'E-mails enviados',
      valor: `${num(resumo.enviadosHoje)}/100 hoje`,
      hint: `${num(resumo.enviadosMes)}/3.000 no mês · ${num(resumo.enviados)} em 30 dias · ${num(resumo.falhas)} falharam`,
      tom: resumo.falhas > 0 ? 'erro' : 'ouro',
    },
    {
      label: 'Provedor de e-mail',
      valor: emailConfigurado() ? 'Configurado' : 'Faltando',
      hint: emailConfigurado()
        ? 'RESEND_API_KEY e EMAIL_REMETENTE definidos'
        : 'Sem RESEND_API_KEY nada sai, nem com a trava ligada',
      tom: emailConfigurado() ? 'ok' : 'erro',
    },
    {
      label: 'Cancelaram a inscrição',
      valor: num(descadastrados.length),
      hint: 'não recebem marketing; avisos de pedido continuam',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FaixaKpis kpis={kpis} />
      <RegrasDeEnvio regras={regras} />

      <NotificacoesCliente
        log={log}
        descadastrados={descadastrados}
        filtroEstado={sp.estado ?? ''}
        filtroEvento={sp.evento ?? ''}
      />
    </div>
  )
}
