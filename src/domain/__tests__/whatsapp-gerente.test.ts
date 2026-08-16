import { describe, expect, it } from 'vitest'

import {
  descricaoDoRecebido,
  interpretarComando,
  recadoParaTipoNaoSuportado,
  normalizarTelefone,
  paraTextoDeWhatsapp,
} from '../whatsapp-gerente'

describe('texto para WhatsApp', () => {
  it('converte negrito de dois asteriscos para um', () => {
    expect(paraTextoDeWhatsapp('**Resumo** do dia')).toBe('*Resumo* do dia')
  })

  it('some com títulos de markdown, que no celular viram lixo visual', () => {
    expect(paraTextoDeWhatsapp('## Diagnóstico\ntexto')).toBe('Diagnóstico\ntexto')
  })

  it('padroniza marcadores de lista', () => {
    expect(paraTextoDeWhatsapp('- um\n- dois')).toBe('• um\n• dois')
  })

  it('colapsa linhas em branco em excesso', () => {
    expect(paraTextoDeWhatsapp('a\n\n\n\nb')).toBe('a\n\nb')
  })
})

describe('comandos', () => {
  it('reconhece aprovar e cancelar com código', () => {
    expect(interpretarComando('aprovar a1b2c3d4')).toEqual({
      verbo: 'aprovar',
      prefixo: 'a1b2c3d4',
    })
    expect(interpretarComando('cancelar a1b2c3d4')).toEqual({
      verbo: 'cancelar',
      prefixo: 'a1b2c3d4',
    })
  })

  it('aceita as variações que uma pessoa realmente digita', () => {
    for (const t of ['Aprovado a1b2c3d4', 'CONFIRMAR a1b2c3d4', '  aprovo a1b2c3d4  ']) {
      expect(interpretarComando(t)?.verbo).toBe('aprovar')
    }
    expect(interpretarComando('cancela a1b2c3d4')?.verbo).toBe('cancelar')
  })

  it('NÃO reconhece intenção vaga — ela vai para o motor como pergunta', () => {
    for (const t of [
      'pode aprovar acho',
      'aprovar',
      'aprovar tudo',
      'sim',
      'aprovar a1b2c3d4 por favor',
      'acho que dá pra cancelar a1b2c3d4',
    ]) {
      expect(interpretarComando(t)).toBeNull()
    }
  })

  it('não confunde uma pergunta que contém a palavra com um comando', () => {
    expect(interpretarComando('o que preciso aprovar hoje?')).toBeNull()
  })

  it('exige código com forma de identificador', () => {
    expect(interpretarComando('aprovar tudo agora')).toBeNull()
    expect(interpretarComando('aprovar 12')).toBeNull()
  })
})

describe('telefone', () => {
  it('reduz formatações diferentes ao mesmo número', () => {
    expect(normalizarTelefone('+55 (62) 99261-7792')).toBe('5562992617792')
    expect(normalizarTelefone('5562992617792')).toBe('5562992617792')
  })
})

describe('mensagem que não é texto', () => {
  it('nomeia o que chegou, em português e por extenso', () => {
    expect(descricaoDoRecebido('audio')).toBe('um áudio')
    expect(descricaoDoRecebido('IMAGE')).toBe('uma imagem')
    expect(descricaoDoRecebido('location')).toBe('uma localização')
  })

  it('não trava em tipo desconhecido — a Meta inventa tipos novos', () => {
    expect(descricaoDoRecebido('holograma')).toBe('uma mensagem que não é texto')
    expect(descricaoDoRecebido(undefined)).toBe('uma mensagem que não é texto')
  })

  it('o recado diz o que fazer, não só o que falta', () => {
    const r = recadoParaTipoNaoSuportado('audio')
    expect(r).toContain('um áudio')
    expect(r).toContain('só leio texto')
    expect(r).toContain('Escreva a pergunta')
  })
})
