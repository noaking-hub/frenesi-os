import { createHash, createHmac } from 'node:crypto'

/**
 * Assinatura AWS Signature V4.
 *
 * A API da Pagaleve fica atrás de um AWS API Gateway, e a sondagem descobriu
 * isso da forma mais direta possível: o gateway respondeu, palavra por palavra,
 * "Authorization header requires 'Credential' parameter... 'Signature'...
 * 'SignedHeaders'... 'X-Amz-Date'". Não é Bearer nem Basic — cada requisição
 * precisa ser assinada. A "Chave de API" do painel é um Access Key ID e a
 * "Senha da Chave de API" é um Secret Access Key.
 *
 * Implementado à mão, e não com o SDK da AWS, pelo mesmo motivo de todos os
 * outros conectores deste ERP: o algoritmo cabe em oitenta linhas e é
 * inteiramente determinístico, enquanto o SDK traz dezenas de megabytes para
 * dentro de uma função serverless que tem limite de tamanho.
 *
 * O algoritmo é público e fechado — quatro etapas, sem espaço para
 * interpretação. É por isso que ele pode ser testado sem rede: mesma entrada,
 * mesma assinatura, sempre.
 */

export interface CredencialAws {
  accessKeyId: string
  secretAccessKey: string
  region: string
  service: string
}

export interface PedidoAssinado {
  url: string
  headers: Record<string, string>
}

function sha256(dado: string): string {
  return createHash('sha256').update(dado, 'utf8').digest('hex')
}

function hmac(chave: Buffer | string, dado: string): Buffer {
  return createHmac('sha256', chave).update(dado, 'utf8').digest()
}

/** `20260815T235959Z` e `20260815` — os dois formatos que a AWS exige. */
export function carimbos(agora: Date): { completo: string; dia: string } {
  const completo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { completo, dia: completo.slice(0, 8) }
}

/**
 * Assina e devolve os cabeçalhos prontos.
 *
 * `host` entra assinado obrigatoriamente: sem ele a AWS recusa, porque é o que
 * impede a assinatura de ser reaproveitada contra outro endpoint.
 */
export function assinar(
  cred: CredencialAws,
  metodo: string,
  urlCompleta: string,
  corpo: string,
  agora: Date,
  extras: Record<string, string> = {},
): PedidoAssinado {
  const url = new URL(urlCompleta)
  const { completo, dia } = carimbos(agora)
  const hashDoCorpo = sha256(corpo)

  // Cabeçalhos assinados: minúsculos, ordenados, com espaços colapsados. A
  // ordem não é estética — a AWS refaz esta string do lado dela e compara.
  const cabecalhos: Record<string, string> = {
    host: url.host,
    'x-amz-date': completo,
    'x-amz-content-sha256': hashDoCorpo,
    ...Object.fromEntries(Object.entries(extras).map(([k, v]) => [k.toLowerCase(), v])),
  }
  const nomes = Object.keys(cabecalhos).sort()
  const canonicos = nomes.map((n) => `${n}:${cabecalhos[n].trim().replace(/\s+/g, ' ')}\n`).join('')
  const assinados = nomes.join(';')

  // Query em ordem alfabética, com cada par percent-encoded.
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const requisicaoCanonica = [
    metodo.toUpperCase(),
    url.pathname || '/',
    query,
    canonicos,
    assinados,
    hashDoCorpo,
  ].join('\n')

  const escopo = `${dia}/${cred.region}/${cred.service}/aws4_request`
  const paraAssinar = [
    'AWS4-HMAC-SHA256',
    completo,
    escopo,
    sha256(requisicaoCanonica),
  ].join('\n')

  // A chave de assinatura é derivada em cascata — data, região, serviço — de
  // modo que uma assinatura vazada só serve para aquele dia, naquela região,
  // naquele serviço.
  const kData = hmac(`AWS4${cred.secretAccessKey}`, dia)
  const kRegion = hmac(kData, cred.region)
  const kService = hmac(kRegion, cred.service)
  const kSigning = hmac(kService, 'aws4_request')
  const assinatura = createHmac('sha256', kSigning).update(paraAssinar, 'utf8').digest('hex')

  return {
    url: urlCompleta,
    headers: {
      ...cabecalhos,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${escopo}, ` +
        `SignedHeaders=${assinados}, Signature=${assinatura}`,
    },
  }
}
