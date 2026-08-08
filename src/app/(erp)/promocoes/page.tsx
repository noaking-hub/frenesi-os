import Link from 'next/link'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, BotaoSecundario, FaixaAlerta, Ponto, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { brl, num, pct, pisoMargem, resumirCupons } from '@/domain'
import type { CupomPromo, EstadoPlataforma } from '@/domain'

const TOM_PLATAFORMA: Record<EstadoPlataforma, Tom> = {
  Ativo: 'ok',
  Pendente: 'atencao',
  Divergente: 'erro',
  Encerrado: 'neutro',
}

const TOM_STATUS: Record<CupomPromo['status'], Tom> = {
  Ativo: 'ok',
  Revisar: 'atencao',
  Encerrado: 'neutro',
}

export default async function Cupons() {
  const repo = repositorio()
  const [cupons, parametros] = await Promise.all([repo.cupons(), repo.parametros()])
  const r = resumirCupons(cupons, parametros)
  const piso = pisoMargem(parametros)

  const kpis: Kpi[] = [
    {
      label: 'Cupons vigentes',
      valor: String(r.vigentes.length),
      hint: `${r.semLimite} sem limite nem prazo`,
    },
    {
      label: 'Receita com cupom',
      valor: brl(r.receita),
      hint: `No mês · ${r.usos} pedidos`,
      tom: 'ouro',
    },
    {
      label: 'Desconto concedido',
      valor: brl(r.desconto),
      hint: `${num(Math.round((r.desconto / r.receita) * 1000) / 10)}% da receita promocional`,
      tom: 'atencao',
    },
    {
      label: 'Margem média com cupom',
      valor: pct(r.margemMedia),
      hint: `Ponderada por receita · alvo é ${num(parametros.margemAlvo)}%`,
      tom: r.margemMedia >= parametros.margemAlvo - 0.5 ? 'ok' : 'erro',
    },
    {
      label: 'Abaixo do piso',
      valor: String(r.abaixoPiso),
      hint: 'Cupons que corroem a margem',
      tom: r.abaixoPiso ? 'erro' : 'ok',
    },
    {
      label: 'Fora de sincronia',
      valor: String(r.dessincronizados.length),
      hint: r.dessincronizados.length ? 'Ativos em uma plataforma só' : 'Shopify e Yampi iguais',
      tom: r.dessincronizados.length ? 'erro' : 'ok',
    },
  ]

  const colunas: Coluna<CupomPromo>[] = [
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '116px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-ouro)' }}>
            {c.codigo}
          </span>
          <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
            {c.validade}
          </span>
        </span>
      ),
    },
    {
      chave: 'regra',
      titulo: 'Regra',
      largura: 'minmax(0,1fr)',
      render: (c) => {
        const alerta =
          c.margem < piso
            ? `Crítico · ${num(Math.round((parametros.margemAlvo - c.margem) * 10) / 10)} p.p. abaixo do alvo`
            : c.margem < parametros.margemAlvo - 0.5
              ? `${num(Math.round((parametros.margemAlvo - c.margem) * 10) / 10)} p.p. abaixo do alvo${c.limite === 0 ? ' · sem limite nem prazo' : ''}`
              : c.limite === 0
                ? 'Sem limite de uso nem prazo'
                : 'Dentro do esperado'
        const tomAlerta =
          c.margem < piso ? COR.erro : c.margem < parametros.margemAlvo - 0.5 || c.limite === 0 ? COR.atencao : 'rgba(242,237,227,.4)'
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}>
              {c.tipo}
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {c.regra}
            </span>
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.35, color: tomAlerta, textWrap: 'pretty' }}>
              {alerta}
            </span>
          </span>
        )
      },
    },
    {
      chave: 'usos',
      titulo: 'Usos',
      largura: '132px',
      render: (c) => {
        const pctUsos = c.limite ? Math.min(100, Math.round((c.usos / c.limite) * 100)) : null
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
              {c.limite ? `${c.usos} / ${c.limite}` : `${c.usos} usos`}
            </span>
            <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  width: `${pctUsos ?? 0}%`,
                  background: pctUsos !== null && pctUsos > 80 ? COR.atencao : 'rgba(239,209,140,.55)',
                  borderRadius: 2,
                }}
              />
            </span>
          </span>
        )
      },
    },
    {
      chave: 'receita',
      titulo: 'Receita',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => <Valor tamanho={12}>{brl(c.receita)}</Valor>,
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: '78px',
      alinhamento: 'right',
      render: (c) => (
        <Valor
          tamanho={12.5}
          tom={c.margem >= parametros.margemAlvo ? 'ok' : c.margem >= piso ? 'atencao' : 'erro'}
        >
          {pct(c.margem)}
        </Valor>
      ),
    },
    {
      chave: 'sync',
      titulo: 'Shopify · Yampi',
      largura: '156px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          {(
            [
              ['Shopify', c.shopify],
              ['Yampi', c.yampi],
            ] as const
          ).map(([plataforma, estado]) => (
            <span key={plataforma} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Ponto tom={TOM_PLATAFORMA[estado]} />
              <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.25, color: 'rgba(242,237,227,.5)', width: 48, flex: 'none' }}>
                {plataforma}
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 500,
                  fontSize: 10.5,
                  lineHeight: 1.25,
                  color: estado === 'Encerrado' ? 'rgba(242,237,227,.45)' : COR[TOM_PLATAFORMA[estado]],
                  whiteSpace: 'nowrap',
                }}
              >
                {estado}
              </span>
            </span>
          ))}
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '96px',
      render: (c) => <Badge tom={TOM_STATUS[c.status]}>{c.status}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Cupons e campanhas</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Publicados na Shopify e na Yampi
        </span>
        <div style={{ flex: 1 }} />
        <Link
          href="/configuracoes/precificacao"
          className="font-sans hover:brightness-110"
          style={{ fontWeight: 600, fontSize: 10.5, lineHeight: 1, color: 'var(--color-ouro)', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          {`Margem alvo: ${num(parametros.margemAlvo)}% →`}
        </Link>
        <BotaoOuro altura={34}>+ Novo cupom nas duas plataformas</BotaoOuro>
      </div>

      {r.dessincronizados.length > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={
            r.dessincronizados.length === 1
              ? `${r.dessincronizados[0].codigo} está ${r.dessincronizados[0].shopify.toLowerCase()} na Shopify e ${r.dessincronizados[0].yampi.toLowerCase()} na Yampi. Como o checkout é da Yampi, o cliente não consegue aplicar o cupom.`
              : `${r.dessincronizados.length} cupons estão diferentes entre Shopify e Yampi. Como o checkout é da Yampi, o cliente não consegue aplicar o cupom.`
          }
          acao={<BotaoSecundario altura={32}>Sincronizar agora</BotaoSecundario>}
        />
      )}

      <Tabela
        colunas={colunas}
        itens={cupons}
        chaveDe={(c) => c.codigo}
        bandeiraDe={(c) =>
          c.status === 'Encerrado' ? null : c.margem < piso ? 'erro' : c.margem < parametros.margemAlvo - 0.5 ? 'atencao' : null
        }
      />
    </div>
  )
}
