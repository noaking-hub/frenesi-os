import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import {
  Abas,
  Bolinha,
  BotaoLinha,
  Celula,
  Chip,
  Colunas,
  ComTrilha,
  CONTORNO,
  Destaque,
  Etiqueta,
  Ferramentas,
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
  VELADO,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { TileMarca } from '@/components/erp/Marcas'
import { carregarConciliacao } from '@/data/financeiro'
import { brl, diaCurtoPt, pct, plural, ROTULO_STATUS_VENDA } from '@/domain'
import type { StatusVenda, VendaConciliada } from '@/domain'

import { ConciliarRepasse, PreverRepasses } from '../Widgets'

/**
 * Conciliação Bancária — cada venda contra o extrato e as tarifas reais.
 *
 * A regra que esvaziou o alarme falso: taxa cobrada CORRETAMENTE é custo, não
 * divergência. Divergência aqui é a diferença entre a taxa REAL e a esperada,
 * e só ela exige decisão — por isso a tela abre na fila "Precisam de ação".
 */
export const dynamic = 'force-dynamic'

const TOM: Record<StatusVenda, TomUi> = {
  conciliada: 'ok',
  taxa_divergente: 'atencao',
  sem_credito: 'erro',
  valor_divergente: 'erro',
  estornada: 'neutro',
  chargeback: 'erro',
  aguardando: 'info',
  dispensada: 'neutro',
}

/** Filas que pedem gente, na ordem em que doem. */
const EXIGEM_DECISAO: StatusVenda[] = [
  'chargeback',
  'sem_credito',
  'valor_divergente',
  'taxa_divergente',
]

const POR_PAGINA = 10

/**
 * A causa provável sai da CADEIA DE EVIDÊNCIAS, não de adivinhação: cada
 * status já é a conclusão de `avaliarVenda`, e o texto só a traduz para a
 * decisão que o operador precisa tomar.
 */
function causaDe(v: VendaConciliada): string {
  switch (v.status) {
    case 'taxa_divergente':
      return `A tarifa cobrada (${brl(v.taxaReal ?? 0)}) difere da prevista (${brl(v.taxaEsperada)}). Provável mudança de bandeira, parcelamento ou reajuste do adquirente — vale conferir a regra de taxa cadastrada.`
    case 'valor_divergente':
      return 'O crédito não bate com o líquido esperado e a tarifa está correta. Provável crédito parcial (split), estorno parcial ou lançamento trocado de pedido.'
    case 'sem_credito':
      return 'Pagamento confirmado há mais de 5 dias sem crédito correspondente no extrato. Ou o repasse atrasou, ou o crédito entrou sem vínculo com o pedido.'
    case 'chargeback':
      return 'Contestação aberta pelo portador do cartão: o valor foi revertido e o prazo de defesa corre contra a loja. Reúna comprovante de entrega e comunicação com o cliente.'
    case 'estornada':
      return 'Venda cancelada com estorno ao cliente. Nenhuma ação pendente — o registro fica para o histórico.'
    case 'aguardando':
      return 'Dentro do prazo normal de repasse do adquirente. Pix credita em minutos; cartão respeita a agenda de recebíveis.'
    default:
      return 'Crédito casado com o pedido dentro da tolerância de centavos. Nenhuma ação pendente.'
  }
}

const parte = (n: number, todo: number) => (todo > 0 ? (n / todo) * 100 : 0)
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

interface Busca {
  status?: string
  canal?: string
  de?: string
  ate?: string
  q?: string
  pedido?: string
  pagina?: string
}

export default async function Conciliacao({
  searchParams,
}: {
  searchParams: Promise<Busca>
}) {
  const sp = await searchParams
  const c = await carregarConciliacao()

  if (c.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para comparar vendas com repasses." />
        </Painel>
      </Pilha>
    )
  }

  if (c.vendas.length === 0) {
    return (
      <Pilha>
        <Ferramentas direita={<PreverRepasses />} />
        <Painel>
          <Vazio
            icone="recibo"
            texto="Nenhuma venda para conciliar. Importe pedidos e gere a previsão de repasse para o ERP saber o que cada plataforma deve creditar."
          />
        </Painel>
      </Pilha>
    )
  }

  // ── Filtros da URL ───────────────────────────────────────────────────────
  // Sem status na URL a tela abre na fila "Precisam de ação" — é a pergunta
  // que trouxe o operador até aqui. "Todas" é escolha explícita, como no
  // Extrato. Links antigos (status=chargeback etc.) continuam funcionando.
  const ehStatus = (s: string): s is StatusVenda => s in ROTULO_STATUS_VENDA
  const status =
    sp.status && (sp.status === 'todas' || sp.status === 'acao' || ehStatus(sp.status))
      ? sp.status
      : 'acao'
  const canal = sp.canal || undefined
  const de = sp.de || undefined
  const ate = sp.ate || undefined
  const q = (sp.q || '').trim().toLowerCase() || undefined

  const filtradas = c.vendas.filter((v) => {
    if (status === 'acao' && !EXIGEM_DECISAO.includes(v.status)) return false
    if (status !== 'acao' && status !== 'todas' && v.status !== status) return false
    if (canal && v.canal !== canal) return false
    // O período recorta pela data do pedido: é a única data que TODA venda
    // tem — quem ainda não caiu na conta não tem data de crédito.
    if (de && (!v.previstoEm || v.previstoEm < de)) return false
    if (ate && (!v.previstoEm || v.previstoEm > ate)) return false
    if (q && !v.pedidoId.toLowerCase().includes(q) && !v.cliente.toLowerCase().includes(q))
      return false
    return true
  })

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const pagina = Math.min(totalPaginas, Math.max(1, parseInt(sp.pagina ?? '1', 10) || 1))
  const visiveis = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const urlCom = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const todos: Record<string, string | undefined> = {
      status,
      canal,
      de,
      ate,
      q: sp.q || undefined,
      ...extra,
    }
    for (const [k, v] of Object.entries(todos)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `/financeiro/conciliacao?${s}` : '/financeiro/conciliacao'
  }
  const urlDe = (pedidoId: string, pg: number) =>
    urlCom({ pedido: pedidoId, pagina: pg > 1 ? String(pg) : undefined })

  // A venda selecionada abre na trilha ao lado da tabela. Sem seleção na URL,
  // abre na primeira da página que exige decisão.
  const selecionada =
    filtradas.find((v) => v.pedidoId === sp.pedido) ??
    visiveis.find((v) => EXIGEM_DECISAO.includes(v.status)) ??
    visiveis[0] ??
    null
  const posicao = selecionada
    ? filtradas.findIndex((v) => v.pedidoId === selecionada.pedidoId)
    : -1
  const paginaDe = (idx: number) => Math.floor(idx / POR_PAGINA) + 1

  // ── Números dos KPIs — sempre derivados dos totais reais ─────────────────
  const naFila = EXIGEM_DECISAO.reduce((a, s) => a + c.totais[s].qtd, 0)
  const divergentes = {
    qtd: c.totais.taxa_divergente.qtd + c.totais.valor_divergente.qtd,
    valor: c.totais.taxa_divergente.valor + c.totais.valor_divergente.valor,
  }
  // O que ainda deve cair: líquido esperado das vendas pagas sem crédito e
  // das que aguardam prazo. Chargeback e estorno não voltam — ficam fora.
  const aReceber = c.vendas.filter(
    (v) => v.liquidoRecebido === null && (v.status === 'aguardando' || v.status === 'sem_credito'),
  )
  const aReceberValor = aReceber.reduce((a, v) => a + v.liquidoEsperado, 0)
  const comCredito = c.vendas.filter((v) => v.liquidoRecebido !== null).length
  const temTarifaReal = c.taxaMediaReal > 0

  const causas = EXIGEM_DECISAO.filter((s) => c.totais[s].qtd > 0).map((s) => ({
    rotulo: ROTULO_STATUS_VENDA[s],
    valor: c.totais[s].qtd,
    texto: plural(c.totais[s].qtd, 'venda', 'vendas'),
    direita: naFila > 0 ? `${((c.totais[s].qtd / naFila) * 100).toFixed(0)}%` : undefined,
    tom: TOM[s],
  }))

  const canais = [...new Set(c.vendas.map((v) => v.canal))].sort()

  // ── Tabela: pedidos vs. extrato ──────────────────────────────────────────
  const colunas: ColunaUi<VendaConciliada>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: 'minmax(120px,1fr)',
      identidade: true,
      render: (v) => (
        <Link
          href={urlDe(v.pedidoId, pagina)}
          className="hover:brightness-125"
          style={{ textDecoration: 'none', display: 'block', minWidth: 0 }}
        >
          <Celula principal={v.pedidoId} secundaria={v.cliente} />
        </Link>
      ),
    },
    {
      chave: 'pagamento',
      titulo: 'Pagamento',
      largura: '132px',
      render: (v) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* O tile na cor do gateway é o que faz a linha ser reconhecível de
              relance — nome e meio juntos para o regex da marca acertar. */}
          <TileMarca nome={`${v.canal} ${v.meio}`} tamanho={26} />
          <Celula principal={cap(v.canal)} secundaria={v.meio} />
        </span>
      ),
    },
    {
      chave: 'bruto',
      titulo: 'Bruto (pedido)',
      largura: '96px',
      alinhamento: 'right',
      render: (v) => <Num tamanho={12}>{brl(v.bruto)}</Num>,
    },
    {
      chave: 'prevista',
      titulo: 'Tarifa prevista',
      largura: '96px',
      secundaria: true,
      alinhamento: 'right',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Num tamanho={11.5}>{brl(v.taxaEsperada)}</Num>
          <Num tamanho={9.5} peso={400} tom="neutro">
            {pct(parte(v.taxaEsperada, v.bruto), 2)}
          </Num>
        </span>
      ),
    },
    {
      chave: 'caiu',
      titulo: 'Caiu na conta',
      largura: '96px',
      alinhamento: 'right',
      render: (v) => (
        <Num tamanho={12} tom={v.liquidoRecebido === null ? 'neutro' : v.liquidoRecebido < 0 ? 'erro' : 'ok'}>
          {v.liquidoRecebido === null ? '—' : brl(v.liquidoRecebido)}
        </Num>
      ),
    },
    {
      chave: 'real',
      titulo: 'Tarifa real',
      largura: '96px',
      secundaria: true,
      alinhamento: 'right',
      render: (v) =>
        v.taxaReal === null ? (
          <Num tamanho={11.5} tom="neutro">
            —
          </Num>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Num tamanho={11.5} tom={Math.abs(v.taxaReal - v.taxaEsperada) > 0.05 ? 'erro' : undefined}>
              {brl(v.taxaReal)}
            </Num>
            <Num tamanho={9.5} peso={400} tom="neutro">
              {pct(parte(v.taxaReal, v.bruto), 2)}
            </Num>
          </span>
        ),
    },
    {
      chave: 'dif',
      titulo: 'Diferença',
      largura: '92px',
      alinhamento: 'right',
      render: (v) =>
        v.diferenca === 0 ? (
          <Num tamanho={11.5} tom="neutro" peso={400}>
            R$ 0,00
          </Num>
        ) : (
          <Num tamanho={12} tom={v.diferenca < 0 ? 'erro' : 'ouro'}>
            {`${v.diferenca > 0 ? '+' : '−'} ${brl(Math.abs(v.diferenca))}`}
          </Num>
        ),
    },
    {
      chave: 'credito',
      titulo: 'Data de crédito',
      largura: '104px',
      secundaria: true,
      render: (v) =>
        v.recebidoEm ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Num tamanho={11} peso={400}>
              {diaCurtoPt(v.recebidoEm.slice(0, 10))}
            </Num>
            {v.recebidoEm.length >= 16 && (
              <Num tamanho={9.5} peso={400} tom="neutro">
                {v.recebidoEm.slice(11, 16)}
              </Num>
            )}
          </span>
        ) : (
          <Num tamanho={11} peso={400} tom="neutro">
            —
          </Num>
        ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '108px',
      render: (v) => <Chip tom={TOM[v.status]}>{ROTULO_STATUS_VENDA[v.status]}</Chip>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '48px',
      alinhamento: 'center',
      render: (v) => (
        <Link
          href={urlDe(v.pedidoId, pagina)}
          aria-label={`Ver detalhes do pedido ${v.pedidoId}`}
          className="hover:text-ouro"
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 26,
            height: 26,
            borderRadius: 7,
            color: 'rgba(242,237,227,.45)',
          }}
        >
          <Ico n="olho" tamanho={15} />
        </Link>
      ),
    },
  ]

  return (
    <Pilha gap={16}>
      <Ferramentas
        esquerda={
          <Abas
            itens={[
              { id: 'acao', rotulo: 'Precisam de ação', contagem: naFila, tom: naFila ? 'erro' : 'ok' },
              { id: 'conciliada', rotulo: 'Conciliadas', contagem: c.totais.conciliada.qtd, tom: 'ok' },
              {
                id: 'taxa_divergente',
                rotulo: 'Divergências de tarifa',
                contagem: c.totais.taxa_divergente.qtd,
                tom: 'atencao',
              },
              { id: 'sem_credito', rotulo: 'Sem crédito', contagem: c.totais.sem_credito.qtd, tom: 'erro' },
              // Fora da fila de ação de propósito: são as que não têm extrato
              // do período e nunca vão conciliar. Ficam visíveis numa aba
              // própria porque some-las seria fingir que não existiram.
              {
                id: 'dispensada',
                rotulo: 'Sem extrato',
                contagem: c.totais.dispensada.qtd,
                tom: 'neutro',
              },
              { id: 'todas', rotulo: 'Todas', contagem: c.vendas.length },
            ]}
            ativo={status}
            base="/financeiro/conciliacao"
            chave="status"
            manter={{ canal, de, ate, q: sp.q || undefined }}
          />
        }
        direita={<PreverRepasses />}
      />

      {/* Formulário GET puro: os filtros moram na URL, então o F5 mantém a
          escolha e um alerta consegue abrir exatamente o recorte que acusou. */}
      <form
        method="get"
        action="/financeiro/conciliacao"
        style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}
      >
        <CampoFiltro rotulo="Canal / adquirente">
          <select name="canal" defaultValue={canal ?? ''} className="font-sans" style={ENTRADA}>
            <option value="">Todos</option>
            {canais.map((cn) => (
              <option key={cn} value={cn}>
                {cap(cn)}
              </option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Período — de">
          <input type="date" name="de" defaultValue={de ?? ''} className="font-mono" style={ENTRADA} />
        </CampoFiltro>
        <CampoFiltro rotulo="até">
          <input type="date" name="ate" defaultValue={ate ?? ''} className="font-mono" style={ENTRADA} />
        </CampoFiltro>
        <CampoFiltro rotulo="Status">
          <select name="status" defaultValue={status} className="font-sans" style={ENTRADA}>
            <option value="acao">Precisam de ação</option>
            {(Object.keys(ROTULO_STATUS_VENDA) as StatusVenda[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_VENDA[s]}
              </option>
            ))}
            <option value="todas">Todas</option>
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Busca">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Pedido ou cliente…"
            className="font-sans"
            style={{ ...ENTRADA, width: 190 }}
          />
        </CampoFiltro>
        <button
          type="submit"
          className="font-sans hover:border-ouro/40 hover:text-ouro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 34,
            padding: '0 14px',
            border: '1px solid rgba(255,255,255,.09)',
            background: 'rgba(255,255,255,.025)',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-secundario)',
            cursor: 'pointer',
          }}
        >
          <Ico n="filtro" tamanho={14} />
          Filtrar
        </button>
        {(canal || de || ate || sp.q) && (
          <Link
            href="/financeiro/conciliacao"
            className="font-sans hover:text-ouro"
            style={{ fontSize: 11.5, color: 'rgba(242,237,227,.45)', textDecoration: 'none', paddingBottom: 9 }}
          >
            Limpar filtros
          </Link>
        )}
      </form>

      <GradeIndicadores minimo={172}>
        <Indicador
          icone="check-circulo"
          tom="ok"
          rotulo="Conciliadas"
          valor={c.totais.conciliada.qtd.toLocaleString('pt-BR')}
          nota={`${brl(c.totais.conciliada.valor)} · ${pct(parte(c.totais.conciliada.valor, c.volumeBruto))} do total`}
          tomNota="ok"
        />
        <Indicador
          icone="alerta"
          tom={divergentes.qtd ? 'atencao' : 'ok'}
          rotulo="Divergências"
          valor={String(divergentes.qtd)}
          tomValor={divergentes.qtd ? 'atencao' : 'ok'}
          nota={`${brl(divergentes.valor)} · ${pct(parte(divergentes.valor, c.volumeBruto))} do total`}
          tomNota={divergentes.qtd ? 'atencao' : 'neutro'}
        />
        <Indicador
          icone="alerta-circulo"
          tom={c.totais.sem_credito.qtd ? 'erro' : 'ok'}
          rotulo="Pagas sem crédito"
          valor={String(c.totais.sem_credito.qtd)}
          tomValor={c.totais.sem_credito.qtd ? 'erro' : 'ok'}
          nota={`${brl(c.totais.sem_credito.valor)} · ${pct(parte(c.totais.sem_credito.valor, c.volumeBruto))} do total`}
          tomNota={c.totais.sem_credito.qtd ? 'erro' : 'neutro'}
        />
        <Indicador
          icone="repetir"
          tom={c.totais.chargeback.qtd ? 'erro' : 'ok'}
          rotulo="Chargebacks pendentes"
          valor={String(c.totais.chargeback.qtd)}
          tomValor={c.totais.chargeback.qtd ? 'erro' : 'ok'}
          nota={
            c.totais.chargeback.qtd
              ? `${brl(c.totais.chargeback.valor)} em contestação`
              : 'Nenhuma contestação aberta'
          }
          tomNota={c.totais.chargeback.qtd ? 'erro' : 'ok'}
        />
        <Indicador
          icone="porcento"
          tom="ouro"
          rotulo="Tarifa média encontrada"
          valor={pct(temTarifaReal ? c.taxaMediaReal : c.taxaMediaPrevista, 2)}
          delta={
            temTarifaReal
              ? {
                  pct: c.taxaMediaReal - c.taxaMediaPrevista,
                  base: `vs. ${pct(c.taxaMediaPrevista, 2)} prevista`,
                  subirEhRuim: true,
                  unidade: 'p.p.',
                }
              : undefined
          }
          nota={temTarifaReal ? undefined : 'Estimada pelo parâmetro — nenhum repasse com tarifa real ainda'}
        />
        <Indicador
          icone="calendario"
          tom="info"
          rotulo="Previsto a receber"
          valor={brl(aReceberValor)}
          nota={`${plural(aReceber.length, 'venda aguardando crédito', 'vendas aguardando crédito')}`}
        />
      </GradeIndicadores>

      <ComTrilha
        largura={330}
        trilha={
          selecionada ? (
            <Painel
              titulo="Detalhes da divergência"
              icone="busca"
              tom={TOM[selecionada.status]}
              acao={<Chip tom={TOM[selecionada.status]}>{ROTULO_STATUS_VENDA[selecionada.status]}</Chip>}
            >
              <span
                className="font-display"
                style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-tinta)' }}
              >
                {`Pedido ${selecionada.pedidoId}`}
              </span>

              <Pilha gap={0}>
                <LinhaFicha rotulo="Cliente" valor={selecionada.cliente} />
                <LinhaFicha rotulo="Pagamento" valor={`${cap(selecionada.canal)} · ${selecionada.meio}`} />
                {selecionada.transacaoId && (
                  <LinhaFicha rotulo="Transação" valor={selecionada.transacaoId} mono />
                )}
              </Pilha>

              <Pilha gap={7}>
                <Etiqueta>Comparativo financeiro</Etiqueta>
                {/* Duas colunas, Pedido × Extrato: o previsto de um lado, o
                    fato do outro — a diferença embaixo é a conta entre eles. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <ColunaComparativa
                    titulo="Pedido"
                    linhas={[
                      { rotulo: 'Bruto', valor: brl(selecionada.bruto) },
                      {
                        rotulo: 'Tarifa prevista',
                        valor: brl(selecionada.taxaEsperada),
                        nota: pct(parte(selecionada.taxaEsperada, selecionada.bruto), 2),
                      },
                      { rotulo: 'Líquido esperado', valor: brl(selecionada.liquidoEsperado) },
                    ]}
                  />
                  <ColunaComparativa
                    titulo="Extrato"
                    linhas={[
                      {
                        rotulo: 'Caiu na conta',
                        valor: selecionada.liquidoRecebido === null ? '—' : brl(selecionada.liquidoRecebido),
                        tom: selecionada.liquidoRecebido === null ? 'neutro' : 'ok',
                      },
                      {
                        rotulo: 'Tarifa real',
                        valor: selecionada.taxaReal === null ? '—' : brl(selecionada.taxaReal),
                        nota:
                          selecionada.taxaReal === null
                            ? undefined
                            : pct(parte(selecionada.taxaReal, selecionada.bruto), 2),
                        tom:
                          selecionada.taxaReal !== null &&
                          Math.abs(selecionada.taxaReal - selecionada.taxaEsperada) > 0.05
                            ? 'erro'
                            : undefined,
                      },
                      {
                        rotulo: 'Líquido real',
                        valor: selecionada.liquidoRecebido === null ? '—' : brl(selecionada.liquidoRecebido),
                        tom: selecionada.liquidoRecebido === null ? 'neutro' : undefined,
                      },
                    ]}
                  />
                </div>
                <LinhaValor
                  rotulo="Diferença encontrada"
                  valor={brl(selecionada.diferenca)}
                  tom={selecionada.diferenca < 0 ? 'erro' : selecionada.diferenca > 0 ? 'ouro' : 'ok'}
                  nota={
                    selecionada.bruto > 0 && selecionada.diferenca !== 0
                      ? `${pct(parte(Math.abs(selecionada.diferenca), selecionada.bruto), 2)} do bruto`
                      : undefined
                  }
                  destaque
                />
              </Pilha>

              <Destaque tom={TOM[selecionada.status]} icone="info" titulo="Provável causa">
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
                >
                  {causaDe(selecionada)}
                </span>
              </Destaque>

              {selecionada.status !== 'conciliada' && selecionada.status !== 'estornada' && (
                <Pilha gap={7}>
                  <Etiqueta>Ação sugerida</Etiqueta>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}
                  >
                    Informe o crédito que caiu de fato — a divergência é recalculada na leitura,
                    nunca digitada.
                  </span>
                  <ConciliarRepasse
                    pedidoId={selecionada.pedidoId}
                    esperado={selecionada.liquidoEsperado}
                  />
                </Pilha>
              )}

              <Pilha gap={0}>
                <Etiqueta>Histórico do pedido</Etiqueta>
                {[
                  ...(selecionada.previstoEm
                    ? [
                        {
                          quando: selecionada.previstoEm,
                          texto: 'Pedido realizado e pagamento confirmado',
                          tom: 'info' as TomUi,
                        },
                      ]
                    : []),
                  selecionada.recebidoEm
                    ? {
                        quando: selecionada.recebidoEm.slice(0, 10),
                        texto: 'Crédito identificado no extrato',
                        tom: 'ok' as TomUi,
                      }
                    : {
                        quando: null,
                        texto: 'Crédito ainda não identificado no extrato',
                        tom: 'atencao' as TomUi,
                      },
                ].map((ev) => (
                  <span
                    key={ev.texto}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '7px 0',
                      borderTop: '1px solid rgba(255,255,255,.05)',
                    }}
                  >
                    <Bolinha cor={TINTA[ev.tom]} tamanho={7} />
                    <span
                      className="font-sans"
                      style={{ flex: 1, fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.6)' }}
                    >
                      {ev.texto}
                    </span>
                    {ev.quando && (
                      <Num tamanho={10} peso={400} tom="neutro">
                        {diaCurtoPt(ev.quando)}
                      </Num>
                    )}
                  </span>
                ))}
              </Pilha>

              <div style={{ display: 'flex', gap: 8 }}>
                {posicao > 0 && (
                  <BotaoLinha
                    href={urlDe(filtradas[posicao - 1].pedidoId, paginaDe(posicao - 1))}
                    icone="seta-esquerda"
                  >
                    Anterior
                  </BotaoLinha>
                )}
                <div style={{ flex: 1 }} />
                {posicao >= 0 && posicao < filtradas.length - 1 && (
                  <BotaoLinha href={urlDe(filtradas[posicao + 1].pedidoId, paginaDe(posicao + 1))} primario>
                    Próximo
                  </BotaoLinha>
                )}
              </div>
            </Painel>
          ) : (
            <Painel titulo="Detalhes da divergência" icone="busca">
              <Vazio icone="busca" texto="Selecione uma venda na tabela para abrir o detalhe." />
            </Painel>
          )
        }
      >
        <Painel
          titulo="Conciliação: pedidos vs. extrato"
          icone="lista"
          nota={
            status === 'todas'
              ? 'todas as vendas do período'
              : status === 'acao'
                ? 'vendas que exigem decisão'
                : ROTULO_STATUS_VENDA[status as StatusVenda]
          }
        >
          <TabelaUi
            colunas={colunas}
            itens={visiveis}
            chaveDe={(v) => v.pedidoId}
            larguraMinima={980}
            selecionadoDe={(v) => v.pedidoId === selecionada?.pedidoId}
            faixaDe={(v) =>
              v.status === 'chargeback' || v.status === 'sem_credito' || v.status === 'valor_divergente'
                ? 'erro'
                : v.status === 'taxa_divergente'
                  ? 'atencao'
                  : null
            }
            vazio={<Vazio icone="busca" texto="Nenhuma venda com estes filtros." />}
            rodape={
              filtradas.length > 0 ? (
                <>
                  <RodapeTabela
                    contagem={`Mostrando ${(pagina - 1) * POR_PAGINA + 1} a ${Math.min(pagina * POR_PAGINA, filtradas.length)} de ${plural(filtradas.length, 'resultado', 'resultados')}`}
                    totais={[
                      { rotulo: 'Bruto', valor: brl(filtradas.reduce((a, v) => a + v.bruto, 0)) },
                      {
                        rotulo: 'Creditado',
                        valor: brl(filtradas.reduce((a, v) => a + (v.liquidoRecebido ?? 0), 0)),
                        tom: 'ok',
                      },
                      {
                        rotulo: 'Diferença',
                        valor: brl(filtradas.reduce((a, v) => a + v.diferenca, 0)),
                        tom: filtradas.reduce((a, v) => a + v.diferenca, 0) < 0 ? 'erro' : 'ouro',
                      },
                    ]}
                  />
                  {totalPaginas > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 5,
                        paddingTop: 10,
                      }}
                    >
                      {pagina > 1 && (
                        <PaginaLink href={urlCom({ pagina: pagina - 1 > 1 ? String(pagina - 1) : undefined })}>
                          ‹
                        </PaginaLink>
                      )}
                      {paginasVisiveis(pagina, totalPaginas).map((p, i) =>
                        p === null ? (
                          <span
                            key={`gap-${i}`}
                            className="font-mono"
                            style={{ fontSize: 11, color: 'rgba(242,237,227,.35)', padding: '0 3px' }}
                          >
                            …
                          </span>
                        ) : (
                          <PaginaLink
                            key={p}
                            href={urlCom({ pagina: p > 1 ? String(p) : undefined })}
                            ativo={p === pagina}
                          >
                            {p}
                          </PaginaLink>
                        ),
                      )}
                      {pagina < totalPaginas && (
                        <PaginaLink href={urlCom({ pagina: String(pagina + 1) })}>›</PaginaLink>
                      )}
                    </div>
                  )}
                </>
              ) : null
            }
          />
        </Painel>
      </ComTrilha>

      <Colunas proporcao="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
        {/* O wrapper em grid estica cada painel até a altura da linha — os
            três cartões da faixa ficam com a MESMA altura, como no mockup. */}
        <div style={{ display: 'grid', alignSelf: 'stretch' }}>
          <Painel titulo="Resumo do período" icone="calculadora">
            <Pilha gap={0}>
              <LinhaValor
                rotulo="Volume bruto"
                valor={brl(c.volumeBruto)}
                nota={plural(c.vendas.length, 'transação', 'transações')}
              />
              <LinhaValor
                rotulo="Valor creditado"
                valor={brl(c.valorCreditado)}
                nota={plural(comCredito, 'crédito', 'créditos')}
                tom="ok"
              />
              <LinhaValor
                rotulo="Diferença total"
                valor={brl(c.diferencaTotal)}
                nota={
                  c.volumeBruto > 0
                    ? `${pct(parte(Math.abs(c.diferencaTotal), c.volumeBruto), 2)} do bruto`
                    : undefined
                }
                tom={c.diferencaTotal < 0 ? 'erro' : c.diferencaTotal > 0 ? 'ouro' : 'ok'}
                destaque
              />
              <LinhaValor
                rotulo="Taxa média real"
                valor={pct(temTarifaReal ? c.taxaMediaReal : c.taxaMediaPrevista, 2)}
                nota={temTarifaReal ? `vs. ${pct(c.taxaMediaPrevista, 2)} prevista` : 'estimada pelo parâmetro'}
              />
            </Pilha>
          </Painel>
        </div>

        <div style={{ display: 'grid', alignSelf: 'stretch' }}>
          <Painel titulo="Principais causas de divergência" icone="alerta" tom="atencao">
            {causas.length > 0 ? (
              <ListaBarras itens={causas} />
            ) : (
              <Vazio icone="check-circulo" texto="Nenhuma divergência aberta no período." />
            )}
          </Painel>
        </div>

        <div style={{ display: 'grid', alignSelf: 'stretch' }}>
          <Painel titulo="Dicas rápidas" icone="info" tom="info">
            <Pilha gap={9}>
              {[
                'Confira sempre a data de crédito no extrato: o repasse segue a agenda do adquirente, não a data do pedido.',
                'Tarifas variam por bandeira, parcelamento e risco — divergência é a diferença entre a tarifa REAL e a prevista.',
                'Crédito de Pix pode cair em até 30 minutos; antes do prazo do cartão a venda fica "Aguardando", não é problema.',
              ].map((t) => (
                <span key={t} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 2,
                      marginTop: 6,
                      flex: 'none',
                      background: 'rgba(127,169,216,.6)',
                    }}
                  />
                  <span
                    className="font-sans"
                    style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.56)', textWrap: 'pretty' }}
                  >
                    {t}
                  </span>
                </span>
              ))}
            </Pilha>
          </Painel>
        </div>
      </Colunas>
    </Pilha>
  )
}

// ── Peças locais da tela ─────────────────────────────────────────────────────

const ENTRADA: CSSProperties = {
  height: 34,
  padding: '0 11px',
  border: '1px solid rgba(255,255,255,.1)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 9,
  color: 'var(--color-corrente)',
  fontSize: 12,
  lineHeight: 1,
  outline: 0,
  colorScheme: 'dark',
}

function CampoFiltro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Etiqueta>{rotulo}</Etiqueta>
      {children}
    </label>
  )
}

/** Ficha da venda selecionada: rótulo → texto (não número, por isso sem Num). */
function LinhaFicha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '6px 0',
        borderTop: '1px solid rgba(255,255,255,.05)',
      }}
    >
      <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.42)', width: 74, flex: 'none' }}>
        {rotulo}
      </span>
      <span
        className={mono ? 'font-mono' : 'font-sans'}
        style={{
          flex: 1,
          fontSize: 11.5,
          color: 'rgba(242,237,227,.78)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
      >
        {valor}
      </span>
    </span>
  )
}

/** Metade do comparativo Pedido × Extrato — colunas estreitas pedem linha compacta. */
function ColunaComparativa({
  titulo,
  linhas,
}: {
  titulo: string
  linhas: { rotulo: string; valor: string; nota?: string; tom?: TomUi }[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      <Etiqueta style={{ paddingBottom: 4 }}>{titulo}</Etiqueta>
      {linhas.map((l) => (
        <span
          key={l.rotulo}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            padding: '5px 0',
            borderTop: '1px solid rgba(255,255,255,.05)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.42)' }}>
            {l.rotulo}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <Num tamanho={11.5} tom={l.tom}>
              {l.valor}
            </Num>
            {l.nota && (
              <Num tamanho={9} peso={400} tom="neutro">
                {`(${l.nota})`}
              </Num>
            )}
          </span>
        </span>
      ))}
    </div>
  )
}

/** Número de página como link — o estado da paginação também mora na URL. */
function PaginaLink({ href, ativo, children }: { href: string; ativo?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono hover:border-ouro/35"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: 26,
        height: 26,
        padding: '0 6px',
        borderRadius: 8,
        fontSize: 11,
        textDecoration: 'none',
        background: ativo ? VELADO.ouro : 'rgba(255,255,255,.02)',
        border: `1px solid ${ativo ? CONTORNO.ouro : 'rgba(255,255,255,.07)'}`,
        color: ativo ? TINTA.ouro : 'rgba(242,237,227,.55)',
      }}
    >
      {children}
    </Link>
  )
}

/**
 * Janela de páginas: primeira, vizinhas da atual e última, com reticências —
 * 40 páginas de links numerados não ajudam ninguém.
 */
function paginasVisiveis(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const nucleo = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total)
  const lista: (number | null)[] = [1]
  if (nucleo.length && nucleo[0] > 2) lista.push(null)
  lista.push(...nucleo)
  if (nucleo.length && nucleo[nucleo.length - 1] < total - 1) lista.push(null)
  lista.push(total)
  return lista
}
