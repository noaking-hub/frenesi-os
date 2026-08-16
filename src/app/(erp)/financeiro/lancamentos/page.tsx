import Link from 'next/link'
import type { ReactNode } from 'react'

import {
  AcaoPainel,
  Celula,
  Chip,
  ComTrilha,
  Colunas,
  Destaque,
  Etiqueta,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  Num,
  Painel,
  Pilha,
  RodapeTabela,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { iconeDaCategoria } from '@/components/erp/Marcas'
import { Mini, Progresso, RoscaLegenda } from '@/components/erp/Visualizacoes'
import { carregarLancamentos } from '@/data/financeiro'
import {
  brl,
  diaCurtoPt,
  plural,
  ROTULO_NATUREZA,
  ROTULO_SITUACAO_LANCAMENTO,
  saldoAberto,
  SEM_CATEGORIA,
  situacaoDe,
} from '@/domain'
import type { LancamentoGerencial, SituacaoLancamento } from '@/domain'

import { AcoesGerenciais, NovoCompromisso } from '../Compromissos'
import { dadosDaVendaManual } from '../dados-da-venda-manual'
import { VendaManual } from '../VendaManual'
import { ProvedorDeListas } from '../ListasDoFormulario'
import { BarraDeFiltros } from './Filtros'

/**
 * Lançamentos — o extrato consolidado de todas as contas.
 *
 * A tela nasceu como fila de contas a pagar e a receber, e é isso que ela
 * ainda faz no painel lateral. A LISTA, porém, responde outra pergunta — a que
 * se faz todo dia: o que entrou e o que saiu, em qual conta, quando. Por isso
 * ela é cronológica e decrescente, e por isso a data que manda é
 * `ocorridoEm`, a única que todo lançamento tem.
 *
 * A tela não guarda "status": ele é derivado de `situacaoDe` a cada leitura.
 * Uma coluna gravada faria a conta vencer à meia-noite sem ninguém tocar nela
 * e continuar mostrando "agendado" no dia seguinte ao vencimento.
 *
 * Os filtros vivem na URL, não em estado de cliente: assim o alerta do
 * Dashboard consegue abrir exatamente a fila que ele acusou
 * (`?situacao=vencido`), e o operador consegue mandar o link para alguém.
 */
export const dynamic = 'force-dynamic'

/** A mesma URL, trocando só a página — os filtros seguem intactos. */
function comPagina(filtro: Busca, pagina: number): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(filtro)) {
    if (v && k !== 'pagina') qs.set(k, v)
  }
  if (pagina > 1) qs.set('pagina', String(pagina))
  const s = qs.toString()
  return s ? `/financeiro/lancamentos?${s}` : '/financeiro/lancamentos'
}

/** Um passo da paginação. Sem destino, vira texto apagado — nunca botão morto. */
function Passo({ href, children }: { href: string | null; children: ReactNode }) {
  const estilo = {
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 13px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.09)',
    fontSize: 11.5,
    fontWeight: 600,
    textDecoration: 'none',
  } as const
  if (!href) {
    return (
      <span
        className="font-sans"
        aria-disabled
        style={{ ...estilo, color: 'rgba(242,237,227,.22)', borderColor: 'rgba(255,255,255,.05)' }}
      >
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className="font-sans hover:text-ouro" style={{ ...estilo, color: 'rgba(242,237,227,.7)' }}>
      {children}
    </Link>
  )
}

/** N dias para trás de uma data AAAA-MM-DD, em UTC para não escorregar de dia. */
function recuar(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

const TOM_SITUACAO: Record<SituacaoLancamento, TomUi> = {
  previsto: 'info',
  agendado: 'neutro',
  vencido: 'erro',
  parcial: 'ouro',
  liquidado: 'ok',
  cancelado: 'neutro',
}

interface Busca {
  situacao?: string
  tipo?: string
  /** 'sem' lista o que está SEM categoria — a fila do que a DRE não classifica. */
  categoria?: string
  conta?: string
  centro?: string
  q?: string
  /** 'sem' lista o que está SEM vencimento — o que a projeção de caixa não enxerga. */
  venc?: string
  /** Janela do dia do movimento, AAAA-MM-DD inclusivos. */
  de?: string
  ate?: string
  /** Atalho de janela: 'hoje' | '7' | '30' | 'mes' | 'tudo'. Sem nada, vale 'hoje'. */
  periodo?: string
  /** Página da lista, 1-based. */
  pagina?: string
  /** 'sim' | 'nao' — o mockup separa o que se repete todo mês do avulso. */
  recorrente?: string
}

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Busca> }) {
  const filtro = await searchParams
  const [p, venda] = await Promise.all([carregarLancamentos(), dadosDaVendaManual()])

  if (p.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio
            icone="cadeado"
            texto="O Supabase precisa estar configurado para ler contas a pagar e a receber."
          />
        </Painel>
      </Pilha>
    )
  }

  /**
   * A janela padrão é HOJE, e não "todo o histórico".
   *
   * Abrir a tela carregava 1.244 lançamentos e desenhava 250 — segundos de
   * espera para responder uma pergunta que quase sempre é sobre o dia.
   * Quem precisa do histórico inteiro pede: o atalho "Tudo" está a um clique,
   * e o rodapé sempre diz qual janela está valendo.
   *
   * Data digitada à mão vence o atalho — quem escolheu 01/06 quer 01/06.
   */
  const atalho = ['hoje', '7', '30', 'mes', 'tudo'].includes(filtro.periodo ?? '')
    ? (filtro.periodo as 'hoje' | '7' | '30' | 'mes' | 'tudo')
    : 'hoje'
  const temDataManual = Boolean(filtro.de || filtro.ate)
  const janela = temDataManual
    ? { de: filtro.de ?? '', ate: filtro.ate ?? '' }
    : atalho === 'tudo'
      ? { de: '', ate: '' }
      : atalho === 'mes'
        ? { de: `${p.hoje.slice(0, 7)}-01`, ate: p.hoje }
        : { de: recuar(p.hoje, atalho === '30' ? 29 : atalho === '7' ? 6 : 0), ate: p.hoje }

  const comSituacao = p.lancamentos.map((l) => ({ l, situacao: situacaoDe(l, p.hoje) }))
  const busca = (filtro.q ?? '').trim().toLowerCase()

  const visiveis = comSituacao
    .filter(({ l, situacao }) => {
      if (filtro.situacao && situacao !== filtro.situacao) return false
      // Sem filtro explícito, cancelado sai da lista: não é trabalho pendente
      // nem histórico de caixa, é um registro que deixou de valer.
      if (!filtro.situacao && situacao === 'cancelado') return false
      if (filtro.tipo && l.tipo !== filtro.tipo) return false
      // 'sem' é o filtro que o extrato tornou necessário: quase cem
      // lançamentos importados sem categoria, que a DRE não consegue
      // classificar. Sem esse valor não havia como listá-los para
      // classificar um a um.
      if (filtro.categoria === 'sem') {
        if (l.categoriaId) return false
      } else if (filtro.categoria && l.categoriaId !== filtro.categoria) {
        return false
      }
      // Mesma ideia para a projeção de caixa: título sem vencimento não é
      // posicionado em nenhum dia e some do fluxo.
      if (filtro.venc === 'sem' && l.venceEm) return false
      if (filtro.conta && l.contaId !== filtro.conta) return false
      if (filtro.centro && l.centroCusto !== filtro.centro) return false
      // O período filtra pelo DIA DO MOVIMENTO, não pelo vencimento. Filtrar
      // por vencimento descartava 1.223 das 1.244 linhas — tudo que já
      // aconteceu não tem vencimento, e a janela devolvia só as parcelas do
      // financiamento.
      if (janela.de && l.ocorridoEm < janela.de) return false
      if (janela.ate && l.ocorridoEm > janela.ate) return false
      if (filtro.recorrente === 'sim' && !l.recorrente) return false
      if (filtro.recorrente === 'nao' && l.recorrente) return false
      if (busca) {
        const alvo = `${l.descricao} ${l.favorecido ?? ''} ${l.documento ?? ''}`.toLowerCase()
        if (!alvo.includes(busca)) return false
      }
      return true
    })
    /*
     * Do mais recente para o mais antigo — a ordem de um extrato.
     *
     * A ordem anterior era a de uma FILA DE TRABALHO: vencido primeiro,
     * liquidado por último. Numa base em que 1.219 de 1.244 lançamentos já
     * foram baixados, isso empurrava todo o dinheiro que se moveu para depois
     * das 21 parcelas em aberto — e o teto de linhas cortava o resto. Quem
     * abria a tela via uma parede de "Sicredi - KGIRO FAMPE" e concluía, com
     * razão, que o ERP não estava mostrando as entradas e saídas.
     *
     * Pior: o desempate era `venceEm ?? '9999'`, e como quase ninguém tem
     * vencimento, quase todos empatavam — o pouco que aparecia vinha em ordem
     * arbitrária, sem ser cronológica nem nada.
     *
     * O que exige decisão continua acessível pelo filtro de situação e pelo
     * painel "Próximos vencimentos" ao lado. A lista principal responde a
     * outra pergunta, que é a que se faz todo dia: o que entrou e o que saiu.
     */
    .sort((a, b) => {
      const d = b.l.ocorridoEm.localeCompare(a.l.ocorridoEm)
      return d !== 0 ? d : b.l.id.localeCompare(a.l.id)
    })

  /**
   * Paginação de 50, no lugar do teto cego de 250.
   *
   * O teto anterior cortava o desenho e não oferecia saída: as linhas 251 em
   * diante simplesmente não existiam para quem estava na tela. A página é a
   * mesma economia de desenho com uma diferença que importa — dá para chegar
   * às outras.
   *
   * Os totais e indicadores continuam sobre o FILTRO INTEIRO, não sobre a
   * página: "entrou R$ 2.841,13" tem de responder pela semana, não pelas
   * cinquenta linhas que couberam na tela.
   */
  const POR_PAGINA = 50
  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA))
  const pagina = Math.min(Math.max(1, Number(filtro.pagina ?? '1') || 1), paginas)
  const listadas = visiveis.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const ocultas = visiveis.length - listadas.length

  /*
   * Os três primeiros indicadores passam a responder sobre MOVIMENTO, e sobre
   * o recorte que está na tela.
   *
   * "A pagar hoje", "A receber hoje" e "Vencidos" mostravam R$ 0,00 os três ao
   * mesmo tempo — verdade inútil numa operação que recebe à vista e não tem
   * boleto vencido. Enquanto isso, os R$ 669,73 que entraram e os R$ 2.171,38
   * que saíram no dia não apareciam em lugar nenhum da tela.
   *
   * Movido é o que já foi baixado: previsão somada com realizado daria um
   * número que não existe em conta nenhuma.
   */
  const movidos = visiveis.filter((x) => x.l.baixadoEm)
  const entrou = movidos
    .filter((x) => x.l.tipo === 'entrada')
    .reduce((a, x) => a + x.l.recebido, 0)
  const saiu = movidos.filter((x) => x.l.tipo === 'saida').reduce((a, x) => a + x.l.recebido, 0)
  const periodoNaTela = !janela.de && !janela.ate
    ? 'todo o histórico'
    : `${janela.de ? diaCurtoPt(janela.de) : 'início'} a ${janela.ate ? diaCurtoPt(janela.ate) : 'hoje'}`

  const abertos = visiveis.filter((x) => x.situacao !== 'liquidado' && x.situacao !== 'cancelado')
  const somaAberto = (ls: { l: LancamentoGerencial }[]) => ls.reduce((a, x) => a + saldoAberto(x.l), 0)
  const entradasAbertas = abertos.filter((x) => x.l.tipo === 'entrada')
  const saidasAbertas = abertos.filter((x) => x.l.tipo === 'saida')

  // ── Indicadores derivados do conjunto inteiro, não do filtro ────────────
  const vivos = p.lancamentos.filter((l) => !l.canceladoEm)
  const saidas = vivos.filter((l) => l.tipo === 'saida')
  const pagas = saidas.filter((l) => l.baixadoEm)
  const taxaPagamento = saidas.length ? (pagas.length / saidas.length) * 100 : 0

  /** Dias entre vencimento e baixa efetiva. Negativo é antecipação. */
  const atrasoMedio = (ls: LancamentoGerencial[]) => {
    const comAmbas = ls.filter((l) => l.baixadoEm && l.venceEm)
    if (!comAmbas.length) return null
    const soma = comAmbas.reduce(
      (a, l) => a + (Date.parse(l.baixadoEm!) - Date.parse(l.venceEm!)) / 86_400_000,
      0,
    )
    return soma / comAmbas.length
  }
  const prazoPagamento = atrasoMedio(pagas)
  const prazoRecebimento = atrasoMedio(vivos.filter((l) => l.tipo === 'entrada' && l.baixadoEm))

  const totalAPagar = saidas.reduce((a, l) => a + saldoAberto(l), 0)
  const inadimplencia = totalAPagar > 0 ? (p.vencidos.valor / totalAPagar) * 100 : 0

  const recorrentesPorCategoria = new Map<string, number>()
  for (const l of vivos.filter((x) => x.recorrente)) {
    const chave = l.categoria ?? SEM_CATEGORIA
    recorrentesPorCategoria.set(chave, (recorrentesPorCategoria.get(chave) ?? 0) + l.valor)
  }

  // ── Pendências de preenchimento ────────────────────────────────────────
  //
  // As duas listas abaixo não são um relatório: são fila de trabalho. Sem
  // categoria, o lançamento não tem linha na DRE; sem vencimento, ele não tem
  // dia na projeção de caixa. Nos dois casos o número existe no banco e não
  // aparece em nenhum total — o pior tipo de dado, o que some sem avisar.
  const semCategoria = vivos.filter((l) => !l.categoriaId)
  const semVencimento = vivos.filter((l) => !l.venceEm && saldoAberto(l) > 0)
  const valorSemCategoria = semCategoria.reduce((a, l) => a + l.valor, 0)
  const valorSemVencimento = semVencimento.reduce((a, l) => a + saldoAberto(l), 0)

  const proximos = vivos
    .filter((l) => saldoAberto(l) > 0 && l.venceEm && l.venceEm >= p.hoje)
    .sort((a, b) => (a.venceEm ?? '').localeCompare(b.venceEm ?? ''))
    .slice(0, 5)
  const totalProximos = proximos.reduce((a, l) => a + saldoAberto(l), 0)

  const colunas: ColunaUi<{ l: LancamentoGerencial; situacao: SituacaoLancamento }>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      largura: '96px',
      // O dia do MOVIMENTO, com a legenda dizendo qual dia é esse. A coluna
      // mostrava o vencimento e escrevia "—" em 1.223 das 1.244 linhas: uma
      // coluna de data que quase nunca tem data.
      render: ({ l, situacao }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Num tamanho={11.5} tom={situacao === 'vencido' ? 'erro' : undefined}>
            {diaCurtoPt(l.ocorridoEm)}
          </Num>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.34)' }}>
            {l.baixadoEm ? 'baixado' : l.venceEm ? `vence ${diaCurtoPt(l.venceEm)}` : 'previsto'}
          </span>
        </span>
      ),
    },
    {
      chave: 'desc',
      titulo: 'Descrição',
      largura: 'minmax(0,1fr)',
      render: ({ l }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 500,
                fontSize: 12,
                color: 'rgba(242,237,227,.9)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {l.descricao}
            </span>
          </span>
          {/* As etiquetas moram na SEGUNDA linha, junto do favorecido.
              Na primeira, elas ficavam lado a lado com o texto e no topo da
              célula — enquanto a etiqueta de Tipo, na coluna vizinha, é
              centralizada na altura da linha. As duas quase se alinhavam, e
              quase-alinhado lê pior do que deliberadamente diferente. */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {l.parcela && l.parcelas && (
              <Chip tom="info" contorno>{`${l.parcela}/${l.parcelas}`}</Chip>
            )}
            {l.recorrente && <Chip tom="roxo" contorno>{l.recorrencia ?? 'Recorrente'}</Chip>}
            {l.transferenciaId && <Chip tom="neutro" contorno>Transferência</Chip>}
            <span
              className="font-sans"
              style={{
                minWidth: 0,
                fontSize: 10,
                color: 'rgba(242,237,227,.36)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {[l.favorecido, l.documento && `doc. ${l.documento}`].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
        </span>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '92px',
      render: ({ l }) => (
        <Chip tom={l.tipo === 'entrada' ? 'ok' : 'erro'} contorno>
          {l.tipo === 'entrada' ? '↑ A receber' : '↓ A pagar'}
        </Chip>
      ),
    },
    {
      chave: 'cat',
      titulo: 'Categoria',
      largura: '150px',
      render: ({ l }) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'rgba(242,237,227,.4)', flex: 'none' }}>
            <Ico n={iconeDaCategoria(l.categoria)} tamanho={13} />
          </span>
          {/* Sem categoria o lançamento não entra na DRE — a linha precisa
              dizer isso, e não mostrar um campo em branco que passa por
              detalhe estético. */}
          <Celula
            principal={l.categoriaId ? l.categoria : 'Sem categoria'}
            secundaria={
              !l.categoriaId
                ? 'sem linha na DRE'
                : l.natureza
                  ? ROTULO_NATUREZA[l.natureza]
                  : 'sem natureza gerencial'
            }
            tom={l.categoriaId && l.natureza ? undefined : 'atencao'}
          />
        </span>
      ),
    },
    {
      chave: 'conta',
      titulo: 'Conta',
      largura: '112px',
      render: ({ l }) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'rgba(242,237,227,.6)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {l.conta}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '124px',
      alinhamento: 'right',
      render: ({ l }) => {
        const falta = saldoAberto(l)
        const encargos = l.multa + l.juros
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            <Num tamanho={12.5} tom={l.tipo === 'entrada' ? 'ok' : undefined}>
              {brl(l.valor)}
            </Num>
            {/* Só quando há resto: "faltam R$ 0,00" em toda linha quitada é
                ruído em cima da informação. */}
            {l.recebido > 0 && falta > 0 && (
              <Num tamanho={9.5} tom="ouro" peso={400}>
                {`faltam ${brl(falta)}`}
              </Num>
            )}
            {encargos > 0 && (
              <Num tamanho={9.5} tom="erro" peso={400}>
                {`+ ${brl(encargos)} encargos`}
              </Num>
            )}
            {l.desconto > 0 && (
              <Num tamanho={9.5} tom="ok" peso={400}>
                {`− ${brl(l.desconto)} desconto`}
              </Num>
            )}
          </span>
        )
      },
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '92px',
      render: ({ situacao }) => (
        <Chip tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO_LANCAMENTO[situacao]}</Chip>
      ),
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: '86px',
      // "Extrato Mercado Pago" não cabe e saía cortado no meio da palavra. A
      // conta já está na coluna ao lado, então o que esta coluna informa é a
      // procedência: veio do extrato do banco ou foi digitado à mão. O nome
      // completo fica no title, para quem precisar conferir.
      render: ({ l }) => (
        <span title={l.origem}>
          <Chip tom={l.origem === 'Manual' ? 'neutro' : 'info'} contorno>
            {l.origem.startsWith('Extrato') ? 'Extrato' : l.origem}
          </Chip>
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      // 156px sobravam: os botões ocupam pouco mais de 120 e o resto virava um
      // vão entre Origem e Ações que fazia as duas colunas parecerem soltas.
      largura: '124px',
      alinhamento: 'right',
      render: ({ l, situacao }) => <AcoesGerenciais lancamento={l} situacao={situacao} />,
    },
  ]

  return (
    <ProvedorDeListas contas={p.contas} categorias={p.categorias} centros={p.centrosCusto}>
    <Pilha gap={16}>

      <GradeIndicadores>
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entrou"
          valor={brl(entrou)}
          tomValor="ok"
          nota={`${periodoNaTela} · ${plural(movidos.filter((x) => x.l.tipo === 'entrada').length, 'movimento', 'movimentos')}`}
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saiu"
          valor={brl(saiu)}
          tomValor="erro"
          nota={`${periodoNaTela} · ${plural(movidos.filter((x) => x.l.tipo === 'saida').length, 'movimento', 'movimentos')}`}
        />
        <Indicador
          icone="balanca"
          tom={entrou - saiu >= 0 ? 'ok' : 'erro'}
          rotulo="Resultado do período"
          valor={brl(entrou - saiu)}
          tomValor={entrou - saiu >= 0 ? 'ok' : 'erro'}
          nota={
            p.vencidos.qtd
              ? `${plural(p.vencidos.qtd, 'obrigação vencida', 'obrigações vencidas')} · ${brl(p.vencidos.valor)}`
              : 'Entrou menos saiu, já baixado'
          }
          tomNota={p.vencidos.qtd ? 'erro' : 'neutro'}
        />
        <Indicador
          icone="repetir"
          tom="roxo"
          rotulo="Recorrentes do mês"
          valor={brl(p.recorrentes.valor)}
          nota={plural(p.recorrentes.qtd, 'despesa fixa cadastrada', 'despesas fixas cadastradas')}
        />
        <Indicador
          icone="tendencia"
          tom="ouro"
          rotulo="Saldo projetado após baixas"
          valor={brl(p.saldoProjetado)}
          tomValor={p.saldoProjetado < 0 ? 'erro' : 'ouro'}
          nota="Caixa de hoje + tudo a receber − tudo a pagar"
        />
        <Indicador
          icone="ampulheta"
          tom={p.aprovacoes.qtd ? 'atencao' : 'ok'}
          rotulo="Pendências de aprovação"
          valor={brl(p.aprovacoes.valor)}
          nota={
            p.aprovacoes.qtd
              ? `${plural(p.aprovacoes.qtd, 'lançamento veio', 'lançamentos vieram')} de integração sem conferência`
              : 'Tudo conferido'
          }
          tomNota={p.aprovacoes.qtd ? 'atencao' : 'ok'}
        />
      </GradeIndicadores>

      <ComTrilha
        trilha={
          <>
            <Painel padding="14px 15px 15px">
              <Pilha gap={9}>
                {/* Primeiro botão da coluna, e de propósito: venda de balcão,
                    WhatsApp ou Instagram é o ÚNICO dinheiro que o ERP não
                    descobre sozinho. Mercado Pago e Pagaleve chegam pelo
                    extrato; esta aqui só existe se alguém digitar. */}
                <VendaManual
                  bases={venda.bases}
                  contas={venda.contas}
                  tamanhos={venda.tamanhos}
                />
                <NovoCompromisso
                  contas={p.contas}
                  categorias={p.categorias}
                  centros={p.centrosCusto}
                />
                <AcaoPainel href="/financeiro/extrato">Conferir o extrato</AcaoPainel>
              </Pilha>
            </Painel>

            <Painel
              titulo="Próximos vencimentos"
              icone="calendario"
              acao={<AcaoPainel href="/financeiro/fluxo-de-caixa">Ver todos</AcaoPainel>}
            >
              {proximos.length > 0 ? (
                <>
                  <Pilha gap={0}>
                    {proximos.map((l) => (
                      <LinhaValor
                        key={l.id}
                        rotulo={l.descricao}
                        nota={`${diaCurtoPt(l.venceEm!)} · ${l.categoria}`}
                        valor={brl(saldoAberto(l))}
                        tom={l.tipo === 'entrada' ? 'ok' : 'erro'}
                      />
                    ))}
                  </Pilha>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,.05)',
                    }}
                  >
                    <Etiqueta>Total listado</Etiqueta>
                    <div style={{ flex: 1 }} />
                    <Num tamanho={13} tom="ouro">
                      {brl(totalProximos)}
                    </Num>
                  </div>
                </>
              ) : (
                <Vazio icone="check-circulo" texto="Nenhum vencimento à frente." />
              )}
            </Painel>

            <Painel titulo="Resumo do período" icone="lista">
              <Pilha gap={0}>
                <LinhaValor
                  rotulo="Total a pagar"
                  valor={brl(totalAPagar)}
                  tom="erro"
                  icone="saida"
                  tomIcone="erro"
                />
                <LinhaValor
                  rotulo="Total a receber"
                  valor={brl(vivos.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + saldoAberto(l), 0))}
                  tom="ok"
                  icone="entrada"
                  tomIcone="ok"
                />
                <LinhaValor
                  rotulo="Vencidos"
                  valor={brl(p.vencidos.valor)}
                  tom={p.vencidos.qtd ? 'erro' : 'neutro'}
                  icone="alerta"
                  tomIcone={p.vencidos.qtd ? 'erro' : 'neutro'}
                />
                <LinhaValor
                  rotulo="Saldo líquido"
                  valor={brl(p.saldoProjetado)}
                  tom={p.saldoProjetado >= 0 ? 'ok' : 'erro'}
                  destaque
                />
              </Pilha>
            </Painel>

            {recorrentesPorCategoria.size > 0 && (
              <Painel titulo="Recorrências do mês" icone="repetir" tom="roxo">
                <RoscaLegenda
                  fatias={[...recorrentesPorCategoria.entries()].map(([rotulo, valor]) => ({
                    rotulo,
                    valor,
                  }))}
                  total={p.recorrentes.valor}
                  legendaTotal="Recorrente"
                  formatar={brl}
                  tamanho={148}
                  maximo={5}
                />
              </Painel>
            )}
          </>
        }
      >
        {(semCategoria.length > 0 || semVencimento.length > 0) && (
          <Destaque
            tom="atencao"
            icone="alerta"
            titulo="Lançamentos incompletos ficam fora dos números"
            acao={
              <span style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {/* Manda para a FILA DA IA, não para uma lista crua. Lá cada
                    linha chega com a categoria sugerida, a confiança e o
                    motivo da sugestão, e dá para aprovar em lote. O link
                    antigo trazia de volta para cá com um filtro, deixando o
                    trabalho inteiro na mão de quem já não sabia o que a linha
                    era — e é dessa dúvida que a fila cuida. */}
                {semCategoria.length > 0 && (
                  <AcaoPainel href="/assessor/classificacao">
                    {`Classificar ${semCategoria.length} com ajuda da IA`}
                  </AcaoPainel>
                )}
                {semVencimento.length > 0 && (
                  <AcaoPainel href="/financeiro/lancamentos?venc=sem">
                    {`Datar ${semVencimento.length} sem vencimento`}
                  </AcaoPainel>
                )}
              </span>
            }
          >
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
            >
              {[
                semCategoria.length > 0 &&
                  `${plural(semCategoria.length, 'lançamento está', 'lançamentos estão')} sem categoria (${brl(valorSemCategoria)}) — nenhum entra na DRE enquanto ninguém disser o que são. A fila de classificação mostra cada um com a sugestão do ERP, a confiança e o porquê.`,
                semVencimento.length > 0 &&
                  `${plural(semVencimento.length, 'lançamento está', 'lançamentos estão')} sem data de vencimento (${brl(valorSemVencimento)}) — a projeção de caixa posiciona cada valor no dia do vencimento, então esses não aparecem no fluxo.`,
              ]
                .filter(Boolean)
                .join(' ')}
            </span>
          </Destaque>
        )}

        <BarraDeFiltros
          categorias={p.categorias.map((c) => ({ id: c.id, nome: c.nome }))}
          contas={p.contas.map((c) => ({ id: c.id, nome: c.nome }))}
          centros={p.centrosCusto}
        />

        <Painel
          titulo="Lançamentos"
          icone="lista"
          nota={`${visiveis.length} de ${comSituacao.length} no período`}
          padding="16px 17px 14px"
        >
          <TabelaUi
            colunas={colunas}
            itens={listadas}
            chaveDe={({ l }) => l.id}
            larguraMinima={1080}
            faixaDe={({ situacao }) =>
              situacao === 'vencido' ? 'erro' : situacao === 'parcial' ? 'ouro' : null
            }
            vazio={
              <Vazio
                icone="busca"
                texto={
                  comSituacao.length === 0
                    ? 'Nenhum lançamento cadastrado ainda.'
                    : 'Nenhum lançamento atende a este filtro.'
                }
              />
            }
            rodape={
              visiveis.length > 0 ? (
                <RodapeTabela
                  contagem={
                    paginas > 1
                      ? `${(pagina - 1) * POR_PAGINA + 1}–${(pagina - 1) * POR_PAGINA + listadas.length} de ${visiveis.length} · página ${pagina} de ${paginas} · ${periodoNaTela}`
                      : `${plural(visiveis.length, 'lançamento', 'lançamentos')} · ${periodoNaTela}`
                  }
                  totais={[
                    { rotulo: 'A receber em aberto', valor: brl(somaAberto(entradasAbertas)), tom: 'ok' },
                    { rotulo: 'A pagar em aberto', valor: brl(somaAberto(saidasAbertas)), tom: 'erro' },
                    {
                      rotulo: 'Resultado do filtro',
                      valor: brl(somaAberto(entradasAbertas) - somaAberto(saidasAbertas)),
                      tom: 'ouro',
                    },
                  ]}
                />
              ) : null
            }
          />

          {/* Navegação em links, não em botões: a página vive na URL como os
              filtros, então dá para voltar pelo histórico do navegador e para
              mandar "olha a página 3" para alguém. */}
          {paginas > 1 && (
            <nav
              aria-label="Paginação dos lançamentos"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingTop: 13,
                marginTop: 2,
                borderTop: '1px solid rgba(255,255,255,.05)',
              }}
            >
              <Passo href={pagina > 1 ? comPagina(filtro, pagina - 1) : null}>← Anterior</Passo>
              <span
                className="font-sans"
                style={{ fontSize: 11.5, color: 'rgba(242,237,227,.5)', padding: '0 6px' }}
              >
                {`Página ${pagina} de ${paginas}`}
              </span>
              <Passo href={pagina < paginas ? comPagina(filtro, pagina + 1) : null}>
                Próxima →
              </Passo>
            </nav>
          )}
        </Painel>

        {/* Os cinco cartões do rodapé têm a MESMA estrutura em três faixas —
            rótulo, número, medidor e nota — e altura mínima igual: com
            conteúdo de tamanhos diferentes, cada um terminava numa altura e a
            linha parecia desalinhada. */}
        <Colunas proporcao="repeat(5, minmax(0, 1fr))" gap={12}>
          <Metrica
            rotulo="Taxa de pagamento"
            valor={`${taxaPagamento.toFixed(1).replace('.', ',')}%`}
            tom={taxaPagamento >= 80 ? 'ok' : 'atencao'}
            medidor={<Progresso pct={taxaPagamento} tom={taxaPagamento >= 80 ? 'ok' : 'atencao'} />}
            nota={`${pagas.length} de ${saidas.length} contas pagas`}
          />

          <Metrica
            rotulo="Prazo médio de pagamento"
            valor={
              prazoPagamento === null
                ? '—'
                : `${Math.abs(prazoPagamento).toFixed(1).replace('.', ',')} dias`
            }
            tom={prazoPagamento !== null && prazoPagamento > 0 ? 'erro' : 'ok'}
            medidor={
              <Mini
                valores={pagas.length > 1 ? [0, prazoPagamento ?? 0] : [0, 0]}
                largura={140}
                altura={26}
                tom={prazoPagamento !== null && prazoPagamento > 0 ? 'erro' : 'ok'}
              />
            }
            nota={
              prazoPagamento === null
                ? 'Nenhuma conta baixada com vencimento definido'
                : prazoPagamento > 0
                  ? 'em média DEPOIS do vencimento'
                  : 'em média ANTES do vencimento'
            }
          />

          <Metrica
            rotulo="Prazo médio de recebimento"
            valor={
              prazoRecebimento === null
                ? '—'
                : `${Math.abs(prazoRecebimento).toFixed(1).replace('.', ',')} dias`
            }
            tom={prazoRecebimento !== null && prazoRecebimento > 0 ? 'atencao' : 'ok'}
            medidor={
              <Mini
                valores={prazoRecebimento !== null ? [0, prazoRecebimento] : [0, 0]}
                largura={140}
                altura={26}
                tom={prazoRecebimento !== null && prazoRecebimento > 0 ? 'atencao' : 'ok'}
              />
            }
            nota={
              prazoRecebimento === null
                ? 'Nenhum recebimento baixado ainda'
                : prazoRecebimento > 0
                  ? 'o dinheiro entra depois do previsto'
                  : 'o dinheiro entra antes do previsto'
            }
          />

          <Metrica
            rotulo="Inadimplência"
            valor={`${inadimplencia.toFixed(1).replace('.', ',')}%`}
            tom={inadimplencia > 5 ? 'erro' : 'ok'}
            medidor={<Progresso pct={inadimplencia} tom={inadimplencia > 5 ? 'erro' : 'ok'} />}
            nota={`${brl(p.vencidos.valor)} vencido em aberto`}
          />

          <Metrica
            rotulo="Saldo projetado"
            valor={brl(p.saldoProjetado)}
            tom={p.saldoProjetado < 0 ? 'erro' : 'ouro'}
            medidor={
              <Mini
                valores={[p.contas.reduce((a, c) => a + c.saldoDisponivel, 0), p.saldoProjetado]}
                largura={140}
                altura={26}
                tom={p.saldoProjetado < 0 ? 'erro' : 'ok'}
              />
            }
            nota="depois de liquidar tudo que está em aberto"
          />
        </Colunas>
      </ComTrilha>
    </Pilha>
    </ProvedorDeListas>
  )
}

/**
 * Cartão de métrica do rodapé: sempre as mesmas quatro faixas, sempre a
 * mesma altura. É a uniformidade que faz a linha inteira parecer uma régua,
 * e não cinco cartões soltos.
 */
function Metrica({
  rotulo,
  valor,
  tom,
  medidor,
  nota,
}: {
  rotulo: string
  valor: string
  tom: TomUi
  medidor: ReactNode
  nota: string
}) {
  return (
    <Painel padding="14px 15px 13px">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 118,
        }}
      >
        <Etiqueta>{rotulo}</Etiqueta>
        <Num tamanho={19} tom={tom}>
          {valor}
        </Num>
        <div style={{ height: 26, display: 'flex', alignItems: 'center' }}>{medidor}</div>
        <span
          className="font-sans"
          style={{
            marginTop: 'auto',
            fontSize: 10,
            lineHeight: 1.4,
            color: 'rgba(242,237,227,.38)',
            textWrap: 'pretty',
          }}
        >
          {nota}
        </span>
      </div>
    </Painel>
  )
}
