import { Ico, type NomeIcone } from './IconesUi'

/**
 * Identidade visual de instituições e categorias.
 *
 * Os mockups mostram o logotipo de cada banco na linha da conta — é o que
 * faz a tela ser reconhecível de relance. Embutir a arte registrada de cada
 * marca não é opção num repositório público; o monograma na COR OFICIAL da
 * instituição entrega o mesmo reconhecimento imediato sem redistribuir
 * logotipo de terceiro.
 */

interface Marca {
  cor: string
  texto?: string
  icone?: NomeIcone
  /** Marcas de fundo claro (BB, PagBank) precisam de texto escuro. */
  textoCor?: string
  /** Logomarca real, hospedada no Storage do projeto — fora do repositório. */
  logo?: string
}

// As logomarcas ficam num bucket público do Supabase Storage, importadas do
// Brandfetch por uma edge function. O repositório é público; a arte
// registrada mora no Storage do dono, não no git.
const STORAGE = 'https://gxzvlknlxwihooqgctst.supabase.co/storage/v1/object/public/marcas'

const MARCAS: { chave: RegExp; marca: Marca }[] = [
  { chave: /mercado\s*pago/i, marca: { cor: '#009EE3', texto: 'MP', logo: `${STORAGE}/mercado-pago.jpeg` } },
  // Intermedium ANTES de Inter: Intermedium é o nome antigo do próprio Banco
  // Inter, então usa a mesma logomarca. Sem esta linha o `\binter\b` não
  // casaria ("intermedium" não tem fronteira depois de "inter") e o cartão
  // cairia no tile neutro.
  { chave: /intermedium/i, marca: { cor: '#FF7A00', texto: 'in', logo: `${STORAGE}/inter.jpeg` } },
  { chave: /\binter\b/i, marca: { cor: '#FF7A00', texto: 'in', logo: `${STORAGE}/inter.jpeg` } },
  { chave: /sicoob/i, marca: { cor: '#00AE9D', texto: 'Si', logo: `${STORAGE}/sicoob.jpeg` } },
  // Infinite ANTES de Bradesco: é o cartão preto, e o vermelho da conta
  // corrente do Rafael (PF) não pode ser o mesmo tile do cartão.
  { chave: /infinite/i, marca: { cor: '#0A0A0A', texto: 'B', textoCor: '#D9C08A', logo: `${STORAGE}/bradesco-infinite.png` } },
  { chave: /bradesco/i, marca: { cor: '#CC092F', texto: 'B', logo: `${STORAGE}/bradesco.png` } },
  { chave: /nubank|nu\s*pagamentos/i, marca: { cor: '#820AD1', texto: 'Nu' } },
  // Digio, Next e Méliuz ainda não têm arte no bucket — o monograma vai na
  // cor da marca, que é o que distingue o cartão de relance. Basta subir
  // `digio.png`, `next.png` e `meliuz.png` para `marcas` e acrescentar o
  // campo `logo`; o tile troca sozinho.
  { chave: /digio/i, marca: { cor: '#0F2AC8', texto: 'di' } },
  { chave: /m[eé]liuz/i, marca: { cor: '#E5005A', texto: 'M' } },
  { chave: /\bnext\b/i, marca: { cor: '#00FF5F', texto: 'n', textoCor: '#0B0B0B' } },
  { chave: /ita[uú]/i, marca: { cor: '#EC7000', texto: 'It' } },
  { chave: /santander/i, marca: { cor: '#EC0000', texto: 'S' } },
  { chave: /banco do brasil/i, marca: { cor: '#F9DD16', texto: 'BB', textoCor: '#1A3C8C' } },
  { chave: /caixa econ|\bcef\b/i, marca: { cor: '#005CA9', texto: 'CX' } },
  { chave: /pagseguro|pagbank/i, marca: { cor: '#FFC801', texto: 'PB', textoCor: '#1A1A1A' } },
  { chave: /stone/i, marca: { cor: '#00A868', texto: 'St' } },
  { chave: /\bpix\b/i, marca: { cor: '#32BCAD', texto: 'Px' } },
  { chave: /yampi/i, marca: { cor: '#7C3AED', texto: 'Y' } },
  { chave: /shopify/i, marca: { cor: '#95BF47', texto: 'S', textoCor: '#1E2A10' } },
  { chave: /tiktok/i, marca: { cor: '#FE2C55', texto: 'Tk' } },
  { chave: /melhor\s*envio/i, marca: { cor: '#0FAAFF', texto: 'ME' } },
  // Dinheiro físico não tem marca: o cofre dourado é o símbolo da casa.
  { chave: /dinheiro|esp[eé]cie|caixa\s+(f[ií]sico|operacional)/i, marca: { cor: '#E9C583', icone: 'cofre', textoCor: '#141310' } },
]

function marcaDe(nome: string): Marca | null {
  for (const { chave, marca } of MARCAS) if (chave.test(nome)) return marca
  return null
}

/**
 * Tile quadrado com o monograma da instituição.
 *
 * Sem marca conhecida, cai no tile neutro com a inicial — a linha continua
 * tendo âncora visual, só não tem cor de banco.
 */
export function TileMarca({
  nome,
  tamanho = 38,
}: {
  /** Texto onde procurar a marca — nome e banco concatenados funcionam. */
  nome: string
  tamanho?: number
}) {
  const m = marcaDe(nome)
  const raio = Math.round(tamanho * 0.28)

  if (!m) {
    const inicial = (nome.trim()[0] ?? '?').toUpperCase()
    return (
      <span
        aria-hidden
        style={{
          width: tamanho,
          height: tamanho,
          flex: 'none',
          borderRadius: raio,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(233,197,131,.14)',
          border: '1px solid rgba(233,197,131,.3)',
          color: '#E9C583',
        }}
      >
        <span className="font-display" style={{ fontWeight: 600, fontSize: tamanho * 0.42 }}>
          {inicial}
        </span>
      </span>
    )
  }

  // O monograma é desenhado SEMPRE, e a logomarca do Storage entra por cima.
  // Antes eram dois ramos exclusivos, e o comentário mentia: com `logo`
  // apontando para um arquivo que ainda não subiu, sobrava um quadrado da cor
  // do banco e nada dentro. Empilhado, a arte que falta simplesmente não cobre
  // o monograma — e no dia em que o arquivo aparece no bucket, o tile troca
  // sozinho, sem tocar em código. `alt=""` é o que faz o navegador esconder a
  // imagem quebrada em vez de desenhar o ícone de foto rasgada.
  return (
    <span
      aria-hidden
      style={{
        position: 'relative',
        width: tamanho,
        height: tamanho,
        flex: 'none',
        borderRadius: raio,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: m.cor,
        color: m.textoCor ?? '#FFFFFF',
        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.18)',
      }}
    >
      {m.icone ? (
        <Ico n={m.icone} tamanho={tamanho * 0.5} />
      ) : (
        <span
          className="font-sans"
          style={{ fontWeight: 800, fontSize: tamanho * 0.4, letterSpacing: '-.02em' }}
        >
          {m.texto}
        </span>
      )}
      {m.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.logo}
          alt=""
          width={tamanho}
          height={tamanho}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : null}
    </span>
  )
}

/**
 * Ícone de uma categoria financeira, por palavra-chave do nome.
 *
 * O mockup põe um pictograma antes de cada categoria nas tabelas. O mapa é
 * heurístico de propósito: categoria é cadastro livre do usuário, e um campo
 * "ícone" no banco seria mais um cadastro para esquecer.
 *
 * Aceita nulo de propósito: lançamento vindo do extrato entra SEM categoria
 * até alguém classificar, e a coluna precisa desenhar alguma coisa. A versão
 * que exigia texto derrubava a tela inteira de Lançamentos com "This page
 * couldn't load" no dia em que o primeiro crédito a classificar apareceu.
 */
export function iconeDaCategoria(nome: string | null | undefined): NomeIcone {
  const n = (nome ?? '').toLowerCase()
  if (/market|ads|tr[aá]fego|an[uú]ncio|meta|google/.test(n)) return 'megafone'
  if (/embalag|caixa|sacola/.test(n)) return 'caixa'
  if (/frete|envio|log[ií]st|correio|transporte/.test(n)) return 'carrinho'
  if (/frasco|insumo|mat[eé]ria|perfume|fragr[aâ]nc/.test(n)) return 'frasco'
  if (/taxa|tarifa|imposto|tribut|juros|multa/.test(n)) return 'porcento'
  if (/saas|ferramenta|software|assinatura|plano|app/.test(n)) return 'engrenagem'
  if (/transfer/.test(n)) return 'transferir'
  if (/receb|venda|receita|repasse|cliente/.test(n)) return 'entrada'
  if (/fornecedor|compra/.test(n)) return 'caixa'
  if (/sal[aá]rio|pessoal|pr[oó]-?labore|aporte|retirada|s[oó]cio/.test(n)) return 'pessoas'
  if (/aluguel|energia|[aá]gua|luz|internet|fixa/.test(n)) return 'banco'
  if (/estorno|reembolso|devolu/.test(n)) return 'repetir'
  if (/contab|fiscal|nota/.test(n)) return 'documento'
  return 'etiqueta'
}
