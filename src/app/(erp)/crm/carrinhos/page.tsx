import { EstadoVazio, FaixaAlerta } from '@/components/erp/primitivos'
import { emailConfigurado } from '@/data/email'
import { lerModeloEmail } from '@/data/modelo-email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { yampiConfigurada } from '@/data/yampi'
import { lerCarrinhosYampi, type CarrinhoYampi } from '@/data/yampi-crm'

import { CarrinhosCliente, type EnvioFeito } from './CarrinhosCliente'

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
  // "enviar" de "insistir" na tela — e os últimos envios, para auditar o que
  // de fato saiu.
  const ultimoEnvio: Record<string, string> = {}
  let historico: EnvioFeito[] = []
  let recuperacao: { enviados: number; contatados: number; recuperados: number; receita: number } | null = null
  if (supabaseConfigurado()) {
    const { data } = await supabaseServer()
      .from('recuperacoes_carrinho')
      .select('carrinho_id, email, assunto, cupom, enviado_em')
      .order('enviado_em', { ascending: false })
      .limit(2000)
    const linhas = (data ?? []) as {
      carrinho_id: string
      email: string
      assunto: string
      cupom: string | null
      enviado_em: string
    }[]
    for (const r of linhas) {
      if (!ultimoEnvio[r.carrinho_id]) ultimoEnvio[r.carrinho_id] = r.enviado_em
    }
    historico = linhas.slice(0, 20).map((r) => ({
      email: r.email,
      assunto: r.assunto,
      cupom: r.cupom,
      enviadoEm: r.enviado_em,
    }))

    // A conta que fecha o módulo: e-mail de recuperação que virou pedido
    // PAGO do mesmo endereço em até 7 dias é carrinho recuperado. A janela é
    // atribuição, não certeza — mas é a mesma régua todo dia, e régua
    // constante é o que faz o número servir para decidir.
    const corte30 = Date.now() - 30 * 86_400_000
    const envios30 = linhas.filter((r) => Date.parse(r.enviado_em) >= corte30)
    const porCarrinho = new Map<string, { email: string; em: number }>()
    // `linhas` vem do mais novo para o mais velho; sobrescrever deixa o
    // PRIMEIRO toque de cada carrinho, que é de onde a janela conta.
    for (const r of envios30) {
      porCarrinho.set(r.carrinho_id, { email: r.email.toLowerCase(), em: Date.parse(r.enviado_em) })
    }
    if (porCarrinho.size > 0) {
      const { data: pagos } = await supabaseServer()
        .from('pedidos')
        .select('valor, comprado_em, clientes(email)')
        .eq('pagamento', 'pago')
        .gte('comprado_em', new Date(corte30).toISOString())
        .limit(2000)
      const pedidos = ((pagos ?? []) as unknown as { valor: string; comprado_em: string; clientes: { email: string | null } | null }[])
        .map((p) => ({
          valor: Number(p.valor),
          em: Date.parse(p.comprado_em),
          email: (p.clientes?.email ?? '').toLowerCase(),
        }))
        .filter((p) => p.email && Number.isFinite(p.em))
      let recuperados = 0
      let receita = 0
      for (const { email, em } of porCarrinho.values()) {
        const pedido = pedidos.find((x) => x.email === email && x.em >= em && x.em <= em + 7 * 86_400_000)
        if (pedido) {
          recuperados++
          receita += pedido.valor
        }
      }
      recuperacao = {
        enviados: envios30.length,
        contatados: porCarrinho.size,
        recuperados,
        receita: Math.round(receita * 100) / 100,
      }
    }
  }

  const modelo = await lerModeloEmail('carrinho')

  return (
    <CarrinhosCliente
      carrinhos={leitura.carrinhos.map((c) => ({ ...c, whatsapp: linkWhatsApp(c) }))}
      ultimoEnvio={ultimoEnvio}
      emailPronto={emailConfigurado()}
      modelo={modelo}
      historico={historico}
      recuperacao={recuperacao}
    />
  )
}
