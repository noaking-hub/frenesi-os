import {
  AcaoPainel,
  Celula,
  Chip,
  ComTrilha,
  Colunas,
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
  categoria?: string
  conta?: string
  centro?: string
  q?: string
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
      if (filtro.categoria && l.categoriaId !== filtro.categoria) return false
      if (filtro.conta && l.contaId !== filtro.conta) return false
      if (filtro.centro && l.centroCusto !== filtro.centro) return false
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
          <Celula
            principal={l.categoria}
            secundaria={l.natureza ? ROTULO_NATUREZA[l.natureza] : 'sem natureza gerencial'}
            tom={l.natureza ? undefined : 'atencao'}
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
      largura: '128px',
      alinhamento: 'right',
      render: ({ l, situacao }) => <AcoesGerenciais lancamento={l} situacao={situacao} />,
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

        <Colunas proporcao="repeat(auto-fit, minmax(190px, 1fr))" gap={12}>
          <Painel padding="14px 15px">
            <Pilha gap={8}>
              <Etiqueta>Taxa de pagamento</Etiqueta>
              <Num tamanho={19} tom={taxaPagamento >= 80 ? 'ok' : 'atencao'}>
                {`${taxaPagamento.toFixed(1).replace('.', ',')}%`}
              </Num>
              <Progresso pct={taxaPagamento} tom={taxaPagamento >= 80 ? 'ok' : 'atencao'} />
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                {`${pagas.length} de ${saidas.length} contas pagas`}
              </span>
            </Pilha>
          </Painel>

          <Painel padding="14px 15px">
            <Pilha gap={8}>
              <Etiqueta>Prazo médio de pagamento</Etiqueta>
              <Num tamanho={19} tom={prazoPagamento !== null && prazoPagamento > 0 ? 'erro' : 'ok'}>
                {prazoPagamento === null
                  ? '—'
                  : `${Math.abs(prazoPagamento).toFixed(1).replace('.', ',')} dias`}
              </Num>
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.38)' }}
              >
                {prazoPagamento === null
                  ? 'Nenhuma conta baixada com vencimento definido'
                  : prazoPagamento > 0
                    ? 'em média DEPOIS do vencimento'
                    : 'em média ANTES do vencimento'}
              </span>
            </Pilha>
          </Painel>

          <Painel padding="14px 15px">
            <Pilha gap={8}>
              <Etiqueta>Prazo médio de recebimento</Etiqueta>
              <Num tamanho={19} tom={prazoRecebimento !== null && prazoRecebimento > 0 ? 'atencao' : 'ok'}>
                {prazoRecebimento === null
                  ? '—'
                  : `${Math.abs(prazoRecebimento).toFixed(1).replace('.', ',')} dias`}
              </Num>
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.38)' }}
              >
                {prazoRecebimento === null
                  ? 'Nenhum recebimento baixado ainda'
                  : prazoRecebimento > 0
                    ? 'o dinheiro entra depois do previsto'
                    : 'o dinheiro entra antes do previsto'}
              </span>
            </Pilha>
          </Painel>

          <Painel padding="14px 15px">
            <Pilha gap={8}>
              <Etiqueta>Inadimplência</Etiqueta>
              <Num tamanho={19} tom={inadimplencia > 5 ? 'erro' : 'ok'}>
                {`${inadimplencia.toFixed(1).replace('.', ',')}%`}
              </Num>
              <Progresso pct={inadimplencia} tom={inadimplencia > 5 ? 'erro' : 'ok'} />
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                {`${brl(p.vencidos.valor)} vencido em aberto`}
              </span>
            </Pilha>
          </Painel>

          <Painel padding="14px 15px">
            <Pilha gap={8}>
              <Etiqueta>Saldo projetado</Etiqueta>
              <Num tamanho={19} tom={p.saldoProjetado < 0 ? 'erro' : 'ouro'}>
                {brl(p.saldoProjetado)}
              </Num>
              <Mini
                valores={[
                  p.contas.reduce((a, c) => a + c.saldoDisponivel, 0),
                  p.saldoProjetado,
                ]}
                largura={140}
                altura={26}
                tom={p.saldoProjetado < 0 ? 'erro' : 'ok'}
              />
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                depois de liquidar tudo que está em aberto
              </span>
            </Pilha>
          </Painel>
        </Colunas>
      </ComTrilha>
    </Pilha>
  )
}
