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
  situacaoDe,
} from '@/domain'
import type { LancamentoGerencial, SituacaoLancamento } from '@/domain'

import { AcoesGerenciais, NovoCompromisso } from '../Compromissos'
import { BarraDeFiltros } from './Filtros'

/**
 * Lançamentos — contas a pagar e a receber da operação.
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
  /** Janela de vencimento, AAAA-MM-DD inclusivos. */
  de?: string
  ate?: string
  /** 'sim' | 'nao' — o mockup separa o que se repete todo mês do avulso. */
  recorrente?: string
}

export default async function Lancamentos({ searchParams }: { searchParams: Promise<Busca> }) {
  const filtro = await searchParams
  const p = await carregarLancamentos()

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
      // O período filtra por VENCIMENTO: é a data que decide o que entra na
      // fila de trabalho. Título sem vencimento fica fora da janela.
      if (filtro.de && (!l.venceEm || l.venceEm < filtro.de)) return false
      if (filtro.ate && (!l.venceEm || l.venceEm > filtro.ate)) return false
      if (filtro.recorrente === 'sim' && !l.recorrente) return false
      if (filtro.recorrente === 'nao' && l.recorrente) return false
      if (busca) {
        const alvo = `${l.descricao} ${l.favorecido ?? ''} ${l.documento ?? ''}`.toLowerCase()
        if (!alvo.includes(busca)) return false
      }
      return true
    })
    .sort((a, b) => {
      // Vencido primeiro, liquidado por último: a ordem da tela é a ordem em
      // que o dinheiro precisa de decisão.
      const peso = (s: SituacaoLancamento) => (s === 'vencido' ? 0 : s === 'liquidado' ? 2 : 1)
      const d = peso(a.situacao) - peso(b.situacao)
      if (d !== 0) return d
      return (a.l.venceEm ?? '9999').localeCompare(b.l.venceEm ?? '9999')
    })

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
    recorrentesPorCategoria.set(l.categoria, (recorrentesPorCategoria.get(l.categoria) ?? 0) + l.valor)
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
      chave: 'venc',
      titulo: 'Vencimento',
      largura: '92px',
      render: ({ l, situacao }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Num tamanho={11.5} tom={situacao === 'vencido' ? 'erro' : undefined}>
            {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
          </Num>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.34)' }}>
            {`comp. ${l.competencia.slice(0, 7)}`}
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
            {l.parcela && l.parcelas && (
              <Chip tom="info" contorno>{`${l.parcela}/${l.parcelas}`}</Chip>
            )}
            {l.recorrente && <Chip tom="roxo" contorno>{l.recorrencia ?? 'Recorrente'}</Chip>}
            {l.transferenciaId && <Chip tom="neutro" contorno>Transferência</Chip>}
          </span>
          <span
            className="font-sans"
            style={{
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
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '96px',
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
                ? 'classifique para entrar na DRE'
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
      largura: '138px',
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
      largura: '100px',
      render: ({ situacao }) => (
        <Chip tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO_LANCAMENTO[situacao]}</Chip>
      ),
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: '96px',
      render: ({ l }) => (
        <Chip tom={l.origem === 'Manual' ? 'neutro' : 'info'} contorno>
          {l.origem}
        </Chip>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '156px',
      alinhamento: 'right',
      render: ({ l, situacao }) => (
        <AcoesGerenciais
          lancamento={l}
          situacao={situacao}
          contas={p.contas}
          categorias={p.categorias}
          centros={p.centrosCusto}
        />
      ),
    },
  ]

  return (
    <Pilha gap={16}>

      <GradeIndicadores>
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="A pagar hoje"
          valor={brl(p.aPagarHoje.valor)}
          nota={
            p.aPagarHoje.qtd
              ? plural(p.aPagarHoje.qtd, 'lançamento vence hoje', 'lançamentos vencem hoje')
              : 'Nada vence hoje'
          }
          tomNota={p.aPagarHoje.qtd ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="A receber hoje"
          valor={brl(p.aReceberHoje.valor)}
          nota={
            p.aReceberHoje.qtd
              ? plural(p.aReceberHoje.qtd, 'recebimento previsto', 'recebimentos previstos')
              : 'Nenhum recebimento hoje'
          }
          tomNota="ok"
        />
        <Indicador
          icone="alerta"
          tom="erro"
          rotulo="Vencidos"
          valor={brl(p.vencidos.valor)}
          tomValor={p.vencidos.qtd ? 'erro' : undefined}
          nota={
            p.vencidos.qtd
              ? `${plural(p.vencidos.qtd, 'obrigação em atraso', 'obrigações em atraso')} · multa e juros correndo`
              : 'Nada em atraso'
          }
          tomNota={p.vencidos.qtd ? 'erro' : 'ok'}
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
                <NovoCompromisso
                  contas={p.contas}
                  categorias={p.categorias}
                  centros={p.centrosCusto}
                />
                <AcaoPainel href="/financeiro/extrato">Importar do extrato</AcaoPainel>
                <AcaoPainel href="/financeiro/conciliacao">Conciliar recebimentos</AcaoPainel>
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
                {semCategoria.length > 0 && (
                  <AcaoPainel href="/financeiro/lancamentos?categoria=sem">
                    {`Classificar ${semCategoria.length} sem categoria`}
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
                  `${plural(semCategoria.length, 'lançamento está', 'lançamentos estão')} sem categoria (${brl(valorSemCategoria)}) — o ERP não sabe o que eles são e por isso nenhum entra na DRE.`,
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
            itens={visiveis}
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
                  contagem={plural(visiveis.length, 'lançamento listado', 'lançamentos listados')}
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
