import 'server-only'

import { carregarPedidos } from '@/data/consultas'
import { carregarDre, carregarLancamentos } from '@/data/financeiro'
import { janelasDe, PERIODOS, type Periodo } from '@/data/painel'
import { carregarPerfisClientes } from '@/data/perfis-clientes'
import { diaDaOperacao, paginar } from '@/domain'

import type { Ferramenta } from './ferramentas'

/**
 * As vendas, pedido a pedido — e os clientes por trás delas.
 *
 * Este arquivo existe por causa de uma falha de projeto que só apareceu no uso
 * real. O catálogo tinha quinze ferramentas e todas devolviam AGREGADO: total
 * do dia, ranking de produtos, ticket médio, saldo. Perguntado "quem comprou
 * ontem e o que cada um levou", o Gerente respondia que não tinha acesso e
 * mandava o dono do ERP olhar na Yampi — enquanto o dado estava no banco dele,
 * a uma consulta de distância.
 *
 * A lição está no desenho: um assistente gerencial que só enxerga soma não
 * serve para gerenciar. Toda soma que ele apresenta precisa poder ser aberta,
 * senão a única resposta possível a "por quê?" é "não sei".
 *
 * Tudo aqui é LEITURA. Nenhuma destas ferramentas altera coisa alguma.
 */

const COMUNS: Pick<Ferramenta, 'modo' | 'risco' | 'permissoes' | 'timeoutMs' | 'versao' | 'idempotente'> = {
  modo: 'READ',
  risco: 'A',
  permissoes: ['gerente.ler'],
  timeoutMs: 20_000,
  versao: '1.0.0',
  idempotente: true,
}

const PERIODO_VALIDO = PERIODOS.map((p) => p.id)

function janelaDe(args: Record<string, unknown>): { de: string; ate: string; rotulo: string } {
  const hoje = new Date().toISOString().slice(0, 10)
  const iso = /^\d{4}-\d{2}-\d{2}$/
  const de = String(args.de ?? '')
  const ate = String(args.ate ?? '')
  // Datas livres têm precedência: quem escreveu "entre 01/08 e 07/08" quis
  // exatamente isso, e encaixar no período mais próximo seria responder outra
  // pergunta com cara de resposta certa.
  if (iso.test(de) && iso.test(ate) && de <= ate) {
    return { de, ate, rotulo: `${de} a ${ate}` }
  }
  const p = String(args.periodo ?? 'hoje')
  const periodo = (PERIODO_VALIDO.includes(p as Periodo) ? p : 'hoje') as Periodo
  const { atual } = janelasDe(periodo, hoje)
  return { de: atual.de, ate: atual.ate, rotulo: atual.rotulo }
}

function itensEmTexto(itens: { perfume: string; marca: string; variante: number | null }[]): string {
  return itens
    .map((i) => `${i.perfume}${i.variante ? ` ${i.variante}ml` : ''}`)
    .join(', ')
}

export const FERRAMENTAS_PEDIDOS: Ferramenta[] = [
  {
    ...COMUNS,
    nome: 'vendas_do_periodo',
    descricao:
      'As VENDAS uma a uma, com cliente, valor, itens comprados, situação do pagamento e do ' +
      'envio. Use sempre que a pergunta for sobre quem comprou, o que foi comprado ou o ' +
      'detalhe por trás de um total. Aceita período nomeado ou datas livres.',
    parametros: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: PERIODO_VALIDO,
          description: 'Período nomeado. Ignorado quando "de" e "ate" vierem preenchidos.',
        },
        de: { type: 'string', description: 'Data inicial AAAA-MM-DD.' },
        ate: { type: 'string', description: 'Data final AAAA-MM-DD.' },
        limite: { type: 'number', description: 'Máximo de pedidos (padrão 40, teto 120).' },
      },
    },
    executar: async (args) => {
      const janela = janelaDe(args)
      const limite = Math.min(120, Math.max(1, Number(args.limite ?? 40) || 40))
      const todos = await carregarPedidos()

      const doPeriodo = todos
        .filter((p) => {
          const dia = diaDaOperacao(p.pedido.compradoEm)
          // Data ilegível fica de FORA e não vira "hoje": um pedido sem data
          // confiável contado no dia errado desloca o faturamento do dia.
          return dia !== '' && dia >= janela.de && dia <= janela.ate
        })
        .sort((a, b) => b.pedido.compradoEm.localeCompare(a.pedido.compradoEm))

      const total = doPeriodo.reduce((s, p) => s + p.pedido.valor, 0)

      return paginar(
        doPeriodo.map(({ pedido, logistica }) => ({
          pedido: pedido.id,
          quando: diaDaOperacao(pedido.compradoEm),
          cliente: pedido.cliente,
          cidade: pedido.destino,
          valor: pedido.valor,
          frete: pedido.frete,
          canal: pedido.canal,
          pagamento: pedido.pagamento,
          situacao: pedido.situacao,
          envio: logistica?.status ?? pedido.envio,
          entregaDesde: logistica?.desde ?? null,
          rastreio: pedido.rastreio,
          itens: itensEmTexto(pedido.itens),
          pecas: pedido.itens.length,
        })),
        limite,
        {
          resumo:
            doPeriodo.length === 0
              ? `Nenhuma venda em ${janela.rotulo}.`
              : `${doPeriodo.length} venda(s) em ${janela.rotulo}, somando R$ ${total.toFixed(2)}.`,
          totais: { pedidos: doPeriodo.length, valorTotal: total },
          metadados: {
            janela,
            aviso:
              'Uma venda pode ter itens de vários perfumes; "pecas" conta os itens do pedido, ' +
              'não a quantidade de frascos por item.',
          },
        },
      )
    },
  },

  {
    ...COMUNS,
    nome: 'detalhe_do_pedido',
    descricao:
      'Um pedido específico por inteiro: cliente, contato, endereço, itens com tamanho e preço, ' +
      'frete, cashback, pagamento, envio e rastreio. Aceita o número do pedido ou parte dele.',
    parametros: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'Número do pedido, inteiro ou em parte.' },
      },
      required: ['pedido'],
    },
    executar: async (args) => {
      const busca = String(args.pedido ?? '').trim().toLowerCase()
      if (!busca) return { erro: 'Informe o número do pedido.' }

      const todos = await carregarPedidos()
      const achados = todos.filter((p) => p.pedido.id.toLowerCase().includes(busca))

      if (achados.length === 0) return { resumo: `Nenhum pedido casa com "${busca}".`, itens: [] }
      // Busca parcial ambígua não escolhe por conta própria: devolver "um dos
      // três" seria dar um detalhe preciso do pedido errado.
      if (achados.length > 1) {
        return {
          resumo: `${achados.length} pedidos casam com "${busca}". Refine.`,
          itens: achados.slice(0, 10).map((p) => ({
            pedido: p.pedido.id,
            cliente: p.pedido.cliente,
            quando: diaDaOperacao(p.pedido.compradoEm),
            valor: p.pedido.valor,
          })),
        }
      }

      const { pedido, logistica, devolucao } = achados[0]
      return {
        resumo: `Pedido ${pedido.id} — ${pedido.cliente}, R$ ${pedido.valor.toFixed(2)} em ${diaDaOperacao(pedido.compradoEm)}.`,
        pedido: {
          numero: pedido.id,
          quando: diaDaOperacao(pedido.compradoEm),
          canal: pedido.canal,
          cliente: pedido.cliente,
          email: pedido.email,
          telefone: pedido.telefone,
          destino: pedido.destino,
          cep: pedido.cep,
          valor: pedido.valor,
          frete: pedido.frete,
          cashback: pedido.cashback,
          pagamento: pedido.pagamento,
          situacao: pedido.situacao,
          envio: logistica?.status ?? pedido.envio,
          rastreioSituacao: logistica?.original ?? null,
          rastreio: pedido.rastreio,
          entregueEm: pedido.entregueEm,
          devolucao: devolucao ? { elegivel: devolucao.elegivel, estado: devolucao.estado, selo: devolucao.selo } : null,
        },
        itens: pedido.itens.map((i) => ({
          perfume: i.perfume,
          marca: i.marca,
          ml: i.variante,
          preco: i.preco,
        })),
      }
    },
  },

  {
    ...COMUNS,
    nome: 'cliente',
    descricao:
      'Ficha de um cliente: quanto já comprou, quantas vezes, ticket, primeira e última compra, ' +
      'os perfumes que ele mais leva e o histórico de pedidos. Busca por nome, e-mail ou ' +
      'telefone, inteiros ou em parte.',
    parametros: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Nome, e-mail ou telefone, inteiro ou em parte.' },
      },
      required: ['busca'],
    },
    executar: async (args) => {
      const alvo = String(args.busca ?? '').trim().toLowerCase()
      if (alvo.length < 3) return { erro: 'Busque por pelo menos três caracteres.' }

      const perfis = await carregarPerfisClientes()
      // Dígitos só entram na busca por telefone quando a pessoa realmente
      // digitou dígitos. Sem essa guarda, uma busca por nome vira um
      // `includes('')`, que casa com TODO mundo — e a ferramenta responderia
      // "630 clientes casam" para qualquer pergunta.
      const digitos = alvo.replace(/\D/g, '')
      const achados = perfis.filter(
        (c) =>
          c.nome.toLowerCase().includes(alvo) ||
          c.email.toLowerCase().includes(alvo) ||
          (digitos.length >= 4 && c.telefone.replace(/\D/g, '').includes(digitos)),
      )

      if (achados.length === 0) return { resumo: `Ninguém casa com "${alvo}".`, itens: [] }
      if (achados.length > 1) {
        return {
          resumo: `${achados.length} clientes casam com "${alvo}".`,
          itens: achados.slice(0, 12).map((c) => ({
            nome: c.nome,
            email: c.email,
            pedidos: c.pedidos,
            total: c.total,
            ultimaCompra: c.ultimaCompra,
          })),
        }
      }

      const c = achados[0]
      return {
        resumo: `${c.nome}: ${c.pedidos} pedido(s), R$ ${c.total.toFixed(2)} no total, ticket R$ ${c.ticket.toFixed(2)}.`,
        cliente: {
          nome: c.nome,
          email: c.email,
          telefone: c.telefone,
          cidade: c.cidade,
          status: c.status,
          pedidos: c.pedidos,
          total: c.total,
          ticket: c.ticket,
          primeiraCompra: c.primeiraCompra,
          ultimaCompra: c.ultimaCompra,
          diasDesdeUltima: c.diasDesdeUltima,
          favoritos: c.favoritos,
        },
        itens: c.compras.slice(0, 20).map((compra) => ({
          pedido: compra.pedidoId,
          quando: diaDaOperacao(compra.quando),
          valor: compra.valor,
          itens: compra.itens.join(', '),
        })),
      }
    },
  },

  {
    ...COMUNS,
    nome: 'lancamentos_do_periodo',
    descricao:
      'TODOS os lançamentos financeiros de um período — pagos, recebidos e em aberto —, com ' +
      'data, descrição, categoria, conta, tipo e situação, mais o total por categoria. É o que ' +
      'responde "quanto gastei com X", "o que saiu em julho" e "para onde foi o dinheiro". ' +
      'Diferente de lancamentos_pendentes, que só mostra o que ainda está em aberto.',
    parametros: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: PERIODO_VALIDO, description: 'Período nomeado.' },
        de: { type: 'string', description: 'Data inicial AAAA-MM-DD.' },
        ate: { type: 'string', description: 'Data final AAAA-MM-DD.' },
        tipo: { type: 'string', enum: ['entrada', 'saida'], description: 'Só entradas ou só saídas.' },
        categoria: { type: 'string', description: 'Filtra por nome da categoria, inteiro ou em parte.' },
        busca: { type: 'string', description: 'Texto na descrição.' },
        limite: { type: 'number', description: 'Máximo de linhas (padrão 60, teto 200).' },
      },
    },
    executar: async (args) => {
      const janela = janelaDe(args)
      const limite = Math.min(200, Math.max(1, Number(args.limite ?? 60) || 60))
      const painel = await carregarLancamentos({ de: janela.de, ate: janela.ate })

      const tipo = String(args.tipo ?? '')
      const categoria = String(args.categoria ?? '').trim().toLowerCase()
      const busca = String(args.busca ?? '').trim().toLowerCase()

      const filtrados = painel.lancamentos.filter((l) => {
        if (tipo === 'entrada' || tipo === 'saida') {
          if (l.tipo !== tipo) return false
        }
        if (categoria && !(l.categoria ?? '').toLowerCase().includes(categoria)) return false
        if (busca && !l.descricao.toLowerCase().includes(busca)) return false
        return true
      })

      const entradas = filtrados.filter((l) => l.tipo === 'entrada')
      const saidas = filtrados.filter((l) => l.tipo === 'saida')
      const soma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0)

      // O total POR CATEGORIA vem junto porque é quase sempre a pergunta real.
      // Sem ele, o modelo somaria as linhas de cabeça — e somar de cabeça uma
      // lista truncada por paginação produz um número errado com cara de certo.
      const porCategoria = new Map<string, { categoria: string; tipo: string; valor: number; qtd: number }>()
      for (const l of filtrados) {
        // Sem categoria é um estado legítimo do financeiro, e some-lo do total
        // faria a soma por categoria não fechar com o total geral.
        const nome = l.categoria ?? '(sem categoria)'
        const chave = `${l.tipo}|${nome}`
        const atual = porCategoria.get(chave) ?? { categoria: nome, tipo: String(l.tipo), valor: 0, qtd: 0 }
        atual.valor += l.valor
        atual.qtd += 1
        porCategoria.set(chave, atual)
      }

      return paginar(
        filtrados.map((l) => ({
          competencia: l.competencia,
          descricao: l.descricao,
          favorecido: l.favorecido,
          categoria: l.categoria ?? '(sem categoria)',
          centroCusto: l.centroCusto,
          conta: l.conta,
          tipo: l.tipo,
          valor: l.valor,
          realizado: l.recebido,
          venceEm: l.venceEm,
          // Baixado ou não é a distinção que separa "já saiu do caixa" de
          // "ainda vai sair" — sem ela o modelo soma tudo como se fosse gasto.
          baixadoEm: l.baixadoEm,
        })),
        limite,
        {
          resumo:
            filtrados.length === 0
              ? `Nenhum lançamento em ${janela.rotulo} com esses filtros.`
              : `${filtrados.length} lançamento(s) em ${janela.rotulo}: R$ ${soma(entradas).toFixed(2)} de entrada e R$ ${soma(saidas).toFixed(2)} de saída.`,
          totais: {
            entradas: soma(entradas),
            saidas: soma(saidas),
            resultado: soma(entradas) - soma(saidas),
          },
          metadados: {
            janela,
            // O total por categoria vem nos METADADOS porque `totais` só aceita
            // escalares — e é quase sempre a pergunta real por trás de "quanto
            // gastei com X". Sem ele o modelo somaria de cabeça uma lista já
            // truncada pela paginação, produzindo número errado com cara de certo.
            porCategoria: [...porCategoria.values()].sort((a, b) => b.valor - a.valor),
            aviso:
              'Estes são LANÇAMENTOS (regime de caixa e competência do financeiro), não vendas. ' +
              'Faturamento de pedidos sai de vendas_do_periodo — somar os dois conta o mesmo ' +
              'dinheiro duas vezes.',
          },
        },
      )
    },
  },

  {
    ...COMUNS,
    nome: 'dre_de_qualquer_mes',
    descricao:
      'DRE gerencial por competência de UM MÊS ESPECÍFICO: receita bruta e líquida, margem de ' +
      'contribuição, resultado, ponto de equilíbrio e composição por categoria. Use para meses ' +
      'passados — dre_do_mes só enxerga o mês corrente.',
    parametros: {
      type: 'object',
      properties: {
        competencia: {
          type: 'string',
          description: 'Mês no formato AAAA-MM. Ex.: 2026-07 para julho de 2026.',
        },
      },
      required: ['competencia'],
    },
    executar: async (args) => {
      const alvo = String(args.competencia ?? '').trim()
      if (!/^\d{4}-\d{2}$/.test(alvo)) {
        return { erro: 'Informe a competência como AAAA-MM. Ex.: 2026-07.' }
      }
      const p = await carregarDre(alvo)
      return {
        resumo: `DRE de ${alvo}.`,
        competencia: p.competencia,
        dre: p.dre,
        porCategoria: p.porCategoria,
        metadados: {
          competenciasDisponiveis: p.disponiveis,
          aviso:
            'DRE é por COMPETÊNCIA: conta o mês em que o fato ocorreu, não o mês em que o ' +
            'dinheiro entrou ou saiu. Não bate com o extrato de propósito.',
        },
      }
    },
  },
]
