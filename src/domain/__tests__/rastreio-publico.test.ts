import { describe, expect, it } from 'vitest'

import {
  chaveDoPedido,
  documentoConfere,
  resumirDescricao,
  rotuloPublico,
  urlDaTransportadora,
} from '..'

describe('descrição resumida', () => {
  it('tira o apêndice de pesquisa que os Correios grudam na entrega', () => {
    // Texto real da API da Frenet. Na timeline estreita do celular ele ocupa
    // três linhas e empurra o que importa para fora da tela.
    const cru =
      'Objeto entregue ao destinatário - Queremos te ouvir! Responda a uma pesquisa rápida ' +
      'e nos ajude a melhorar a sua experiência: https://survey3.medallia.com/?correios-nps'
    expect(resumirDescricao(cru)).toBe('Objeto entregue ao destinatário')
  })

  it('tira instrução de operação sem apagar a ocorrência', () => {
    expect(resumirDescricao('Objeto em transferência - por favor aguarde')).toBe(
      'Objeto em transferência',
    )
    expect(
      resumirDescricao('Objeto saiu para entrega ao destinatário - É preciso ter alguém no endereço'),
    ).toBe('Objeto saiu para entrega ao destinatário')
  })

  it('texto que não tem apêndice atravessa intacto', () => {
    expect(resumirDescricao('Objeto postado')).toBe('Objeto postado')
    expect(resumirDescricao('[Muriaé] [MRE -MG] Seu entregador retirou a encomenda')).toBe(
      '[Muriaé] [MRE -MG] Seu entregador retirou a encomenda',
    )
  })

  it('nunca devolve vazio — na dúvida, o texto cru', () => {
    // Se a limpeza comer tudo, o cliente prefere ver algo estranho a ver nada.
    expect(resumirDescricao('https://rastreio.exemplo.com/abc')).toBe(
      'https://rastreio.exemplo.com/abc',
    )
  })
})

describe('rótulo do cliente', () => {
  it('entrega fecha com a data, inclusive na entrega local', () => {
    expect(rotuloPublico('entregue', '2026-08-12T14:12:00.000Z')).toBe('Entregue em 12/08')
  })

  it('entregue sem data ainda diz entregue', () => {
    expect(rotuloPublico('entregue', null)).toBe('Entregue')
  })

  it('cada status tem texto próprio', () => {
    expect(rotuloPublico('em-transito', null)).toBe('A caminho')
    expect(rotuloPublico('sem-movimentacao', null)).toContain('atrasada')
  })
})

describe('URL da transportadora', () => {
  it('monta o link de quem a gente conhece', () => {
    expect(urlDaTransportadora('Correios', 'AD778124948BR')).toContain('AD778124948BR')
    expect(urlDaTransportadora('Jadlog', '614554609')).toContain('614554609')
  })

  it('transportadora desconhecida não ganha link genérico', () => {
    // Link errado é pior que link nenhum: o cliente clica, não acha o pedido
    // e conclui que o rastreio está quebrado.
    expect(urlDaTransportadora(null, 'TXAQ485921993tx')).toBeNull()
    expect(urlDaTransportadora('Correios', null)).toBeNull()
  })
})

describe('conferência do documento', () => {
  const dono = { email: 'Isabel@Exemplo.com', cpf: '123.456.789-09' }

  it('aceita e-mail e CPF em qualquer formatação', () => {
    expect(documentoConfere('isabel@exemplo.com', dono)).toBe(true)
    expect(documentoConfere('12345678909', dono)).toBe(true)
    expect(documentoConfere('123.456.789-09', dono)).toBe(true)
  })

  it('documento de outra pessoa não abre o pedido', () => {
    expect(documentoConfere('outro@exemplo.com', dono)).toBe(false)
    expect(documentoConfere('99999999999', dono)).toBe(false)
  })

  it('cadastro sem CPF não vira porta aberta', () => {
    // Sem esta guarda, todo cliente sem CPF responderia a qualquer sequência
    // de onze dígitos — e são centenas deles na base.
    expect(documentoConfere('12345678909', { email: 'a@b.com', cpf: null })).toBe(false)
    expect(documentoConfere('12345678909', { email: 'a@b.com', cpf: '' })).toBe(false)
    expect(documentoConfere('a@b.com', { email: null, cpf: '12345678909' })).toBe(false)
  })

  it('vazio nunca confere', () => {
    expect(documentoConfere('', dono)).toBe(false)
    expect(documentoConfere('   ', dono)).toBe(false)
  })
})

describe('chave do pedido', () => {
  it('reconhece o número da Yampi em qualquer das formas', () => {
    expect(chaveDoPedido('YP-1510190959842609').yampi).toBe('YP-1510190959842609')
    expect(chaveDoPedido('1510190959842609').yampi).toBe('YP-1510190959842609')
    expect(chaveDoPedido('yp 1510190959842609').yampi).toBe('YP-1510190959842609')
  })

  it('reconhece o número da loja', () => {
    // O site recebe visitantes dos dois mundos e não sabe qual número o
    // cliente tem em mãos — aceitar os dois é o que dispensa a pergunta.
    expect(chaveDoPedido('SH-1885').loja).toBe('1885')
    expect(chaveDoPedido('#1885').loja).toBe('1885')
    expect(chaveDoPedido('SH-1885').yampi).toBeNull()
  })

  it('lixo não vira consulta', () => {
    expect(chaveDoPedido('')).toEqual({ yampi: null, loja: null })
    expect(chaveDoPedido('abc')).toEqual({ yampi: null, loja: null })
  })
})
