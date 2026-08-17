import { describe, expect, it } from 'vitest'

import {
  completarEmail,
  decidirBloqueio,
  decidirFreioDoPortal,
  esperaEmPalavras,
  esperaPorFalhas,
  forcaDaSenha,
  sugestaoDeEmail,
  validarSenhaNova,
} from '../acesso'

describe('completarEmail', () => {
  it('acrescenta o domínio da casa quando não há arroba', () => {
    expect(completarEmail('rafael')).toBe('rafael@frenesiperfumes.com.br')
    expect(completarEmail('  Rafael.Araujo  ')).toBe('rafael.araujo@frenesiperfumes.com.br')
  })

  it('completa o domínio digitado pela metade', () => {
    expect(completarEmail('rafael@')).toBe('rafael@frenesiperfumes.com.br')
    expect(completarEmail('rafael@frene')).toBe('rafael@frenesiperfumes.com.br')
    expect(completarEmail('rafael@frenesiperfumes.com')).toBe('rafael@frenesiperfumes.com.br')
  })

  it('não mexe em domínio diferente — adivinhar aqui vira erro de senha', () => {
    expect(completarEmail('rafael@gmail.com')).toBe('rafael@gmail.com')
    expect(completarEmail('rafael@outraempresa.com.br')).toBe('rafael@outraempresa.com.br')
  })

  it('não inventa endereço a partir de nada', () => {
    expect(completarEmail('')).toBe('')
    expect(completarEmail('   ')).toBe('')
    expect(completarEmail('@frenesiperfumes.com.br')).toBe('@frenesiperfumes.com.br')
  })

  it('a sugestão some quando o valor já está completo', () => {
    expect(sugestaoDeEmail('rafael')).toBe('rafael@frenesiperfumes.com.br')
    expect(sugestaoDeEmail('rafael@frenesiperfumes.com.br')).toBeNull()
    expect(sugestaoDeEmail('rafael@gmail.com')).toBeNull()
    expect(sugestaoDeEmail('')).toBeNull()
  })
})

describe('bloqueio por tentativas', () => {
  const agora = new Date('2026-08-16T12:00:00Z')
  const atras = (segundos: number) => new Date(agora.getTime() - segundos * 1000)

  it('as quatro primeiras falhas passam — errar a senha é humano', () => {
    expect(esperaPorFalhas(4)).toBe(0)
    const falhas = [atras(10), atras(20), atras(30), atras(40)]
    expect(decidirBloqueio(falhas, [], agora).bloqueado).toBe(false)
  })

  it('a quinta falha trava por um minuto, contado da última', () => {
    const falhas = Array.from({ length: 5 }, (_, i) => atras(i * 5))
    const d = decidirBloqueio(falhas, [], agora)
    expect(d.bloqueado).toBe(true)
    expect(d.faltamSegundos).toBe(60)
    expect(d.motivo).toContain('e-mail')
  })

  it('a espera termina sozinha', () => {
    const falhas = Array.from({ length: 5 }, (_, i) => atras(70 + i))
    expect(decidirBloqueio(falhas, [], agora).bloqueado).toBe(false)
  })

  it('falha fora da janela não conta', () => {
    const velhas = Array.from({ length: 9 }, () => atras(16 * 60))
    expect(decidirBloqueio(velhas, [], agora).bloqueado).toBe(false)
  })

  it('a escada sobe: 8 falhas viram 5 minutos, 12 viram 30', () => {
    expect(esperaPorFalhas(8)).toBe(300)
    expect(esperaPorFalhas(12)).toBe(1800)
  })

  it('o IP tem teto próprio — varredura por vários e-mails também trava', () => {
    const doIp = Array.from({ length: 20 }, (_, i) => atras(i))
    const d = decidirBloqueio([], doIp, agora)
    expect(d.bloqueado).toBe(true)
    expect(d.motivo).toContain('origem')
  })

  it('vale sempre o bloqueio que termina mais tarde', () => {
    const email = Array.from({ length: 5 }, () => atras(1)) // 60s a partir de agora
    const ip = Array.from({ length: 20 }, () => atras(2)) // 300s a partir de agora
    expect(decidirBloqueio(email, ip, agora).faltamSegundos).toBe(298)
  })

  it('traduz a espera sem fazer o usuário calcular', () => {
    expect(esperaEmPalavras(45)).toBe('45 segundos')
    expect(esperaEmPalavras(61)).toBe('2 minutos')
    expect(esperaEmPalavras(300)).toBe('5 minutos')
  })
})

describe('validarSenhaNova', () => {
  it('exige tamanho e confirmação', () => {
    expect(validarSenhaNova('curta', 'curta')).toEqual({
      ok: false,
      erro: 'A senha precisa ter pelo menos 10 caracteres.',
    })
    expect(validarSenhaNova('senha-boa-e-longa', 'outra')).toEqual({
      ok: false,
      erro: 'A confirmação não bate com a senha.',
    })
  })

  it('recusa o previsível e o que contém o próprio e-mail', () => {
    expect(validarSenhaNova('frenesi2026!', 'frenesi2026!').ok).toBe(false)
    expect(validarSenhaNova('rafael-de-2026', 'rafael-de-2026', 'rafael@x.com').ok).toBe(false)
  })

  it('aceita uma senha longa e sem relação com a marca', () => {
    expect(validarSenhaNova('trilha-azul-42-cedro', 'trilha-azul-42-cedro').ok).toBe(true)
  })
})

describe('forcaDaSenha', () => {
  it('classifica sem decidir nada', () => {
    expect(forcaDaSenha('').nivel).toBe(0)
    expect(forcaDaSenha('abcdef').nivel).toBe(1)
    expect(forcaDaSenha('abcdefghij1').nivel).toBe(2)
    expect(forcaDaSenha('Trilha-Azul-42-Cedro!').nivel).toBe(3)
  })
})

describe('decidirFreioDoPortal', () => {
  const agora = new Date('2026-08-17T12:00:00Z')
  const hoje = (minutosAtras: number) => new Date(agora.getTime() - minutosAtras * 60_000)

  it('deixa o cliente legítimo consultar à vontade', () => {
    // Sete consultas em quinze minutos é gente corrigindo o CPF, não varredura.
    const consultas = [0, 1, 2, 3, 5, 8, 11].map(hoje)
    expect(decidirFreioDoPortal(consultas, consultas, agora).bloqueado).toBe(false)
  })

  it('freia a partir da oitava consulta da mesma identidade', () => {
    const consultas = [0, 1, 2, 3, 4, 5, 6, 7].map(hoje)
    const freio = decidirFreioDoPortal(consultas, [], agora)
    expect(freio.bloqueado).toBe(true)
    expect(freio.motivo).toBe('consultas demais')
    // A espera conta da ÚLTIMA consulta: insistir custa mais do que parar.
    expect(freio.faltamSegundos).toBe(60)
  })

  it('o teto por origem é mais alto — celular põe muita gente no mesmo IP', () => {
    const quarenta = Array.from({ length: 40 }, (_, i) => hoje(i % 14))
    expect(decidirFreioDoPortal([], quarenta, agora).bloqueado).toBe(false)

    const cem = Array.from({ length: 100 }, (_, i) => hoje(i % 14))
    const freio = decidirFreioDoPortal([], cem, agora)
    expect(freio.bloqueado).toBe(true)
    expect(freio.motivo).toBe('consultas demais desta origem')
  })

  it('o que está fora da janela não pesa', () => {
    const antigas = Array.from({ length: 30 }, (_, i) => hoje(20 + i))
    expect(decidirFreioDoPortal(antigas, antigas, agora).bloqueado).toBe(false)
  })
})
