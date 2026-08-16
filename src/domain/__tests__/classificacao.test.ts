import { describe, expect, it } from 'vitest'

import {
  chaveDoMovimento,
  LIMIAR_PADRAO,
  normalizar,
  podeAplicarSozinho,
  resumirLote,
  sugerirCategoriaDoMovimento,
  sugerirEmLote,
  type ClassificacaoAnterior,
  type MovimentoParaClassificar,
  type PoliticaDeAutonomia,
  type RegraDeClassificacao,
} from '../classificacao'

function mov(over: Partial<MovimentoParaClassificar> = {}): MovimentoParaClassificar {
  return {
    id: 'm1',
    descricao: 'PIX ENVIADO',
    favorecido: 'CORREIOS',
    tipo: 'saida',
    valor: 120,
    transferenciaId: null,
    pedidoId: null,
    ...over,
  }
}

function regra(over: Partial<RegraDeClassificacao> = {}): RegraDeClassificacao {
  return {
    id: 'r1',
    padrao: 'correios',
    categoriaId: 'frete',
    categoria: 'Frete',
    ativa: true,
    prioridade: 0,
    ...over,
  }
}

const SEM_HISTORICO: ClassificacaoAnterior[] = []

describe('normalização', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizar('Ó, Vál-vula!')).toBe('o val vula')
  })

  it('remove data e sequencial que o banco enfia na descrição', () => {
    expect(normalizar('PIX ENVIADO 12/08 CORREIOS 998877')).toBe('pix enviado correios')
  })

  it('duas ocorrências da mesma contraparte em datas diferentes viram a MESMA chave', () => {
    const a = chaveDoMovimento({ descricao: 'PIX 12/08 CORREIOS', favorecido: null, tipo: 'saida' })
    const b = chaveDoMovimento({ descricao: 'PIX 19/08 CORREIOS', favorecido: null, tipo: 'saida' })
    expect(a).toBe(b)
  })

  it('mesma contraparte em sentidos opostos NÃO é a mesma chave', () => {
    const saida = chaveDoMovimento({ descricao: 'x', favorecido: 'FORNECEDOR', tipo: 'saida' })
    const entrada = chaveDoMovimento({ descricao: 'x', favorecido: 'FORNECEDOR', tipo: 'entrada' })
    expect(saida).not.toBe(entrada)
  })
})

describe('transferência interna', () => {
  it('nunca recebe categoria, e o motivo explica a dupla contagem', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ transferenciaId: 't1' }),
      regras: [regra()],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBeNull()
    expect(s.motivo).toMatch(/dobrando o resultado|não saiu nem entrou/i)
  })

  it('não é caso de revisão: é resposta final, não pendência', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ transferenciaId: 't1' }),
      regras: [],
      historico: SEM_HISTORICO,
    })
    expect(s.exigeRevisao).toBe(false)
  })

  it('a regra vence a regra: nem uma regra casando muda o veredito', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ transferenciaId: 't1', descricao: 'CORREIOS' }),
      regras: [regra()],
      historico: SEM_HISTORICO,
    })
    expect(s.origem).toBe('nenhuma')
  })
})

describe('crédito de venda', () => {
  it('não vira categoria, para a receita não ser contada duas vezes', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ tipo: 'entrada', pedidoId: 'YP-1', favorecido: 'CLIENTE' }),
      regras: [],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBeNull()
    expect(s.exigeRevisao).toBe(false)
    expect(s.motivo).toContain('YP-1')
  })

  it('SAÍDA vinculada a pedido continua classificável — estorno é despesa de verdade', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ tipo: 'saida', pedidoId: 'YP-1', favorecido: 'CORREIOS' }),
      regras: [regra()],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBe('frete')
  })
})

describe('regras', () => {
  it('regra aprovada dá confiança 1 e dispensa revisão', () => {
    const s = sugerirCategoriaDoMovimento({ movimento: mov(), regras: [regra()], historico: SEM_HISTORICO })
    expect(s.origem).toBe('regra')
    expect(s.confianca).toBe(1)
    expect(s.exigeRevisao).toBe(false)
  })

  it('regra pausada não conta', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [regra({ ativa: false })],
      historico: SEM_HISTORICO,
    })
    expect(s.origem).toBe('nenhuma')
  })

  it('regra restrita a entrada não pega uma saída', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ tipo: 'saida' }),
      regras: [regra({ tipo: 'entrada' })],
      historico: SEM_HISTORICO,
    })
    expect(s.origem).toBe('nenhuma')
  })

  it('CONFLITO de mesma prioridade interrompe em vez de escolher a primeira', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [
        regra({ id: 'a', padrao: 'correios', categoriaId: 'frete', categoria: 'Frete' }),
        regra({ id: 'b', padrao: 'pix', categoriaId: 'tarifa', categoria: 'Tarifas' }),
      ],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBeNull()
    expect(s.exigeRevisao).toBe(true)
    expect(s.sinais.some((x) => x.tipo === 'conflito')).toBe(true)
  })

  it('prioridade desempata sem virar conflito', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [
        regra({ id: 'a', padrao: 'correios', categoriaId: 'frete', categoria: 'Frete', prioridade: 10 }),
        regra({ id: 'b', padrao: 'pix', categoriaId: 'tarifa', categoria: 'Tarifas', prioridade: 1 }),
      ],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBe('frete')
  })

  it('duas regras de mesma prioridade para a MESMA categoria não é conflito', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [
        regra({ id: 'a', padrao: 'correios' }),
        regra({ id: 'b', padrao: 'pix' }),
      ],
      historico: SEM_HISTORICO,
    })
    expect(s.categoriaId).toBe('frete')
  })
})

describe('histórico', () => {
  const chave = chaveDoMovimento(mov())
  const anterior = (categoriaId: string, categoria: string): ClassificacaoAnterior => ({
    chave,
    categoriaId,
    categoria,
  })

  it('sem regra e sem histórico, admite que não sabe', () => {
    const s = sugerirCategoriaDoMovimento({ movimento: mov(), regras: [], historico: [] })
    expect(s.categoriaId).toBeNull()
    expect(s.motivo).toMatch(/primeira vez/i)
  })

  it('histórico unânime e maduro sugere com confiança alta', () => {
    const h = Array.from({ length: 6 }, () => anterior('frete', 'Frete'))
    const s = sugerirCategoriaDoMovimento({ movimento: mov(), regras: [], historico: h })
    expect(s.categoriaId).toBe('frete')
    expect(s.origem).toBe('historico')
    expect(s.confianca).toBe(1)
    expect(s.exigeRevisao).toBe(false)
  })

  it('pouco histórico sugere, mas manda revisar', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [],
      historico: [anterior('frete', 'Frete')],
    })
    expect(s.categoriaId).toBe('frete')
    expect(s.exigeRevisao).toBe(true)
    expect(s.confianca).toBeLessThan(1)
  })

  it('histórico dividido baixa a confiança, cita a alternativa e exige revisão', () => {
    const h = [
      anterior('frete', 'Frete'),
      anterior('frete', 'Frete'),
      anterior('frete', 'Frete'),
      anterior('embalagem', 'Embalagem'),
    ]
    const s = sugerirCategoriaDoMovimento({ movimento: mov(), regras: [], historico: h })
    expect(s.categoriaId).toBe('frete')
    expect(s.confianca).toBeLessThan(0.9)
    expect(s.exigeRevisao).toBe(true)
    expect(s.motivo).toContain('Embalagem')
  })

  it('histórico de OUTRA contraparte não vale', () => {
    const s = sugerirCategoriaDoMovimento({
      movimento: mov({ favorecido: 'MELHOR ENVIO' }),
      regras: [],
      historico: Array.from({ length: 6 }, () => anterior('frete', 'Frete')),
    })
    expect(s.categoriaId).toBeNull()
  })
})

describe('autonomia', () => {
  const regraSugestao = sugerirCategoriaDoMovimento({
    movimento: mov(),
    regras: [regra()],
    historico: SEM_HISTORICO,
  })
  const historicoForte = sugerirCategoriaDoMovimento({
    movimento: mov(),
    regras: [],
    historico: Array.from({ length: 6 }, () => ({
      chave: chaveDoMovimento(mov()),
      categoriaId: 'frete',
      categoria: 'Frete',
    })),
  })
  const semSugestao = sugerirCategoriaDoMovimento({ movimento: mov(), regras: [], historico: [] })

  const modo = (m: PoliticaDeAutonomia['modo']): PoliticaDeAutonomia => ({
    modo: m,
    limiar: LIMIAR_PADRAO,
  })

  it('no modo sugestão NADA roda sozinho, nem regra aprovada', () => {
    expect(podeAplicarSozinho(regraSugestao, modo('sugestao'))).toBe(false)
    expect(podeAplicarSozinho(historicoForte, modo('sugestao'))).toBe(false)
  })

  it('no modo regra_aprovada só a regra passa; histórico não', () => {
    expect(podeAplicarSozinho(regraSugestao, modo('regra_aprovada'))).toBe(true)
    expect(podeAplicarSozinho(historicoForte, modo('regra_aprovada'))).toBe(false)
  })

  it('no modo assistido o histórico acima do limiar passa', () => {
    expect(podeAplicarSozinho(historicoForte, modo('assistido'))).toBe(true)
  })

  it('nada sem categoria roda sozinho, em modo nenhum', () => {
    for (const m of ['sugestao', 'assistido', 'regra_aprovada'] as const) {
      expect(podeAplicarSozinho(semSugestao, modo(m))).toBe(false)
    }
  })

  it('o que exige revisão nunca roda sozinho, mesmo no assistido', () => {
    const fraco = sugerirCategoriaDoMovimento({
      movimento: mov(),
      regras: [],
      historico: [{ chave: chaveDoMovimento(mov()), categoriaId: 'frete', categoria: 'Frete' }],
    })
    expect(fraco.exigeRevisao).toBe(true)
    expect(podeAplicarSozinho(fraco, modo('assistido'))).toBe(false)
  })

  it('limiar mais alto que a confiança barra a aplicação', () => {
    expect(podeAplicarSozinho(historicoForte, { modo: 'assistido', limiar: 1.01 })).toBe(false)
  })
})

describe('prévia do lote', () => {
  it('separa aplicável, revisão e sem sugestão, com dinheiro por categoria', () => {
    const movimentos = [
      mov({ id: 'a', favorecido: 'CORREIOS', valor: 100 }),
      mov({ id: 'b', favorecido: 'DESCONHECIDO', valor: 50 }),
      mov({ id: 'c', favorecido: 'CORREIOS', valor: 30 }),
    ]
    const sugestoes = sugerirEmLote(movimentos, [regra()], [])
    const valores = new Map(movimentos.map((m) => [m.id, m.valor]))
    const r = resumirLote(sugestoes, valores, { modo: 'regra_aprovada', limiar: LIMIAR_PADRAO })

    expect(r.total).toBe(3)
    expect(r.aplicaveis).toBe(2)
    expect(r.semSugestao).toBe(1)
    expect(r.valorAplicavel).toBe(130)
    expect(r.valorTotal).toBe(180)
    expect(r.porCategoria).toEqual([{ categoria: 'Frete', qtd: 2, valor: 130 }])
  })

  it('em modo sugestão nada é aplicável, e o total continua o mesmo', () => {
    const movimentos = [mov({ id: 'a', valor: 100 })]
    const sugestoes = sugerirEmLote(movimentos, [regra()], [])
    const r = resumirLote(sugestoes, new Map([['a', 100]]), {
      modo: 'sugestao',
      limiar: LIMIAR_PADRAO,
    })
    expect(r.aplicaveis).toBe(0)
    expect(r.paraRevisao).toBe(1)
    expect(r.valorTotal).toBe(100)
  })
})
