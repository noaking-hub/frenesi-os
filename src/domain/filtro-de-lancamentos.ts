/**
 * O filtro da tela de Lançamentos, traduzido de URL para consulta.
 *
 * Esta lógica morava dentro da página, misturada com JSX, e por isso ninguém
 * percebia que ela nunca chegava ao banco: `carregarLancamentos()` era chamada
 * SEM argumento, as 1.268 linhas vinham inteiras e o `?q=` era aplicado com
 * `Array.filter` depois. Com `?periodo=tudo&q=Icaro` a tela transferia 434 KB
 * para desenhar UMA linha — e era isso que o Chrome chamava de "Página sem
 * resposta".
 *
 * Separar a normalização em função pura tem um motivo além da testabilidade:
 * a MESMA decisão precisa valer em dois lugares que não podem divergir — a
 * consulta que o Postgres roda e os links que a tela desenha (paginação,
 * "voltar à lista", abrir detalhe). Quando a janela era recalculada em cada
 * um, "7 dias" na consulta e "7 dias" no link não eram exatamente a mesma
 * janela nos dias de virada de mês.
 *
 * Nada aqui toca I/O: quem chama o banco é src/data/financeiro.ts.
 */

/** Os atalhos de janela que a barra de filtros oferece. */
export type PeriodoDeLancamentos = 'hoje' | '7' | '30' | 'mes' | 'tudo'

const PERIODOS: PeriodoDeLancamentos[] = ['hoje', '7', '30', 'mes', 'tudo']

/** Quantas linhas cabem numa página da lista. */
export const LANCAMENTOS_POR_PAGINA = 50

/** O filtro cru, exatamente como ele chega na URL. */
export interface BuscaDeLancamentos {
  situacao?: string
  tipo?: string
  categoria?: string
  conta?: string
  centro?: string
  q?: string
  venc?: string
  de?: string
  ate?: string
  periodo?: string
  pagina?: string
  recorrente?: string
  lancamento?: string
}

/** O filtro já decidido, pronto para virar cláusula no Postgres. */
export interface FiltroDeLancamentos {
  /** Atalho em vigor, ou null quando a janela foi digitada à mão. */
  atalho: PeriodoDeLancamentos | null
  /** Janela pelo DIA DO MOVIMENTO. String vazia é "sem limite deste lado". */
  de: string
  ate: string
  situacao: string | null
  tipo: string | null
  categoria: string | null
  conta: string | null
  centro: string | null
  venc: string | null
  recorrente: string | null
  q: string | null
  pagina: number
  lancamento: string | null
}

/** Vazio vira null, e não string vazia: `.eq('tipo','')` casaria com nada. */
function texto(v: string | undefined): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

/**
 * N dias para trás de uma data AAAA-MM-DD, em UTC para não escorregar de dia.
 *
 * `new Date('2026-08-17')` é meia-noite UTC; em São Paulo isso ainda é dia 16.
 * Ancorar no meio-dia mantém a conta longe das duas bordas — a do fuso e a do
 * horário de verão.
 */
export function recuarDia(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Da URL para a consulta.
 *
 * Duas regras que parecem detalhe e não são:
 *
 * 1. A janela padrão é HOJE, não "todo o histórico". Abrir a tela carregando o
 *    histórico inteiro era segundos de espera para responder uma pergunta que
 *    quase sempre é sobre o dia. Quem precisa do resto pede: "Tudo" está a um
 *    clique e o rodapé sempre diz qual janela está valendo.
 *
 * 2. Data digitada à mão VENCE o atalho — quem escolheu 01/06 quer 01/06.
 *    Manter os dois faria a tela obedecer a um e exibir o outro aceso.
 */
export function normalizarFiltroDeLancamentos(
  busca: BuscaDeLancamentos,
  hoje: string,
): FiltroDeLancamentos {
  const de = texto(busca.de)
  const ate = texto(busca.ate)
  const temDataManual = Boolean(de || ate)

  const atalho: PeriodoDeLancamentos | null = temDataManual
    ? null
    : PERIODOS.includes((busca.periodo ?? '') as PeriodoDeLancamentos)
      ? (busca.periodo as PeriodoDeLancamentos)
      : 'hoje'

  const janela = temDataManual
    ? { de: de ?? '', ate: ate ?? '' }
    : atalho === 'tudo'
      ? { de: '', ate: '' }
      : atalho === 'mes'
        ? { de: `${hoje.slice(0, 7)}-01`, ate: hoje }
        : // "7 dias" é hoje mais os SEIS anteriores, não hoje mais sete: o
          // botão promete uma semana, e sete dias para trás a partir de hoje
          // são oito dias na tela.
          { de: recuarDia(hoje, atalho === '30' ? 29 : atalho === '7' ? 6 : 0), ate: hoje }

  return {
    atalho,
    de: janela.de,
    ate: janela.ate,
    situacao: texto(busca.situacao),
    tipo: texto(busca.tipo),
    categoria: texto(busca.categoria),
    conta: texto(busca.conta),
    centro: texto(busca.centro),
    venc: texto(busca.venc),
    recorrente: texto(busca.recorrente),
    q: texto(busca.q),
    // Página fora do intervalo não vira erro nem tela vazia: o teto real só é
    // conhecido depois de contar as linhas, então aqui só se garante o piso.
    // Quem grampeia no teto é a consulta, que é quem sabe o total.
    pagina: Math.max(1, Math.trunc(Number(busca.pagina ?? '1')) || 1),
    lancamento: texto(busca.lancamento),
  }
}

/**
 * Como a janela se descreve no rodapé e nas notas dos indicadores.
 *
 * Existe aqui, e não na tela, porque o mesmo texto aparece em três lugares e
 * escrever "todo o histórico" diferente em um deles fazia parecer que os
 * cards falavam de recortes distintos.
 */
export function periodoPorExtenso(
  filtro: Pick<FiltroDeLancamentos, 'de' | 'ate'>,
  diaCurto: (iso: string) => string,
): string {
  if (!filtro.de && !filtro.ate) return 'todo o histórico'
  return `${filtro.de ? diaCurto(filtro.de) : 'início'} a ${filtro.ate ? diaCurto(filtro.ate) : 'hoje'}`
}

/**
 * Quantos filtros o operador ligou — o número do botão "Limpar N filtros".
 *
 * `periodo` e `pagina` ficam de fora de propósito: período tem sempre um valor
 * (o padrão é "hoje") e contá-lo faria o botão aparecer numa tela sem filtro
 * nenhum; página não é filtro, é posição.
 */
export const CHAVES_DE_FILTRO = [
  'situacao',
  'tipo',
  'categoria',
  'conta',
  'centro',
  'q',
  'de',
  'ate',
  'recorrente',
  'venc',
] as const
