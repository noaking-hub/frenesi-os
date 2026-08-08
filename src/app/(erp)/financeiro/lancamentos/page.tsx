import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, FaixaAlerta, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import {
  brl,
  lancamentoPendente,
  plural,
  resumirLancamentos,
  saldoConsolidado,
} from '@/domain'
import type { Lancamento, StatusLancamento } from '@/domain'

const TOM_STATUS: Record<StatusLancamento, Tom> = {
  Pago: 'ok',
  Recebido: 'ok',
  'A pagar': 'atencao',
  Vencido: 'erro',
  Previsto: 'info',
}

export default async function Lancamentos() {
  const repo = repositorio()
  const [lancamentos, contas] = await Promise.all([repo.lancamentos(), repo.contas()])

  const r = resumirLancamentos(lancamentos)
  const saldo = saldoConsolidado(contas)
  const projetado = saldo + r.aReceber - r.aPagar - r.vencido
  const vencidos = lancamentos.filter((l) => l.status === 'Vencido')

  const kpis: Kpi[] = [
    {
      label: 'A pagar até 7 dias',
      valor: brl(r.aPagar),
      hint: plural(r.aPagarQtd, 'lançamento', 'lançamentos'),
      tom: 'atencao',
    },
    {
      label: 'Vencido',
      valor: brl(r.vencido),
      hint: r.vencidoQtd
        ? `${plural(r.vencidoQtd, 'em atraso', 'em atraso')} · juros correndo`
        : 'Nada em atraso',
      tom: r.vencido ? 'erro' : 'ok',
    },
    {
      label: 'A receber previsto',
      valor: brl(r.aReceber),
      hint: 'Repasses ainda não creditados',
      tom: 'info',
    },
    {
      label: 'Saldo hoje',
      valor: brl(saldo),
      hint: contas.map((c) => c.nome).join(' + '),
    },
    {
      label: 'Saldo projetado',
      valor: brl(projetado),
      hint: 'Depois de pagar e receber o previsto',
      tom: projetado > 0 ? 'ok' : 'erro',
    },
    {
      label: 'Recorrentes no mês',
      valor: brl(r.recorrentes),
      hint: plural(r.recorrentesQtd, 'despesa fixa', 'despesas fixas'),
      tom: 'neutro',
    },
  ]

  const colunas: Coluna<Lancamento>[] = [
    {
      chave: 'data',
      titulo: 'Data',
      largura: '64px',
      render: (l) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
          {l.data}
        </Valor>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Descrição',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
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
            {l.recorrente && (
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 9,
                  lineHeight: 1,
                  letterSpacing: '.07em',
                  textTransform: 'uppercase',
                  color: 'rgba(143,169,196,.85)',
                  border: '1px solid rgba(143,169,196,.35)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '3px 7px',
                  flex: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Recorrente
              </span>
            )}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.35)' }}
          >
            {`origem: ${l.origem}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      largura: '124px',
      render: (l) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.68)' }}
        >
          {l.categoria}
        </span>
      ),
    },
    {
      chave: 'conta',
      titulo: 'Conta',
      largura: '108px',
      render: (l) => (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.3, color: 'var(--color-secundario)' }}
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
      render: (l) => (
        <Valor tamanho={12.5} tom={l.tipo === 'entrada' ? 'ok' : 'var(--color-corrente)'}>
          {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}`}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '120px',
      render: (l) => <Badge tom={TOM_STATUS[l.status]}>{l.status}</Badge>,
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '104px',
      render: (l) =>
        lancamentoPendente(l) ? (
          <button
            type="button"
            aria-label={`Dar baixa em ${l.descricao}`}
            className="font-sans hover:bg-[rgba(239,209,140,.16)]"
            style={{
              height: 27,
              padding: '0 11px',
              border: '1px solid rgba(239,209,140,.28)',
              background: 'rgba(239,209,140,.07)',
              color: 'var(--color-ouro)',
              fontWeight: 600,
              fontSize: 10.5,
              borderRadius: 7,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Dar baixa
          </button>
        ) : null,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {vencidos.length > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={
            vencidos.length === 1
              ? `${vencidos[0].descricao} venceu e continua em aberto · ${brl(vencidos[0].valor)}`
              : `${vencidos.length} lançamentos vencidos somam ${brl(r.vencido)}`
          }
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Lançamentos de agosto</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Novo lançamento</BotaoOuro>
      </div>

      <Tabela
        colunas={colunas}
        itens={lancamentos}
        chaveDe={(l) => l.id}
        bandeiraDe={(l) =>
          l.status === 'Vencido' ? 'erro' : l.status === 'A pagar' ? 'atencao' : null
        }
      />
    </div>
  )
}
