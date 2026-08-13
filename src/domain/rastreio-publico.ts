/**
 * O que o site da loja recebe quando pergunta pelo rastreio de um pedido.
 *
 * Esta é a única superfície do ERP que responde a quem não fez login — e por
 * isso ela é montada aqui, longe do banco: o que sai daqui é exatamente o que
 * o cliente pode ver, e nada mais. Endereço completo, telefone, valor pago,
 * itens e margem ficam de fora não por esquecimento, mas porque a chave de
 * acesso vive no navegador de quem visita a loja.
 *
 * O contrato está documentado em docs/rastreamento-integracao.md §7, acordado
 * com o desenvolvedor do site. Mudança aqui é mudança de contrato: o site
 * programa sobre os identificadores de `status`, não sobre os rótulos.
 */

import type { StatusRastreio } from './entregas'

export interface EventoPublico {
  quando: string | null
  descricao: string
  /** Sem os apêndices da transportadora. Ver `resumirDescricao`. */
  descricaoResumida: string
  local: string | null
  entregue: boolean
}

export interface MarcoPublico {
  quando: string | null
  titulo: string
  onde: string
}

export interface RastreioPublico {
  pedido: {
    referencia: string
    numeroYampi: string
    numeroLoja: string | null
    compradoEm: string
  }
  entrega: {
    status: StatusRastreio
    rotulo: string
    transportadora: string | null
    servico: string | null
    codigo: string | null
    /** Site da transportadora, montado pelo ERP a partir do código. */
    url: string | null
    /** Página que a própria transportadora devolveu para este objeto. */
    rastreioUrl: string | null
    destino: string | null
    entregueEm: string | null
    entregaLocal: boolean
  }
  marcos: MarcoPublico[]
  eventos: EventoPublico[]
  atualizadoEm: string
}

/**
 * Tira da ocorrência o que a transportadora anexou e o cliente não pediu.
 *
 * Os Correios grudam convite de pesquisa e URL de terceiro no meio da
 * descrição — "Objeto entregue ao destinatário - Queremos te ouvir! Responda
 * a uma pesquisa rápida… https://survey3.medallia.com/?…". Numa timeline
 * estreita isso ocupa três linhas e empurra o que importa para fora da tela.
 *
 * A descrição CRUA continua no contrato ao lado desta: quem integra decide
 * qual usar, e nenhuma informação é perdida por decisão nossa.
 */
export function resumirDescricao(descricao: string): string {
  let texto = descricao.trim()
  // URL solta no meio do texto — nunca é conteúdo, sempre é anexo.
  texto = texto.replace(/https?:\/\/\S+/g, '').trim()
  // Convites e instruções que vêm depois do travessão.
  texto = texto.replace(
    /\s*[-–]\s*(queremos te ouvir|responda a uma pesquisa|é preciso ter alguém|apresente o código|identificamos o equívoco|por favor aguarde)\b.*$/i,
    '',
  )
  return texto.replace(/[\s\-–,;]+$/, '').trim() || descricao.trim()
}

/** Data curta em português: `12/08`. */
function diaEMes(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * O texto que o cliente lê no topo da página.
 *
 * A entrega local fecha com o MESMO rótulo das demais — foi pedido explícito
 * do site, e é a coisa certa: para quem comprou, "entregue" é entregue,
 * independentemente de ter vindo por transportadora ou pela nossa moto.
 */
export function rotuloPublico(status: StatusRastreio, entregueEm: string | null): string {
  if (status === 'entregue') {
    const quando = entregueEm ? diaEMes(entregueEm) : ''
    return quando ? `Entregue em ${quando}` : 'Entregue'
  }
  const rotulos: Record<StatusRastreio, string> = {
    'pagamento-pendente': 'Aguardando confirmação do pagamento',
    'aguardando-postagem': 'Pedido em separação — em breve você recebe o código',
    'em-transito': 'A caminho',
    entregue: 'Entregue',
    'entrega-nao-efetuada': 'Houve um problema na entrega — fale com a gente',
    'sem-movimentacao': 'Entrega atrasada — já estamos verificando',
  }
  return rotulos[status]
}

/**
 * Link público da transportadora, montado a partir do código.
 *
 * O site pediu que o ERP devolvesse pronto: quem conhece as transportadoras é
 * quem deve saber onde cada uma publica o rastreio. Devolve `null` quando não
 * sabemos a empresa — link genérico errado é pior que link nenhum.
 */
export function urlDaTransportadora(
  transportadora: string | null,
  codigo: string | null,
): string | null {
  if (!codigo) return null
  const c = encodeURIComponent(codigo.trim())
  switch (transportadora) {
    case 'Correios':
      return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`
    case 'Jadlog':
      return `https://www.jadlog.com.br/siteInstitucional/tracking.jad?cte=${c}`
    case 'J&T Express':
      return `https://www.jtexpress.com.br/trajectoryQuery?waybillNo=${c}`
    default:
      return null
  }
}

/** Só dígitos — é assim que o CPF é comparado dos dois lados. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * O documento informado corresponde ao dono do pedido?
 *
 * Aceita e-mail ou CPF, como o Portal de Devoluções — o cliente já conhece
 * esse pedido de identificação e não precisa aprender outro.
 *
 * Um CPF vazio no cadastro NÃO libera o pedido: sem essa guarda, todo pedido
 * de cliente sem CPF responderia a qualquer string de onze dígitos.
 */
export function documentoConfere(
  informado: string,
  dono: { email: string | null; cpf: string | null },
): boolean {
  const bruto = informado.trim()
  if (!bruto) return false

  if (bruto.includes('@')) {
    const email = (dono.email ?? '').trim().toLowerCase()
    return email.length > 0 && email === bruto.toLowerCase()
  }

  const digitos = apenasDigitos(bruto)
  if (digitos.length < 11) return false
  const cpf = apenasDigitos(dono.cpf ?? '')
  return cpf.length >= 11 && cpf === digitos
}

/**
 * Aceita `YP-1510190959842609`, `1510190959842609`, `SH-1885` ou `#1885`.
 *
 * O site recebe visitantes dos dois mundos — quem veio do e-mail da Yampi tem
 * o número dela, quem veio da conta da loja tem o da Shopify — e não tem como
 * saber qual está na mão de quem. Normalizar aqui é o que permite ao site
 * mandar o que tiver, sem perguntar nada ao cliente.
 */
export function chaveDoPedido(bruto: string): { yampi: string | null; loja: string | null } {
  const texto = bruto.trim()
  if (!texto) return { yampi: null, loja: null }

  const semPrefixo = texto.replace(/^(YP|SH)[-\s]?/i, '').replace(/^#/, '')
  // O número da Yampi tem 16 dígitos nesta loja; o da Shopify é bem menor.
  // Confirmado no banco: os 602 pedidos seguem esse formato sem exceção.
  if (/^\d{14,}$/.test(semPrefixo)) return { yampi: `YP-${semPrefixo}`, loja: null }
  if (/^\d+$/.test(semPrefixo)) return { yampi: null, loja: semPrefixo }
  return { yampi: null, loja: null }
}
