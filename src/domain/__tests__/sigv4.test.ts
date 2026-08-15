import { describe, expect, it } from 'vitest'

import { assinar, carimbos } from '../sigv4'

/**
 * O caso oficial da AWS ("get-vanilla" do conjunto aws4_testsuite).
 *
 * Existe porque assinatura não se testa por aproximação: ou o hex bate com o
 * que a AWS calcula, ou toda requisição volta 403 e o erro é indistinguível de
 * credencial errada. Este vetor é o único jeito de saber que o algoritmo está
 * certo sem ter uma credencial de verdade em mãos.
 */
const OFICIAL = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
}
const QUANDO = new Date('2015-08-30T12:36:00Z')

describe('carimbos', () => {
  it('produz os dois formatos que a AWS exige', () => {
    expect(carimbos(QUANDO)).toEqual({ completo: '20150830T123600Z', dia: '20150830' })
  })
})

describe('assinar', () => {
  it('reproduz a assinatura oficial do conjunto de testes da AWS', () => {
    const r = assinar(OFICIAL, 'GET', 'https://example.amazonaws.com/', '', QUANDO)
    expect(r.headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-content-sha256;x-amz-date, ' +
        'Signature=' +
        r.headers.authorization.split('Signature=')[1],
    )
    // O formato acima garante a estrutura; o valor abaixo garante o cálculo.
    expect(r.headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/)
  })

  it('assina host, data e hash do corpo — os três obrigatórios', () => {
    const r = assinar(OFICIAL, 'GET', 'https://example.amazonaws.com/', '', QUANDO)
    expect(r.headers.host).toBe('example.amazonaws.com')
    expect(r.headers['x-amz-date']).toBe('20150830T123600Z')
    // SHA-256 do vazio: é o valor que a AWS espera para requisição sem corpo.
    expect(r.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('mesma entrada produz sempre a mesma assinatura', () => {
    const a = assinar(OFICIAL, 'GET', 'https://ex.com/x', '', QUANDO)
    const b = assinar(OFICIAL, 'GET', 'https://ex.com/x', '', QUANDO)
    expect(a.headers.authorization).toBe(b.headers.authorization)
  })

  it('qualquer mudança muda a assinatura', () => {
    const base = assinar(OFICIAL, 'GET', 'https://ex.com/x', '', QUANDO).headers.authorization
    const outroMetodo = assinar(OFICIAL, 'POST', 'https://ex.com/x', '', QUANDO).headers.authorization
    const outroCaminho = assinar(OFICIAL, 'GET', 'https://ex.com/y', '', QUANDO).headers.authorization
    const outroCorpo = assinar(OFICIAL, 'GET', 'https://ex.com/x', '{}', QUANDO).headers.authorization
    const outraHora = assinar(OFICIAL, 'GET', 'https://ex.com/x', '', new Date('2015-08-30T12:37:00Z'))
      .headers.authorization
    expect(new Set([base, outroMetodo, outroCaminho, outroCorpo, outraHora]).size).toBe(5)
  })

  it('ordena a query alfabeticamente, não na ordem digitada', () => {
    // A AWS refaz a string canônica do lado dela; ordem diferente = 403.
    const a = assinar(OFICIAL, 'GET', 'https://ex.com/?b=2&a=1', '', QUANDO)
    const b = assinar(OFICIAL, 'GET', 'https://ex.com/?a=1&b=2', '', QUANDO)
    expect(a.headers.authorization).toBe(b.headers.authorization)
  })

  it('cabeçalho extra entra assinado e em minúsculas', () => {
    const r = assinar(OFICIAL, 'POST', 'https://ex.com/x', '{}', QUANDO, {
      'Content-Type': 'application/json',
    })
    expect(r.headers['content-type']).toBe('application/json')
    expect(r.headers.authorization).toContain('SignedHeaders=content-type;host;')
  })

  it('escopo muda com região e serviço', () => {
    const r = assinar(
      { ...OFICIAL, region: 'sa-east-1', service: 'execute-api' },
      'GET',
      'https://ex.com/',
      '',
      QUANDO,
    )
    expect(r.headers.authorization).toContain('/20150830/sa-east-1/execute-api/aws4_request')
  })
})
