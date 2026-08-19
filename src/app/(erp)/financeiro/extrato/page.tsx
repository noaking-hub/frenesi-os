import Link from 'next/link'
import type { CSSProperties } from 'react'

import { TileMarca, iconeDaCategoria } from '@/components/erp/Marcas'
import {
  AcaoPainel,
  Celula,
  Chip,
  Colunas,
  Etiqueta,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  RodapeTabela,
  TabelaUi,
  TINTA,
  Vazio,
  type ColunaUi,
} from '@/components/erp/ui'
import { custoPorMeio, lerExtrato, resumoDoExtrato, ultimaAtualizacao,
  type FiltroExtrato,
} from '@/data/extrato'
import { lerCategorias, lerContas } from '@/data/financeiro'
import { CONTA_MP, mercadoPagoConfigurado } from '@/data/mercadopago'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, num, plural, sugerirCategoria } from '@/domain'
import type { LinhaExtrato } from '@/domain'

import { AcoesLinha } from './AcoesLinha'
import { BotoesGateway } from './BotoesGateway'
import { FiltrosExtrato } from './Filtros'

/**
 * Extrato Inteligente — importação, leitura e classificação do banco.
 *
 * O ERP tinha lançamentos digitados e repasses previstos; faltava o FATO. É
 * aqui que o dinheiro real entra: o Mercado Pago conta quanto sobrou de cada
 * venda depois da tarifa, e a fila de tratamento transforma cada linha em
 * lançamento com categoria.
 */
export const dynamic = 'force-dynamic'

interface Busca {
  situacao?: string
  conta?: string
  de?: string
  ate?: string
  tipo?: string
  busca?: string
}

const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/**
 * "15/08/2026 09:12" quando o instante tem hora; só a data quando não tem.
 * A hora é SEMPRE convertida para Brasília: o banco grava em UTC, e cortar a
 * string mostrava "última leitura 18:32" às 16h da tarde — leitura do futuro.
 */
const dataHoraBr = (iso: string) =>
  iso.length > 10
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }).replace(',', '')
    : dataBr(iso)

// O mesmo campo dos filtros aprovados em Lançamentos, mais baixo para caber
// na linha da tabela.
const CAMPO_LINHA: CSSProperties = {
  height: 28,
  width: '100%',
  padding: '0 9px',
  border: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'rgba(242,237,227,.88)',
  fontSize: 11.5,
  lineHeight: 1,
  outline: 0,
}

export default async function Extrato({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams

  if (!supabaseConfigurado()) {
    return (
      <Pilha>
        <Painel>
          <Vazio
            icone="cadeado"
            texto="O Supabase precisa estar configurado para importar e classificar o extrato."
          />
        </Painel>
      </Pilha>
    )
  }

  const filtro: FiltroExtrato = {
    // Por padrão, só o que precisa de decisão. Crédito de venda já casado com
    // pedido não tem categoria a escolher nem saldo a mover — pedir
    // confirmação para ele seria inventar trabalho.
    situacao: sp.situacao === 'todas' ? ('todas' as const) : ('a-decidir' as const),
    contaId: sp.conta || undefined,
    de: sp.de || undefined,
    ate: sp.ate || undefined,
    tipo: sp.tipo === 'entrada' || sp.tipo === 'saida' ? sp.tipo : undefined,
    busca: sp.busca || undefined,
    limite: 300,
  }

  const [pagina, resumo, atualizadoEm, contas, categorias, meios, periodo, ignoradas] =
    await Promise.all([
      lerExtrato(filtro),
      resumoDoExtrato(),
      ultimaAtualizacao(),
      lerContas(),
      lerCategorias(),
      custoPorMeio(),
      periodoImportado(),
      ultimasIgnoradas(5),
    ])

  const ligado = mercadoPagoConfigurado()
  const linhas = pagina.linhas

  // Nomes válidos de categoria: a sugestão heurística só entra no seletor se
  // existir no cadastro — pré-selecionar um nome que o banco não conhece
  // gravaria erro no primeiro clique.
  const nomesDeCategoria = new Set(categorias.map((c) => c.nome))
  const categoriasDeSaida = categorias.filter(
    (c) => c.ativa && c.natureza !== 'receita_operacional',
  )

  const sugestaoDe = (l: LinhaExtrato): string | null => {
    const s = sugerirCategoria(l.descricao, l.tipo)
    return s && nomesDeCategoria.has(s) ? s : null
  }

  /** Uma linha resolvida não tem o que decidir — mostra o estado, não um menu. */
  const resolvida = (l: LinhaExtrato) =>
    Boolean(l.lancamentoId) || l.ignorado || l.interno || (l.tipo === 'entrada' && Boolean(l.pedidoId))

  const entradasVisiveis = linhas.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0)
  const saidasVisiveis = linhas.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0)

  // Situação das linhas do extrato inteiro, derivada do resumo — o que não é
  // fila nem venda conciliada já foi classificado, dispensado ou é movimento
  // interno da conta.
  const resolvidas = Math.max(0, resumo.linhas - resumo.aDecidir - resumo.conciliadas)
  const pctDe = (parte: number) =>
    resumo.linhas > 0 ? `${((parte / resumo.linhas) * 100).toFixed(0)}%` : undefined

  const totalTarifas = meios.reduce((a, m) => a + m.tarifa, 0)

  const colunas: ColunaUi<LinhaExtrato>[] = [
    {
      chave: 'quando',
      titulo: 'Data / Hora',
      largura: '92px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Num tamanho={11.5} peso={400}>
            {dataBr(l.ocorridoEm)}
          </Num>
          <span className="font-mono" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
            {l.ocorridoEm.length > 10 ? l.ocorridoEm.slice(11, 16) : l.origem}
          </span>
        </span>
      ),
    },
    {
      chave: 'movimento',
      titulo: 'Movimento',
      largura: 'minmax(0,1fr)',
      identidade: true,
      render: (l) => (
        <Celula
          principal={l.descricao}
          secundaria={
            [l.contraparte, l.documento && `doc. ${l.documento}`].filter(Boolean).join(' · ') || '—'
          }
        />
      ),
    },
    {
      chave: 'origem',
      titulo: 'Origem',
      largura: '148px',
      secundaria: true,
      render: (l) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <TileMarca nome={`${l.contaNome} ${l.origem}`} tamanho={24} />
          <span
            className="font-sans"
            style={{
              fontSize: 11,
              color: 'rgba(242,237,227,.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.contaNome}
          </span>
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '108px',
      alinhamento: 'right',
      render: (l) => (
        <Num tamanho={12} tom={l.tipo === 'entrada' ? 'ok' : 'erro'}>
          {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}`}
        </Num>
      ),
    },
    {
      chave: 'categoria',
      titulo: 'Categoria / Sugestão',
      largura: '210px',
      render: (l) => {
        if (l.interno) return <Chip tom="info" contorno>Movimento da conta</Chip>
        if (l.ignorado) return <Chip tom="neutro" contorno>{l.motivoIgnorado || 'Dispensado'}</Chip>
        if (l.lancamentoId) return <Chip tom="ok">Classificado</Chip>
        if (l.tipo === 'entrada' && l.pedidoId) return <Chip tom="ok" contorno>Venda conciliada</Chip>

        if (l.tipo === 'entrada') {
          // Entrada sem pedido não pede categoria: a receita do DRE sai dos
          // pedidos pagos, e classificar o crédito numa categoria de receita
          // contaria a mesma venda duas vezes. "Aceitar" só grava o fato.
          return (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <Chip tom="atencao" contorno>Entrada sem pedido</Chip>
              {l.documento && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    color: 'rgba(242,237,227,.3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {`pagamento ${l.documento}`}
                </span>
              )}
            </span>
          )
        }

        const sugestao = sugestaoDe(l)
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ color: 'rgba(242,237,227,.4)', flex: 'none' }}>
              <Ico n={iconeDaCategoria(sugestao ?? l.descricao)} tamanho={13} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
              {/* O atributo `form` liga este seletor ao formulário da coluna
                  Ações — mesma linha, colunas diferentes da mesma grade. */}
              <select
                name="categoria"
                form={`classificar-${l.origem}-${l.chave}`}
                defaultValue={sugestao ?? ''}
                aria-label={`Categoria para ${l.descricao}`}
                className="font-sans"
                style={CAMPO_LINHA}
              >
                <option value="">Escolha a categoria</option>
                {categoriasDeSaida.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
              </select>
              {sugestao && (
                <span className="font-sans" style={{ fontSize: 9, color: TINTA.ouro }}>
                  sugestão automática
                </span>
              )}
            </span>
          </span>
        )
      },
    },
    {
      chave: 'pedido',
      titulo: 'Vínculo com pedido',
      largura: '116px',
      render: (l) =>
        l.pedidoId ? (
          <Link
            href={`/financeiro/conciliacao?pedido=${encodeURIComponent(l.pedidoId)}`}
            className="font-mono hover:brightness-125"
            style={{
              fontSize: 11,
              color: TINTA.ouro,
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {`#${l.pedidoId}`}
          </Link>
        ) : (
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }}>
            —
          </span>
        ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '168px',
      alinhamento: 'right',
      render: (l) =>
        resolvida(l) ? (
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.32)' }}>
            sem pendência
          </span>
        ) : (
          <AcoesLinha
            origem={l.origem}
            chave={l.chave}
            descricao={l.descricao}
            tipo={l.tipo}
            formId={`classificar-${l.origem}-${l.chave}`}
          />
        ),
    },
  ]

  return (
    <Pilha gap={16}>
      <GradeIndicadores minimo={196}>
        <Indicador
          icone="sino"
          tom="ouro"
          rotulo="Precisam de você"
          valor={num(resumo.aDecidir)}
          tomValor={resumo.aDecidir ? 'ouro' : 'ok'}
          nota={
            resumo.aDecidir
              ? plural(resumo.aDecidir, 'movimento para classificar', 'movimentos para classificar')
              : 'Nada pendente de decisão'
          }
          tomNota={resumo.aDecidir ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="olho"
          tom="info"
          rotulo="Movimentos lidos"
          valor={num(resumo.linhas)}
          nota={plural(resumo.linhas, 'linha importada do banco', 'linhas importadas do banco')}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entradas lidas"
          valor={brl(resumo.entradas)}
          nota="Crédito de venda e demais recebimentos"
          tomNota="ok"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saídas lidas"
          valor={brl(resumo.saidas)}
          nota="Tarifas, fornecedores e estornos"
          tomNota="erro"
        />
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Movimento líquido"
          valor={brl(resumo.saldo)}
          tomValor={resumo.saldo >= 0 ? 'ok' : 'erro'}
          nota="Entradas menos saídas de todo o extrato"
        />
        <Indicador
          icone="elo"
          tom={ligado ? 'ok' : 'erro'}
          rotulo="Gateway conectado"
          valor="Mercado Pago"
          nota={
            ligado
              ? atualizadoEm
                ? `Ativo · última leitura ${dataHoraBr(atualizadoEm)}`
                : 'Ativo · nenhuma leitura importada ainda'
              : 'Sem MERCADOPAGO_ACCESS_TOKEN no ambiente'
          }
          tomNota={ligado ? 'ok' : 'erro'}
        />
      </GradeIndicadores>

      {/* ── Importação Mercado Pago ─────────────────────────────────────── */}
      <Painel padding="16px 18px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, flex: '1 1 250px', minWidth: 0 }}>
            <TileMarca nome="Mercado Pago" tamanho={44} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span
                  className="font-display"
                  style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.1, color: 'var(--color-tinta)' }}
                >
                  Importação Mercado Pago
                </span>
                <Chip tom={ligado ? 'ok' : 'erro'}>{ligado ? 'Ativa' : 'Desconectada'}</Chip>
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}
              >
                {ligado
                  ? 'Integração bancária ativa — o gateway informa a tarifa real de cada venda'
                  : 'Integração parada — configure o token para ler o movimento da conta'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Etiqueta>Período importado</Etiqueta>
              <Num tamanho={12.5}>
                {periodo ? `${dataBr(periodo.de)} até ${dataBr(periodo.ate)}` : '—'}
              </Num>
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                {periodo
                  ? plural(diasEntre(periodo.de, periodo.ate), 'dia de movimento', 'dias de movimento')
                  : 'nenhuma linha importada ainda'}
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Etiqueta>Última leitura</Etiqueta>
              <Num tamanho={12.5}>{atualizadoEm ? dataHoraBr(atualizadoEm) : 'nunca'}</Num>
              <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.38)' }}>
                {plural(resumo.linhas, 'linha no extrato', 'linhas no extrato')}
              </span>
            </span>
          </div>

          <BotoesGateway ligado={ligado} contaMp={CONTA_MP} />
        </div>
      </Painel>

      {/* ── Fila de tratamento ──────────────────────────────────────────── */}
      <Painel
        titulo="Fila de tratamento"
        icone="lista"
        nota="cada linha vira lançamento quando ganha categoria"
        acao={
          <Chip tom={filtro.situacao === 'a-decidir' && pagina.total > 0 ? 'ouro' : 'neutro'}>
            {plural(pagina.total, 'movimento', 'movimentos')}
          </Chip>
        }
        padding="16px 17px 17px"
        rodape={{
          nota: 'A classificação automática usa as regras cadastradas em Categorias: o que casar com o padrão vira lançamento sozinho.',
          link: { href: '/financeiro/categorias', texto: 'Gerenciar regras' },
        }}
      >
        <FiltrosExtrato contas={contas.map((c) => ({ id: c.id, nome: c.nome }))} />

        <TabelaUi
          colunas={colunas}
          itens={linhas}
          chaveDe={(l) => `${l.origem}:${l.chave}`}
          larguraMinima={1040}
          faixaDe={(l) => (resolvida(l) ? null : l.tipo === 'saida' ? 'atencao' : 'info')}
          vazio={
            <Vazio
              icone={filtro.situacao === 'a-decidir' ? 'check-circulo' : 'busca'}
              texto={
                filtro.situacao === 'a-decidir'
                  ? 'Nada na fila: as vendas conciliam sozinhas. Só despesa sem categoria e entrada sem pedido aparecem aqui.'
                  : 'Nenhum movimento bate com os filtros. Amplie o período ou limpe a busca.'
              }
            />
          }
          rodape={
            linhas.length > 0 ? (
              <RodapeTabela
                contagem={
                  linhas.length < pagina.total
                    ? `Mostrando ${linhas.length} de ${num(pagina.total)} movimentos — aperte o período para ver o resto`
                    : plural(linhas.length, 'movimento listado', 'movimentos listados')
                }
                totais={[
                  { rotulo: 'Entradas do filtro', valor: brl(entradasVisiveis), tom: 'ok' },
                  { rotulo: 'Saídas do filtro', valor: brl(saidasVisiveis), tom: 'erro' },
                  {
                    rotulo: 'Líquido do filtro',
                    valor: brl(entradasVisiveis - saidasVisiveis),
                    tom: 'ouro',
                  },
                ]}
              />
            ) : null
          }
        />
      </Painel>

      {/* ── Faixa inferior ──────────────────────────────────────────────── */}
      <Colunas proporcao="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" gap={14}>
        <Painel titulo="O que aconteceu" icone="barras" nota="todo o extrato importado">
          <Pilha gap={0}>
            <LinhaValor
              rotulo="Total movimentado"
              valor={brl(resumo.entradas + resumo.saidas)}
              icone="transferir"
              tomIcone="neutro"
            />
            <LinhaValor
              rotulo="Entradas"
              valor={brl(resumo.entradas)}
              tom="ok"
              icone="entrada"
              tomIcone="ok"
            />
            <LinhaValor
              rotulo="Saídas"
              valor={brl(resumo.saidas)}
              tom="erro"
              icone="saida"
              tomIcone="erro"
            />
            <LinhaValor
              rotulo="Movimento líquido"
              valor={brl(resumo.saldo)}
              tom={resumo.saldo >= 0 ? 'ok' : 'erro'}
              destaque
            />
          </Pilha>

          {resumo.linhas > 0 && (
            <Pilha gap={9}>
              <Etiqueta>Situação das linhas</Etiqueta>
              <ListaBarras
                maximo={resumo.linhas}
                itens={[
                  {
                    rotulo: 'Precisam de você',
                    valor: resumo.aDecidir,
                    texto: plural(resumo.aDecidir, 'movimento', 'movimentos'),
                    direita: pctDe(resumo.aDecidir),
                    tom: 'ouro',
                  },
                  {
                    rotulo: 'Vendas conciliadas',
                    valor: resumo.conciliadas,
                    texto: plural(resumo.conciliadas, 'crédito casado', 'créditos casados'),
                    direita: pctDe(resumo.conciliadas),
                    tom: 'ok',
                  },
                  {
                    rotulo: 'Resolvidas ou internas',
                    valor: resolvidas,
                    texto: 'classificadas, dispensadas ou movimento da conta',
                    direita: pctDe(resolvidas),
                    tom: 'neutro',
                  },
                ]}
              />
            </Pilha>
          )}
        </Painel>

        <Painel
          titulo="Custo por meio de pagamento"
          icone="porcento"
          nota="tarifa real informada pelo gateway"
          rodape={{
            nota: 'O custo sai da tarifa que o gateway informou em cada pagamento — quando a taxa muda, este número muda junto.',
            link: { href: '/financeiro/conciliacao', texto: 'Ver conciliação' },
          }}
        >
          {meios.length > 0 ? (
            <>
              <ListaBarras
                itens={meios.map((m) => ({
                  rotulo: m.meio,
                  valor: m.tarifa,
                  texto: `${m.pct.toFixed(2).replace('.', ',')}% de custo · ${plural(m.vendas, 'venda', 'vendas')}`,
                  direita: brl(m.tarifa),
                  tom: 'ouro' as const,
                }))}
              />
              <LinhaValor rotulo="Tarifa total retida" valor={brl(totalTarifas)} tom="erro" destaque />
            </>
          ) : (
            <Vazio icone="porcento" texto="Nenhuma tarifa informada pelo gateway ainda." />
          )}
        </Painel>

        <Painel
          titulo="Movimentos ignorados"
          icone="x-circulo"
          tom="neutro"
          nota={ignoradas.length ? 'os últimos dispensados da fila' : undefined}
          acao={<AcaoPainel href="/financeiro/extrato?situacao=todas">Ver todas as linhas</AcaoPainel>}
          rodape={{
            nota: 'Linha dispensada não vira lançamento e sai da fila — o motivo fica gravado na própria linha.',
          }}
        >
          {ignoradas.length > 0 ? (
            <Pilha gap={0}>
              {ignoradas.map((i) => (
                <LinhaValor
                  key={i.chave}
                  rotulo={i.descricao}
                  nota={[dataBr(i.ocorridoEm), i.motivo].filter(Boolean).join(' · ')}
                  valor={`${i.tipo === 'entrada' ? '+' : '−'} ${brl(i.valor)}`}
                  tom="neutro"
                />
              ))}
            </Pilha>
          ) : (
            <Vazio icone="check-circulo" texto="Nenhuma linha dispensada ainda." />
          )}
        </Painel>
      </Colunas>
    </Pilha>
  )
}

/** Dias entre duas datas AAAA-MM-DD, inclusivos. */
function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) + 1 : 0
}

/**
 * Menor e maior `ocorrido_em` do extrato — o "Período importado" do painel.
 *
 * A camada de dados não expõe esse par e o resumo agregado não o carrega;
 * duas consultas de uma linha respondem sem trazer o extrato inteiro.
 */
async function periodoImportado(): Promise<{ de: string; ate: string } | null> {
  const sb = supabaseServer()
  const [{ data: primeira }, { data: ultima }] = await Promise.all([
    sb
      .from('extrato_linhas')
      .select('ocorrido_em')
      .order('ocorrido_em', { ascending: true })
      .limit(1)
      .maybeSingle(),
    sb
      .from('extrato_linhas')
      .select('ocorrido_em')
      .order('ocorrido_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (!primeira?.ocorrido_em || !ultima?.ocorrido_em) return null
  return { de: String(primeira.ocorrido_em), ate: String(ultima.ocorrido_em) }
}

interface LinhaIgnorada {
  chave: string
  ocorridoEm: string
  descricao: string
  tipo: 'entrada' | 'saida'
  valor: number
  motivo: string
}

/** As últimas linhas dispensadas, com o motivo que alguém escreveu ao dispensar. */
async function ultimasIgnoradas(limite: number): Promise<LinhaIgnorada[]> {
  const { data } = await supabaseServer()
    .from('extrato_linhas')
    .select('chave, ocorrido_em, descricao, tipo, valor, motivo_ignorado')
    .eq('ignorado', true)
    .order('ocorrido_em', { ascending: false })
    .limit(limite)
  return (data ?? []).map((l) => ({
    chave: String(l.chave),
    ocorridoEm: String(l.ocorrido_em),
    descricao: String(l.descricao),
    tipo: l.tipo === 'saida' ? 'saida' : 'entrada',
    valor: Number(l.valor),
    motivo: String(l.motivo_ignorado ?? ''),
  }))
}
