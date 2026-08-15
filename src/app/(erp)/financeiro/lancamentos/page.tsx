import { Cartao, CabecalhoCartao, VazioInterno } from '@/components/erp/Cartao'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, Losango, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
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
import { EstadoVazio } from '@/components/erp/primitivos'

import { AcoesGerenciais, NovoCompromisso } from '../Compromissos'
import { BarraDeFiltros } from './Filtros'

/**
 * Lançamentos — contas a pagar e a receber no mesmo lugar.
 *
 * A tela não guarda "status": ele é derivado de `situacaoDe` a cada leitura.
 * Uma coluna gravada faria a conta vencer à meia-noite sem ninguém tocar nela
 * e continuar mostrando "agendado" no dia seguinte ao vencimento.
 *
 * Os filtros vivem na URL, não em estado de cliente: assim o alerta da Visão
 * Financeira consegue abrir exatamente a fila que ele acusou
 * (`?situacao=vencido`), e o operador consegue mandar o link para alguém.
 */
export const dynamic = 'force-dynamic'

const TOM_SITUACAO: Record<SituacaoLancamento, Tom> = {
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

export default async function Lancamentos({
  searchParams,
}: {
  searchParams: Promise<Busca>
}) {
  const filtro = await searchParams
  const p = await carregarLancamentos()

  if (p.semBanco) {
    return (
      <EstadoVazio
        titulo="Lançamentos indisponíveis"
        instrucao="O Supabase precisa estar configurado para ler contas a pagar e a receber."
      />
    )
  }

  const comSituacao = p.lancamentos.map((l) => ({ l, situacao: situacaoDe(l, p.hoje) }))

  const busca = (filtro.q ?? '').trim().toLowerCase()
  const visiveis = comSituacao
    .filter(({ l, situacao }) => {
      if (filtro.situacao && situacao !== filtro.situacao) return false
      // Sem filtro explícito, cancelado sai da lista: ele não é trabalho
      // pendente nem histórico de caixa, é um registro que deixou de valer.
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
      // Vencido primeiro, depois por vencimento: a fila da tela é a ordem em
      // que o dinheiro precisa de decisão.
      const peso = (s: SituacaoLancamento) => (s === 'vencido' ? 0 : s === 'liquidado' ? 2 : 1)
      const d = peso(a.situacao) - peso(b.situacao)
      if (d !== 0) return d
      return (a.l.venceEm ?? '9999').localeCompare(b.l.venceEm ?? '9999')
    })

  const somaAberto = (ls: { l: LancamentoGerencial }[]) =>
    ls.reduce((a, x) => a + saldoAberto(x.l), 0)
  const filtradosSaida = visiveis.filter((v) => v.l.tipo === 'saida')
  const filtradosEntrada = visiveis.filter((v) => v.l.tipo === 'entrada')

  const kpis: Kpi[] = [
    {
      label: 'Vence hoje',
      valor: brl(p.aPagarHoje.valor),
      hint: p.aPagarHoje.qtd
        ? plural(p.aPagarHoje.qtd, 'conta a pagar hoje', 'contas a pagar hoje')
        : 'Nada vence hoje',
      tom: p.aPagarHoje.qtd ? 'atencao' : 'ok',
    },
    {
      label: 'Vencido',
      valor: brl(p.vencidos.valor),
      hint: p.vencidos.qtd
        ? `${plural(p.vencidos.qtd, 'obrigação em atraso', 'obrigações em atraso')} · multa e juros correndo`
        : 'Nada em atraso',
      tom: p.vencidos.qtd ? 'erro' : 'ok',
    },
    {
      label: 'Recebe hoje',
      valor: brl(p.aReceberHoje.valor),
      hint: p.aReceberHoje.qtd
        ? plural(p.aReceberHoje.qtd, 'recebimento previsto', 'recebimentos previstos')
        : 'Nenhum recebimento hoje',
      tom: 'ok',
    },
    {
      label: 'Recorrentes',
      valor: brl(p.recorrentes.valor),
      hint: plural(p.recorrentes.qtd, 'despesa fixa cadastrada', 'despesas fixas cadastradas'),
      tom: 'neutro',
    },
    {
      label: 'Aguardando conferência',
      valor: brl(p.aprovacoes.valor),
      hint: p.aprovacoes.qtd
        ? `${plural(p.aprovacoes.qtd, 'lançamento veio', 'lançamentos vieram')} de integração e ninguém conferiu`
        : 'Tudo conferido',
      tom: p.aprovacoes.qtd ? 'atencao' : 'ok',
    },
    {
      label: 'Saldo projetado',
      valor: brl(p.saldoProjetado),
      hint: 'Caixa de hoje + tudo a receber − tudo a pagar',
      tom: p.saldoProjetado < 0 ? 'erro' : 'ouro',
    },
  ]

  const colunas: Coluna<{ l: LancamentoGerencial; situacao: SituacaoLancamento }>[] = [
    {
      chave: 'vencimento',
      titulo: 'Vencimento',
      largura: '96px',
      render: ({ l, situacao }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Valor tamanho={11.5} peso={500} tom={situacao === 'vencido' ? 'erro' : undefined}>
            {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
          </Valor>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
            {`comp. ${l.competencia.slice(0, 7)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      largura: 'minmax(0,1fr)',
      render: ({ l }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1.25,
                color: 'var(--color-corrente)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {l.descricao}
            </span>
            {l.parcelas && l.parcela && <Etiqueta>{`${l.parcela}/${l.parcelas}`}</Etiqueta>}
            {l.recorrente && <Etiqueta>{l.recorrencia ?? 'Recorrente'}</Etiqueta>}
            {l.transferenciaId && <Etiqueta>Transferência</Etiqueta>}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              lineHeight: 1.25,
              color: 'var(--color-terciario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[l.favorecido, l.documento && `doc. ${l.documento}`, `via ${l.origem}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      largura: '150px',
      render: ({ l }) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontSize: 11,
              color: 'rgba(242,237,227,.7)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.categoria}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 9.5,
              color: l.natureza ? 'var(--color-terciario)' : COR.atencao,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.natureza ? ROTULO_NATUREZA[l.natureza] : 'sem natureza gerencial'}
          </span>
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
            color: 'var(--color-secundario)',
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
      largura: '152px',
      alinhamento: 'right',
      render: ({ l }) => {
        const falta = saldoAberto(l)
        const encargos = l.multa + l.juros
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            <Valor tamanho={12.5} tom={l.tipo === 'entrada' ? 'ok' : 'var(--color-corrente)'}>
              {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}`}
            </Valor>
            {/* Só quando há resto: "faltam R$ 0,00" em toda linha quitada é
                ruído em cima da informação. */}
            {l.recebido > 0 && falta > 0 && (
              <span className="font-mono" style={{ fontSize: 9.5, color: COR.ouro }}>
                {`faltam ${brl(falta)}`}
              </span>
            )}
            {encargos > 0 && (
              <span className="font-mono" style={{ fontSize: 9.5, color: COR.erro }}>
                {`+ ${brl(encargos)} de encargos`}
              </span>
            )}
            {l.desconto > 0 && (
              <span className="font-mono" style={{ fontSize: 9.5, color: COR.ok }}>
                {`− ${brl(l.desconto)} de desconto`}
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '104px',
      render: ({ situacao }) => (
        <Badge tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO_LANCAMENTO[situacao]}</Badge>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '132px',
      alinhamento: 'right',
      render: ({ l, situacao }) => <AcoesGerenciais lancamento={l} situacao={situacao} />,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <BarraDeFiltros
        categorias={p.categorias.map((c) => ({ id: c.id, nome: c.nome }))}
        contas={p.contas.map((c) => ({ id: c.id, nome: c.nome }))}
        centros={p.centrosCusto}
        acao={<NovoCompromisso contas={p.contas} categorias={p.categorias} centros={p.centrosCusto} />}
      />

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={({ l }) => l.id}
        bandeiraDe={({ situacao }) =>
          situacao === 'vencido' ? 'erro' : situacao === 'parcial' ? 'ouro' : null
        }
        vazio={
          <VazioInterno
            texto={
              comSituacao.length === 0
                ? 'Nenhum lançamento cadastrado ainda.'
                : 'Nenhum lançamento atende a este filtro.'
            }
          />
        }
        rodape={
          visiveis.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                flexWrap: 'wrap',
                padding: '12px 18px',
                borderTop: '1px solid var(--color-borda)',
                background: 'var(--color-cabecalho)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Losango tom="neutro" />
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
                  {plural(visiveis.length, 'lançamento', 'lançamentos')}
                </span>
              </span>
              <div style={{ flex: 1 }} />
              <Total rotulo="A receber em aberto" valor={somaAberto(filtradosEntrada)} tom="ok" />
              <Total rotulo="A pagar em aberto" valor={somaAberto(filtradosSaida)} tom="erro" />
              <Total
                rotulo="Resultado do filtro"
                valor={somaAberto(filtradosEntrada) - somaAberto(filtradosSaida)}
                tom="ouro"
              />
            </div>
          ) : null
        }
      />

      {p.aprovacoes.qtd > 0 && (
        <Cartao>
          <CabecalhoCartao
            titulo="Vindo das integrações"
            nota="Lançamentos criados por Shopify, Mercado Pago ou extrato que ninguém conferiu"
          />
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-secundario)', textWrap: 'pretty' }}
          >
            {`${plural(p.aprovacoes.qtd, 'lançamento automático somando', 'lançamentos automáticos somando')} ${brl(p.aprovacoes.valor)} ainda não tiveram baixa. Eles entram na projeção de caixa como previsão — conferir é o que os transforma em fato.`}
          </span>
        </Cartao>
      )}
    </div>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 9,
        lineHeight: 1,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: 'rgba(143,169,196,.85)',
        border: '1px solid rgba(143,169,196,.32)',
        borderRadius: 'var(--radius-pill)',
        padding: '3px 7px',
        flex: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Total({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: Tom }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
      <span
        className="font-sans"
        style={{
          fontWeight: 600,
          fontSize: 9,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--color-terciario)',
        }}
      >
        {rotulo}
      </span>
      <Valor tamanho={13} tom={valor < 0 ? 'erro' : tom}>
        {brl(valor)}
      </Valor>
    </span>
  )
}
