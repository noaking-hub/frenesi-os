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
import { carregarTelaDeLancamentos, explicarLancamento } from '@/data/financeiro'
import type { LinhaDaTela } from '@/data/financeiro'
import {
  brl,
  diaCurtoPt,
  hojeEmSaoPaulo,
  LANCAMENTOS_POR_PAGINA,
  normalizarFiltroDeLancamentos,
  periodoPorExtenso,
  plural,
  ROTULO_NATUREZA,
  ROTULO_SITUACAO_LANCAMENTO,
  saldoAberto,
} from '@/domain'
import type { SituacaoLancamento } from '@/domain'

import { AcoesGerenciais, NovoCompromisso } from '../Compromissos'
import { VendaManual } from '../VendaManual'
import { ProvedorDeListas } from '../ListasDoFormulario'
import { DetalheDoLancamento } from './DetalheDoLancamento'
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

/**
 * A mesma URL com algumas chaves trocadas — o resto do filtro segue intacto.
 *
 * Chave sem valor é REMOVIDA, nunca escrita vazia: `?lancamento=` reabriria o
 * detalhe num id em branco, e `?situacao=` faria a barra de filtros acender um
 * filtro que não filtra nada.
 */
function urlCom(filtro: Busca, mudancas: Partial<Record<keyof Busca, string | null>>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...filtro, ...mudancas })) {
    if (v) qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `/financeiro/lancamentos?${s}` : '/financeiro/lancamentos'
}

/**
 * A mesma URL, trocando só a página.
 *
 * O detalhe aberto fica para trás de propósito: paginar é trocar a lista, e
 * carregar a página 3 com o modal do lançamento da página 1 por cima esconde
 * justamente o que se foi buscar.
 */
function comPagina(filtro: Busca, pagina: number): string {
  return urlCom(filtro, { pagina: pagina > 1 ? String(pagina) : null, lancamento: null })
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
  /**
   * O lançamento cujo detalhe está aberto.
   *
   * Mora na URL como os filtros, e pelos mesmos motivos: sobrevive ao F5, o
   * botão Voltar fecha o detalhe em vez de sair da lista, e o alerta do
   * Assessor consegue apontar para um lançamento específico em vez de para uma
   * fila onde ele se perde.
   */
  lancamento?: string
  /** 'nova' abre o formulário de venda manual ao chegar — é o link de Pedidos. */
  venda?: string
}

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Busca> }) {
  const filtro = await searchParams

  /*
   * O filtro vai INTEIRO para o Postgres — período, situação, tipo, conta,
   * categoria, centro, recorrente, vencimento, busca, ordenação e página.
   *
   * Antes nada disso chegava ao banco: `carregarLancamentos()` era chamada sem
   * argumento, as 1.268 linhas vinham completas (444.783 bytes, 2 requisições
   * PostgREST) e o recorte era feito aqui, com `Array.filter` e `Array.slice`.
   * Na URL do relato — `?periodo=tudo&q=Icaro`, rodapé "1 de 1268" — isso era
   * transferir 434 KB para desenhar UMA linha. A razão medida foi 1268:1.
   *
   * O Postgres nunca foi o gargalo (a consulta mede 4,6 ms com Index Scan
   * Backward, tudo em cache), e o JavaScript também não (as ~25 passadas sobre
   * as 1.268 linhas mediam 0,90 ms). O custo era transporte e round-trip: 12
   * requisições ao Supabase por render, 19 com o detalhe aberto, ~840 KB.
   *
   * A janela padrão continua sendo HOJE, e não "todo o histórico": quem
   * precisa do resto pede — "Tudo" está a um clique e o rodapé sempre diz qual
   * janela está valendo. A decisão mora em `normalizarFiltroDeLancamentos`
   * (src/domain) porque ela precisa valer igual na consulta e nos links que
   * esta tela desenha.
   */
  const hoje = hojeEmSaoPaulo()
  const f = normalizarFiltroDeLancamentos(filtro, hoje)

  // A explicação do detalhe sai junto com a lista, e não depois dela: ela só
  // depende do id que já está na URL, e encadear as duas leituras somaria uma
  // ida ao banco ao tempo de abrir a tela para quem chegou por um link direto.
  const [p, explicacao] = await Promise.all([
    carregarTelaDeLancamentos(f),
    f.lancamento ? explicarLancamento(f.lancamento) : Promise.resolve(null),
  ])

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

  /*
   * A página vem grampeada do banco.
   *
   * `?pagina=99` num filtro de 1 linha devolveria zero linhas — tela vazia que
   * parece defeito. Só a consulta sabe o total, então é ela quem decide qual
   * página existe; aqui só se lê a resposta.
   */
  const { pagina, paginas } = p
  const listadas = p.linhas
  const alvo = p.alvo
  const periodoNaTela = periodoPorExtenso(f, diaCurtoPt)

  /*
   * TODOS os números abaixo vêm agregados do Postgres, e essa é a metade
   * difícil desta correção.
   *
   * Com a lista paginada, somar em JavaScript passaria a somar só as 50 linhas
   * da página: "A pagar em aberto" encolheria a cada virada de página e
   * "Entrou" descreveria meia semana. Um total que passa a somar só o visível
   * é um bug pior que a lentidão, porque não aparece — ninguém confere um
   * número que já estava lá.
   *
   * Por isso há DUAS agregações, com escopos diferentes e deliberados:
   *
   * `p.resumo` fala do FILTRO INTEIRO — entrou, saiu, movimentos, a receber e
   * a pagar em aberto. É o que responde "o que aconteceu nesta janela".
   *
   * `p.panorama` fala da BASE INTEIRA, ignorando o filtro — taxa de
   * pagamento, prazos médios, inadimplência, total a pagar e a receber,
   * recorrências, pendências de preenchimento e próximos vencimentos. É o que
   * sempre respondeu "como está a operação", e continua não obedecendo ao
   * recorte da tela.
   */
  const { resumo, panorama } = p
  const taxaPagamento = panorama.qtdSaidas ? (panorama.qtdPagas / panorama.qtdSaidas) * 100 : 0
  const inadimplencia =
    panorama.totalAPagar > 0 ? (panorama.vencidos.valor / panorama.totalAPagar) * 100 : 0

  const colunas: ColunaUi<LinhaDaTela>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      largura: '96px',
      // O dia do MOVIMENTO, com a legenda dizendo qual dia é esse. A coluna
      // mostrava o vencimento e escrevia "—" em 1.223 das 1.244 linhas: uma
      // coluna de data que quase nunca tem data.
      render: ({ lancamento: l, situacao }) => (
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
      identidade: true,
      /*
       * A descrição inteira é o link que abre o detalhe.
       *
       * A linha não vira clicável como um todo porque ela já carrega quatro
       * botões na coluna de ações, e botão dentro de botão é HTML inválido —
       * o mesmo motivo pelo qual Pedidos precisou de tabela própria. Aqui a
       * saída é a da Conciliação: a coluna mais larga vira `Link`, e o ícone
       * de olho ao lado das ações dá o segundo caminho, com nome para quem
       * navega por teclado ou leitor de tela.
       *
       * `Link` e não botão: assim dá para abrir em outra aba e copiar o
       * endereço de um lançamento específico para mandar para alguém.
       */
      render: ({ lancamento: l }) => (
        <Link
          href={urlCom(filtro, { lancamento: l.id })}
          scroll={false}
          title="Abrir o detalhe deste lançamento"
          className="hover:text-ouro"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            minWidth: 0,
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
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
        </Link>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '92px',
      // No cartão do celular a direção já aparece na cor do valor e no status.
      secundaria: true,
      render: ({ lancamento: l }) => (
        <Chip tom={l.tipo === 'entrada' ? 'ok' : 'erro'} contorno>
          {l.tipo === 'entrada' ? '↑ A receber' : '↓ A pagar'}
        </Chip>
      ),
    },
    {
      chave: 'cat',
      titulo: 'Categoria',
      largura: '150px',
      render: ({ lancamento: l }) => (
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
      secundaria: true,
      render: ({ lancamento: l }) => (
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
      render: ({ lancamento: l }) => {
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
      secundaria: true,
      // "Extrato Mercado Pago" não cabe e saía cortado no meio da palavra. A
      // conta já está na coluna ao lado, então o que esta coluna informa é a
      // procedência: veio do extrato do banco ou foi digitado à mão. O nome
      // completo fica no title, para quem precisar conferir.
      render: ({ lancamento: l }) => (
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
      // 124px cabiam os quatro botões da linha; o olho é o quinto. No pior
      // caso — compromisso em aberto, sem parcela e sem transferência — são
      // olho, baixa, lápis, parcelar e cancelar: 5 × 28 mais 4 folgas de 5 dá
      // 160, e a 124 o último botão saía cortado na borda da coluna.
      largura: '164px',
      alinhamento: 'right',
      render: ({ lancamento: l, situacao }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
          <AbrirDetalhe href={urlCom(filtro, { lancamento: l.id })} id={l.id} />
          <AcoesGerenciais lancamento={l} situacao={situacao} />
        </span>
      ),
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
          valor={brl(resumo.entrou)}
          tomValor="ok"
          nota={`${periodoNaTela} · ${plural(resumo.movimentosEntrada, 'movimento', 'movimentos')}`}
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saiu"
          valor={brl(resumo.saiu)}
          tomValor="erro"
          nota={`${periodoNaTela} · ${plural(resumo.movimentosSaida, 'movimento', 'movimentos')}`}
        />
        <Indicador
          icone="balanca"
          tom={resumo.entrou - resumo.saiu >= 0 ? 'ok' : 'erro'}
          rotulo="Resultado do período"
          valor={brl(resumo.entrou - resumo.saiu)}
          tomValor={resumo.entrou - resumo.saiu >= 0 ? 'ok' : 'erro'}
          nota={
            panorama.vencidos.qtd
              ? `${plural(panorama.vencidos.qtd, 'obrigação vencida', 'obrigações vencidas')} · ${brl(panorama.vencidos.valor)}`
              : 'Entrou menos saiu, já baixado'
          }
          tomNota={panorama.vencidos.qtd ? 'erro' : 'neutro'}
        />
        <Indicador
          icone="repetir"
          tom="roxo"
          rotulo="Recorrentes do mês"
          valor={brl(panorama.recorrentes.valor)}
          nota={plural(panorama.recorrentes.qtd, 'despesa fixa cadastrada', 'despesas fixas cadastradas')}
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
          tom={panorama.aprovacoes.qtd ? 'atencao' : 'ok'}
          rotulo="Pendências de aprovação"
          valor={brl(panorama.aprovacoes.valor)}
          nota={
            panorama.aprovacoes.qtd
              ? `${plural(panorama.aprovacoes.qtd, 'lançamento veio', 'lançamentos vieram')} de integração sem conferência`
              : 'Tudo conferido'
          }
          tomNota={panorama.aprovacoes.qtd ? 'atencao' : 'ok'}
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
                {/* Só as contas por propriedade — 5 linhas que a tela já
                    carregou. O catálogo (412 bases, 95 KB) é buscado quando o
                    modal ABRE: passá-lo aqui fazia esses 95 KB atravessarem no
                    payload RSC de toda navegação, com o modal fechado, e era o
                    único custo da tela que não encolhia quando o filtro
                    devolvia uma linha. */}
                <VendaManual
                  contas={p.contas.map((c) => ({
                    id: c.id,
                    nome: c.nome,
                    principal: c.principal,
                  }))}
                  abrirAoMontar={filtro.venda === 'nova'}
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
              {panorama.proximos.length > 0 ? (
                <>
                  <Pilha gap={0}>
                    {panorama.proximos.map((l) => (
                      <LinhaValor
                        key={l.id}
                        rotulo={l.descricao}
                        nota={`${diaCurtoPt(l.venceEm)} · ${l.categoria ?? 'Sem categoria'}`}
                        valor={brl(l.saldoAberto)}
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
                      {brl(panorama.proximos.reduce((a, l) => a + l.saldoAberto, 0))}
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
                  valor={brl(panorama.totalAPagar)}
                  tom="erro"
                  icone="saida"
                  tomIcone="erro"
                />
                <LinhaValor
                  rotulo="Total a receber"
                  valor={brl(panorama.totalAReceber)}
                  tom="ok"
                  icone="entrada"
                  tomIcone="ok"
                />
                <LinhaValor
                  rotulo="Vencidos"
                  valor={brl(panorama.vencidos.valor)}
                  tom={panorama.vencidos.qtd ? 'erro' : 'neutro'}
                  icone="alerta"
                  tomIcone={panorama.vencidos.qtd ? 'erro' : 'neutro'}
                />
                <LinhaValor
                  rotulo="Saldo líquido"
                  valor={brl(p.saldoProjetado)}
                  tom={p.saldoProjetado >= 0 ? 'ok' : 'erro'}
                  destaque
                />
              </Pilha>
            </Painel>

            {panorama.recorrentesPorCategoria.length > 0 && (
              <Painel titulo="Recorrências do mês" icone="repetir" tom="roxo">
                <RoscaLegenda
                  fatias={panorama.recorrentesPorCategoria}
                  total={panorama.recorrentes.valor}
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
        {/* Link para um lançamento que não existe mais não pode abrir um modal
            vazio nem sumir em silêncio: quem chegou por um link antigo do
            Assessor precisa saber que o registro foi embora, e não achar que a
            tela ignorou o clique. */}
        {filtro.lancamento && !alvo && (
          <Destaque
            tom="atencao"
            icone="alerta"
            titulo="Esse lançamento não está mais nesta base"
            acao={<AcaoPainel href={urlCom(filtro, { lancamento: null })}>Voltar à lista</AcaoPainel>}
          >
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
            >
              {`O endereço pede o lançamento ${filtro.lancamento}, e ele não foi encontrado — pode ter sido removido depois que o link foi criado.`}
            </span>
          </Destaque>
        )}

        {(panorama.semCategoria.qtd > 0 || panorama.semVencimento.qtd > 0) && (
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
                {panorama.semCategoria.qtd > 0 && (
                  <AcaoPainel href="/assessor/classificacao">
                    {`Classificar ${panorama.semCategoria.qtd} com ajuda da IA`}
                  </AcaoPainel>
                )}
                {panorama.semVencimento.qtd > 0 && (
                  /* `?periodo=tudo` junto do `?venc=sem`: sem ele o link cai na
                     janela padrão (hoje) e mostra zero linhas, porque o que não
                     tem vencimento quase nunca é do dia. Antes o filtro rodava
                     sobre a lista inteira já carregada e a janela era outra
                     conta; agora que a janela desce para o banco, o link
                     precisa dizer qual janela quer. */
                  <AcaoPainel href="/financeiro/lancamentos?periodo=tudo&venc=sem">
                    {`Datar ${panorama.semVencimento.qtd} sem vencimento`}
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
                panorama.semCategoria.qtd > 0 &&
                  `${plural(panorama.semCategoria.qtd, 'lançamento está', 'lançamentos estão')} sem categoria (${brl(panorama.semCategoria.valor)}) — nenhum entra na DRE enquanto ninguém disser o que são. A fila de classificação mostra cada um com a sugestão do ERP, a confiança e o porquê.`,
                panorama.semVencimento.qtd > 0 &&
                  `${plural(panorama.semVencimento.qtd, 'lançamento está', 'lançamentos estão')} sem data de vencimento (${brl(panorama.semVencimento.valor)}) — a projeção de caixa posiciona cada valor no dia do vencimento, então esses não aparecem no fluxo.`,
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
          // "1 de 1268": o primeiro número é o que o filtro devolveu, o
          // segundo é a base inteira. Os dois vêm contados no banco — o
          // primeiro por `count(*)` sobre o filtro, o segundo por `count(*)`
          // sobre a tabela. Contar o array da página daria "50 de 50" em toda
          // tela, que é a forma silenciosa deste bug.
          nota={`${resumo.total} de ${panorama.totalDaBase} no período`}
          padding="16px 17px 14px"
        >
          <TabelaUi
            colunas={colunas}
            itens={listadas}
            chaveDe={({ lancamento: l }) => l.id}
            larguraMinima={1120}
            faixaDe={({ situacao }) =>
              situacao === 'vencido' ? 'erro' : situacao === 'parcial' ? 'ouro' : null
            }
            // A linha que o detalhe está mostrando fica marcada: fechar o modal
            // sem isso devolve a pessoa a cinquenta linhas iguais, sem lembrar
            // em qual delas ela estava.
            selecionadoDe={({ lancamento: l }) => l.id === filtro.lancamento}
            vazio={
              <Vazio
                icone="busca"
                texto={
                  panorama.totalDaBase === 0
                    ? 'Nenhum lançamento cadastrado ainda.'
                    : 'Nenhum lançamento atende a este filtro.'
                }
              />
            }
            rodape={
              resumo.total > 0 ? (
                <RodapeTabela
                  contagem={
                    paginas > 1
                      ? `${(pagina - 1) * LANCAMENTOS_POR_PAGINA + 1}–${(pagina - 1) * LANCAMENTOS_POR_PAGINA + listadas.length} de ${resumo.total} · página ${pagina} de ${paginas} · ${periodoNaTela}`
                      : `${plural(resumo.total, 'lançamento', 'lançamentos')} · ${periodoNaTela}`
                  }
                  // Os três totais falam do FILTRO INTEIRO, não das 50 linhas
                  // desenhadas. É a razão de existir o `resumo` agregado no
                  // Postgres: com a lista paginada, um `reduce` sobre
                  // `listadas` faria "A pagar em aberto" encolher a cada
                  // página virada, sem erro nenhum na tela.
                  totais={[
                    { rotulo: 'A receber em aberto', valor: brl(resumo.aReceberAberto), tom: 'ok' },
                    { rotulo: 'A pagar em aberto', valor: brl(resumo.aPagarAberto), tom: 'erro' },
                    {
                      rotulo: 'Resultado do filtro',
                      valor: brl(resumo.aReceberAberto - resumo.aPagarAberto),
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
            nota={`${panorama.qtdPagas} de ${panorama.qtdSaidas} contas pagas`}
          />

          <Metrica
            rotulo="Prazo médio de pagamento"
            valor={
              panorama.prazoPagamento === null
                ? '—'
                : `${Math.abs(panorama.prazoPagamento).toFixed(1).replace('.', ',')} dias`
            }
            tom={panorama.prazoPagamento !== null && panorama.prazoPagamento > 0 ? 'erro' : 'ok'}
            medidor={
              <Mini
                valores={panorama.qtdPagas > 1 ? [0, panorama.prazoPagamento ?? 0] : [0, 0]}
                largura={140}
                altura={26}
                tom={panorama.prazoPagamento !== null && panorama.prazoPagamento > 0 ? 'erro' : 'ok'}
              />
            }
            nota={
              panorama.prazoPagamento === null
                ? 'Nenhuma conta baixada com vencimento definido'
                : panorama.prazoPagamento > 0
                  ? 'em média DEPOIS do vencimento'
                  : 'em média ANTES do vencimento'
            }
          />

          <Metrica
            rotulo="Prazo médio de recebimento"
            valor={
              panorama.prazoRecebimento === null
                ? '—'
                : `${Math.abs(panorama.prazoRecebimento).toFixed(1).replace('.', ',')} dias`
            }
            tom={panorama.prazoRecebimento !== null && panorama.prazoRecebimento > 0 ? 'atencao' : 'ok'}
            medidor={
              <Mini
                valores={panorama.prazoRecebimento !== null ? [0, panorama.prazoRecebimento] : [0, 0]}
                largura={140}
                altura={26}
                tom={panorama.prazoRecebimento !== null && panorama.prazoRecebimento > 0 ? 'atencao' : 'ok'}
              />
            }
            nota={
              panorama.prazoRecebimento === null
                ? 'Nenhum recebimento baixado ainda'
                : panorama.prazoRecebimento > 0
                  ? 'o dinheiro entra depois do previsto'
                  : 'o dinheiro entra antes do previsto'
            }
          />

          <Metrica
            rotulo="Inadimplência"
            valor={`${inadimplencia.toFixed(1).replace('.', ',')}%`}
            tom={inadimplencia > 5 ? 'erro' : 'ok'}
            medidor={<Progresso pct={inadimplencia} tom={inadimplencia > 5 ? 'erro' : 'ok'} />}
            nota={`${brl(panorama.vencidos.valor)} vencido em aberto`}
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

      {/* `key` pelo id: clicar num lançamento irmão dentro do detalhe troca o
          conteúdo sem desmontar o componente, e o formulário continuaria com
          os campos do lançamento anterior — inclusive a aba escolhida. */}
      {alvo && (
        <DetalheDoLancamento
          key={alvo.lancamento.id}
          lancamento={alvo.lancamento}
          situacao={alvo.situacao}
          explicacao={explicacao}
        />
      )}
    </Pilha>
    </ProvedorDeListas>
  )
}

/**
 * O segundo caminho para o detalhe, ao lado das ações da linha.
 *
 * A descrição já é o link, mas ela não tem nome próprio para leitor de tela —
 * "Venda YP-15101907" não diz que clicar ali abre alguma coisa. Este ícone tem
 * `aria-label`, e é o alvo que quem navega por teclado alcança na ordem
 * natural da linha.
 */
function AbrirDetalhe({ href, id }: { href: string; id: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      title="Abrir o detalhe"
      aria-label={`Abrir o detalhe do lançamento ${id}`}
      className="hover:border-ouro/45 hover:text-ouro"
      style={{
        width: 28,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 8,
        color: 'rgba(242,237,227,.55)',
        flex: 'none',
      }}
    >
      <Ico n="olho" tamanho={13} />
    </Link>
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
