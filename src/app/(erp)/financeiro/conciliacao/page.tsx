import Link from 'next/link'

import { Cartao, CabecalhoCartao, VazioInterno } from '@/components/erp/Cartao'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { carregarConciliacao } from '@/data/financeiro'
import { brl, diaCurtoPt, plural, ROTULO_STATUS_VENDA } from '@/domain'
import type { StatusVenda, VendaConciliada } from '@/domain'

import { ConciliarRepasse, PreverRepasses } from '../Widgets'

/**
 * Conciliação de vendas — venda por venda, o que a plataforma prometeu contra
 * o que ela creditou.
 *
 * A regra que salvou a tela: taxa cobrada CORRETAMENTE é custo, não
 * divergência. A versão antiga comparava bruto com líquido e acusava toda
 * venda no cartão — uma fila de alarme falso que ninguém abria mais. Aqui a
 * divergência é entre a taxa REAL e a ESPERADA, e só ela exige decisão.
 */
export const dynamic = 'force-dynamic'

const TOM: Record<StatusVenda, Tom> = {
  conciliada: 'ok',
  taxa_divergente: 'atencao',
  sem_credito: 'erro',
  valor_divergente: 'erro',
  estornada: 'neutro',
  chargeback: 'erro',
  aguardando: 'info',
}

/** Filas que pedem decisão humana, na ordem em que doem. */
const EXIGEM_DECISAO: StatusVenda[] = ['chargeback', 'sem_credito', 'valor_divergente', 'taxa_divergente']

export default async function Conciliacao({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const c = await carregarConciliacao()

  if (c.semBanco) {
    return (
      <EstadoVazio
        titulo="Conciliação indisponível"
        instrucao="O Supabase precisa estar configurado para comparar vendas com repasses."
      />
    )
  }

  if (c.vendas.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <EstadoVazio
          titulo="Nenhuma venda para conciliar"
          instrucao="Importe pedidos e gere a previsão de repasse para o ERP saber o que cada plataforma deve creditar."
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PreverRepasses />
        </div>
      </div>
    )
  }

  const filtro = (status ?? '') as StatusVenda | ''
  const visiveis = filtro ? c.vendas.filter((v) => v.status === filtro) : c.vendas

  const naFila = EXIGEM_DECISAO.reduce((a, s) => a + c.totais[s].qtd, 0)
  const taxaEfetiva = c.taxaMediaReal > 0 ? c.taxaMediaReal : c.taxaMediaPrevista

  const kpis: Kpi[] = [
    {
      label: 'Volume bruto',
      valor: brl(c.volumeBruto),
      hint: plural(c.vendas.length, 'venda no período', 'vendas no período'),
    },
    {
      label: 'Já creditado',
      valor: brl(c.valorCreditado),
      hint: `${plural(c.vendas.filter((v) => v.liquidoRecebido !== null).length, 'venda liquidada', 'vendas liquidadas')} pelas plataformas`,
      tom: 'ok',
    },
    {
      label: 'Taxa efetiva',
      valor: `${taxaEfetiva.toFixed(2).replace('.', ',')}%`,
      hint:
        c.taxaMediaReal > 0
          ? `Cobrada de fato · previsto ${c.taxaMediaPrevista.toFixed(2).replace('.', ',')}%`
          : 'Estimada pelo parâmetro — nenhum repasse com tarifa real ainda',
      tom: c.taxaMediaReal > c.taxaMediaPrevista + 0.05 ? 'atencao' : 'neutro',
    },
    {
      label: 'Diferença acumulada',
      valor: brl(c.diferencaTotal),
      hint: c.diferencaTotal < 0 ? 'A menos do que era esperado' : 'A favor da loja',
      tom: Math.abs(c.diferencaTotal) > 1 ? (c.diferencaTotal < 0 ? 'erro' : 'ouro') : 'ok',
    },
    {
      label: 'Exigem decisão',
      valor: String(naFila).padStart(2, '0'),
      hint: naFila
        ? 'Chargeback, venda sem crédito ou divergência de valor'
        : 'Nenhuma venda parada esperando gente',
      tom: naFila ? 'erro' : 'ok',
    },
    {
      label: 'Aguardando prazo',
      valor: String(c.totais.aguardando.qtd).padStart(2, '0'),
      hint: 'Dentro do prazo de repasse — não é problema ainda',
      tom: 'info',
    },
  ]

  const colunas: Coluna<VendaConciliada>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: 'minmax(0,1fr)',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <Link
            href={`/pedidos?pedido=${encodeURIComponent(v.pedidoId)}`}
            className="font-sans hover:text-ouro"
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: 'var(--color-corrente)',
              textDecoration: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {v.pedidoId}
          </Link>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              color: 'var(--color-terciario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {`${v.cliente} · ${v.canal}${v.meio !== '—' ? ` · ${v.meio}` : ''}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'bruto',
      titulo: 'Bruto',
      largura: '104px',
      alinhamento: 'right',
      render: (v) => <Valor tamanho={12}>{brl(v.bruto)}</Valor>,
    },
    {
      chave: 'taxa',
      titulo: 'Taxa',
      largura: '116px',
      alinhamento: 'right',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={11.5} peso={400} tom={v.taxaReal === null ? undefined : 'erro'}>
            {brl(v.taxaReal ?? v.taxaEsperada)}
          </Valor>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
            {v.taxaReal === null ? 'previsto' : `previsto ${brl(v.taxaEsperada)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'liquido',
      titulo: 'Líquido',
      largura: '124px',
      alinhamento: 'right',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={12} tom={v.liquidoRecebido === null ? 'neutro' : 'ok'}>
            {v.liquidoRecebido === null ? '—' : brl(v.liquidoRecebido)}
          </Valor>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
            {`esperado ${brl(v.liquidoEsperado)}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      largura: '100px',
      alinhamento: 'right',
      render: (v) =>
        v.diferenca === 0 ? (
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
            —
          </span>
        ) : (
          <Valor tamanho={12} tom={v.diferenca < 0 ? 'erro' : 'ouro'}>
            {`${v.diferenca > 0 ? '+' : '−'} ${brl(Math.abs(v.diferenca))}`}
          </Valor>
        ),
    },
    {
      chave: 'datas',
      titulo: 'Datas',
      largura: '104px',
      render: (v) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
            {v.previstoEm ? diaCurtoPt(v.previstoEm) : '—'}
          </span>
          <span className="font-sans" style={{ fontSize: 9.5, color: 'var(--color-terciario)' }}>
            {v.recebidoEm ? `creditado ${diaCurtoPt(v.recebidoEm.slice(0, 10))}` : 'sem crédito'}
          </span>
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '124px',
      render: (v) => <Badge tom={TOM[v.status]}>{ROTULO_STATUS_VENDA[v.status]}</Badge>,
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '128px',
      alinhamento: 'right',
      render: (v) =>
        v.status === 'conciliada' || v.status === 'estornada' ? (
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {v.status === 'conciliada' ? 'sem pendência' : 'estornada'}
          </span>
        ) : (
          <ConciliarRepasse pedidoId={v.pedidoId} esperado={v.liquidoEsperado} />
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <Cartao>
        <CabecalhoCartao
          titulo="Filas por status"
          nota="Clique para filtrar a tabela abaixo"
          acao={<PreverRepasses />}
        />
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <Aba href="/financeiro/conciliacao" ativo={!filtro} rotulo="Todas" qtd={c.vendas.length} tom="neutro" />
          {(Object.keys(c.totais) as StatusVenda[])
            .filter((s) => c.totais[s].qtd > 0)
            .sort((a, b) => {
              const peso = (s: StatusVenda) => (EXIGEM_DECISAO.includes(s) ? 0 : 1)
              return peso(a) - peso(b) || c.totais[b].qtd - c.totais[a].qtd
            })
            .map((s) => (
              <Aba
                key={s}
                href={`/financeiro/conciliacao?status=${s}`}
                ativo={filtro === s}
                rotulo={ROTULO_STATUS_VENDA[s]}
                qtd={c.totais[s].qtd}
                tom={TOM[s]}
              />
            ))}
        </div>
      </Cartao>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(v) => v.pedidoId}
        bandeiraDe={(v) =>
          v.status === 'chargeback' || v.status === 'sem_credito' || v.status === 'valor_divergente'
            ? 'erro'
            : v.status === 'taxa_divergente'
              ? 'atencao'
              : null
        }
        vazio={<VazioInterno texto="Nenhuma venda neste status." />}
        rodape={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
              padding: '12px 18px',
              borderTop: '1px solid var(--color-borda)',
              background: 'var(--color-cabecalho)',
            }}
          >
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
              {plural(visiveis.length, 'venda listada', 'vendas listadas')}
            </span>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              Bruto
            </span>
            <Valor tamanho={12.5}>{brl(visiveis.reduce((a, v) => a + v.bruto, 0))}</Valor>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              Diferença
            </span>
            <Valor
              tamanho={12.5}
              tom={visiveis.reduce((a, v) => a + v.diferenca, 0) < 0 ? 'erro' : 'ouro'}
            >
              {brl(visiveis.reduce((a, v) => a + v.diferenca, 0))}
            </Valor>
          </div>
        }
      />
    </div>
  )
}

function Aba({
  href,
  rotulo,
  qtd,
  ativo,
  tom,
}: {
  href: string
  rotulo: string
  qtd: number
  ativo: boolean
  tom: Tom
}) {
  return (
    <Link
      href={href}
      className="font-sans hover:border-ouro/40"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        padding: '0 12px',
        border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'var(--color-borda-sutil)'}`,
        background: ativo ? 'rgba(239,209,140,.07)' : 'transparent',
        borderRadius: 8,
        textDecoration: 'none',
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: COR[tom], flex: 'none' }}
        aria-hidden
      />
      <span
        style={{ fontSize: 11, fontWeight: 600, color: ativo ? COR.ouro : 'var(--color-secundario)' }}
      >
        {rotulo}
      </span>
      <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
        {qtd}
      </span>
    </Link>
  )
}
