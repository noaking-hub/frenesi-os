import type { ParametrosPrecificacao } from '@/domain'

/**
 * Os 10 parâmetros editáveis de precificação, agrupados por seção.
 *
 * Esta lista é a fonte tanto do formulário quanto da contagem no hub de
 * Configurações — adicionar um campo aqui atualiza os dois.
 */

export type SecaoParametro = 'Taxas variáveis' | 'Custos fixos por pedido' | 'Produção'

export const SECOES_PARAMETROS: SecaoParametro[] = [
  'Taxas variáveis',
  'Custos fixos por pedido',
  'Produção',
]

/**
 * `adsMensal` fica de fora: ele não é uma taxa que se digita, é o valor que
 * origina `adsPct`. Quem edita é a calculadora de marketing, que sabe dividir
 * pelo faturamento — um campo de formulário aqui deixaria os dois soltos.
 */
export type ChaveParametro = Exclude<keyof ParametrosPrecificacao, 'adsMensal'>

export interface CampoParametro {
  chave: ChaveParametro
  label: string
  unidade: '%' | 'R$'
  hint: string
  secao: SecaoParametro
}

export const CAMPOS_PARAMETROS: CampoParametro[] = [
  { chave: 'intermediadorPct', label: 'Intermediador de pagamento', unidade: '%', hint: 'Cielo · cartão parcelado médio', secao: 'Taxas variáveis' },
  { chave: 'checkoutPct', label: 'Checkout externo · Yampi', unidade: '%', hint: 'Cobrado sobre o valor total', secao: 'Taxas variáveis' },
  { chave: 'impostoPct', label: 'Imposto', unidade: '%', hint: 'Simples Nacional · faixa atual', secao: 'Taxas variáveis' },
  { chave: 'adsPct', label: 'Marketing e ADS', unidade: '%', hint: 'Meta de custo de aquisição', secao: 'Taxas variáveis' },
  { chave: 'intermediadorFixo', label: 'Tarifa fixa por transação', unidade: 'R$', hint: 'Cobrada por pedido aprovado', secao: 'Custos fixos por pedido' },
  { chave: 'antifraude', label: 'Antifraude', unidade: 'R$', hint: 'Análise por transação', secao: 'Custos fixos por pedido' },
  { chave: 'frasco', label: 'Frasco', unidade: 'R$', hint: 'Vidro do decant · custo por pedido', secao: 'Custos fixos por pedido' },
  { chave: 'valvula', label: 'Válvula', unidade: 'R$', hint: 'Válvula spray do decant', secao: 'Custos fixos por pedido' },
  { chave: 'tampa', label: 'Tampas', unidade: 'R$', hint: 'Tampa do decant', secao: 'Custos fixos por pedido' },
  { chave: 'etiqueta', label: 'Etiqueta', unidade: 'R$', hint: 'Rótulo impresso', secao: 'Custos fixos por pedido' },
  { chave: 'caixa', label: 'Caixa', unidade: 'R$', hint: 'Embalagem de envio', secao: 'Custos fixos por pedido' },
  { chave: 'plasticoBolha', label: 'Plástico bolha', unidade: 'R$', hint: 'Proteção do frasco no transporte', secao: 'Custos fixos por pedido' },
  { chave: 'freteSubsidio', label: 'Frete subsidiado', unidade: 'R$', hint: 'Média do que a loja absorve', secao: 'Custos fixos por pedido' },
  { chave: 'perdaPct', label: 'Perda técnica no fracionamento', unidade: '%', hint: 'Sobre o volume envasado', secao: 'Produção' },
  { chave: 'margemAlvo', label: 'Margem líquida alvo', unidade: '%', hint: 'Base do preço ideal sugerido', secao: 'Produção' },
]

/** Dias até o certificado A1 vencer. Alimenta o alerta da tela Empresa e o hub. */
export function diasParaVencer(validadeIso: string, hoje: Date = new Date()): number {
  const validade = new Date(`${validadeIso}T00:00:00`)
  return Math.ceil((validade.getTime() - hoje.getTime()) / 86_400_000)
}

/** '2026-10-04' → '04/10/2026'. */
export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
