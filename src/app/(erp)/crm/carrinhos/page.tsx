import { EstadoVazio, FaixaAlerta } from '@/components/erp/primitivos'
import { emailConfigurado } from '@/data/email'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { yampiConfigurada } from '@/data/yampi'
import { lerCarrinhosYampi, type CarrinhoYampi } from '@/data/yampi-crm'

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
  // "enviar" de "insistir" na tela.
  const ultimoEnvio: Record<string, string> = {}
  if (supabaseConfigurado()) {
    const { data } = await supabaseServer()
      .from('recuperacoes_carrinho')
      .select('carrinho_id, enviado_em')
      .order('enviado_em', { ascending: false })
      .limit(2000)
    for (const r of (data ?? []) as { carrinho_id: string; enviado_em: string }[]) {
      if (!ultimoEnvio[r.carrinho_id]) ultimoEnvio[r.carrinho_id] = r.enviado_em
    }
  }

  return (
    <CarrinhosCliente
      carrinhos={leitura.carrinhos.map((c) => ({ ...c, whatsapp: linkWhatsApp(c) }))}
      ultimoEnvio={ultimoEnvio}
      emailPronto={emailConfigurado()}
    />
  )
}
