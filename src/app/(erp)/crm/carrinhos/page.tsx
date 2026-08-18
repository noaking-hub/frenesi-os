import { EstadoVazio, FaixaAlerta } from '@/components/erp/primitivos'
import { emailConfigurado } from '@/data/email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { yampiConfigurada } from '@/data/yampi'
import { lerCarrinhosYampi, type CarrinhoYampi } from '@/data/yampi-crm'
import { metricasDeRecuperacao, type MetricasRecuperacao } from '@/domain'

import { CarrinhosCliente } from './CarrinhosCliente'

export const dynamic = 'force-dynamic'

/**
 * Carrinhos abandonados, lidos ao vivo do checkout da Yampi.
 *
 * A recuperação desta operação é uma mensagem no WhatsApp, não uma campanha:
 * cada linha com telefone abre a conversa já escrita. Carrinho recuperado
 * some da lista sozinho — por isso a tela lê ao vivo em vez de importar.
 */

function linkWhatsApp(c: CarrinhoYampi): string | null {
  if (!c.telefone) return null
  const nome = c.cliente?.split(' ')[0] ?? ''
  const mensagem =
    `Oi${nome ? ` ${nome}` : ''}! Vi que você montou um carrinho na FRENESI e não finalizou. ` +
    `Posso ajudar em algo? Se quiser, seguro ${c.itens.length === 1 ? 'o seu decant' : 'os seus decants'} para você. 💛`
  return `https://wa.me/${c.telefone}?text=${encodeURIComponent(mensagem)}`
}

export default async function Carrinhos() {
  if (!yampiConfigurada()) {
    return (
      <EstadoVazio
        titulo="Yampi não configurada"
        instrucao="Os carrinhos abandonados vivem no checkout da Yampi. Configure as credenciais no .env.local."
      />
    )
  }

  let leitura: Awaited<ReturnType<typeof lerCarrinhosYampi>> | null = null
  let erro: string | null = null
  try {
    leitura = await lerCarrinhosYampi()
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  if (erro || !leitura) {
    return (
      <FaixaAlerta
        tom="erro"
        texto={`A Yampi não respondeu a leitura de carrinhos: ${erro ?? 'sem detalhe'}. Esta tela lê ao vivo — recarregue quando a conexão voltar.`}
      />
    )
  }

  if (leitura.carrinhos.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum carrinho abandonado"
        instrucao="A Yampi respondeu e a lista veio vazia — todo mundo que montou carrinho finalizou a compra."
      />
    )
  }

  // Quando cada carrinho recebeu e-mail pela última vez — é o que separa
  // "enviar" de "insistir" na tela — e o placar da recuperação automática.
  const ultimoEnvio: Record<string, string> = {}
  let recuperacao: MetricasRecuperacao | null = null
  if (supabaseConfigurado()) {
    const agora = Date.now()
    // 8 semanas de gráfico + 7 dias de janela de atribuição.
    const corte = new Date(agora - 63 * 86_400_000).toISOString()
    const { data } = await supabaseServer()
      .from('recuperacoes_carrinho')
      .select('carrinho_id, email, cupom, enviado_em')
      .order('enviado_em', { ascending: false })
      .limit(4000)
    const linhas = (data ?? []) as {
      carrinho_id: string
      email: string
      cupom: string | null
      enviado_em: string
    }[]
    for (const r of linhas) {
      if (!ultimoEnvio[r.carrinho_id]) ultimoEnvio[r.carrinho_id] = r.enviado_em
    }

    const { data: pagos } = await supabaseServer()
      .from('pedidos')
      .select('valor, comprado_em, clientes(email)')
      .eq('pagamento', 'pago')
      .gte('comprado_em', corte)
      .limit(4000)
    const pedidos = ((pagos ?? []) as unknown as { valor: string; comprado_em: string; clientes: { email: string | null } | null }[])
      .map((p) => ({ valor: Number(p.valor), compradoEm: p.comprado_em, email: p.clientes?.email ?? '' }))
      .filter((p) => p.email)

    recuperacao = metricasDeRecuperacao(
      linhas
        .filter((r) => r.enviado_em >= corte)
        .map((r) => ({ carrinhoId: r.carrinho_id, email: r.email, enviadoEm: r.enviado_em, cupom: r.cupom })),
      pedidos,
      agora,
    )
  }

  return (
    <CarrinhosCliente
      carrinhos={leitura.carrinhos.map((c) => ({ ...c, whatsapp: linkWhatsApp(c) }))}
      ultimoEnvio={ultimoEnvio}
      emailPronto={emailConfigurado()}
      recuperacao={recuperacao}
    />
  )
}
