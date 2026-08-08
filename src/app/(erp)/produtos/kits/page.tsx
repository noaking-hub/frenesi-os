import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { JULHO } from '@/data/fixtures'
import { avaliarKit, brl, num, pct, pisoMargem, plural, resumirKits } from '@/domain'
import type { KitAvaliado } from '@/domain'

export default async function Kits() {
  const repo = repositorio()
  const [kits, bases, parametros] = await Promise.all([
    repo.kits(),
    repo.perfumesBase(),
    repo.parametros(),
  ])

  // Margem pelos mesmos parâmetros das variantes; disponibilidade derivada
  // do estoque das bases que compõem cada kit.
  const avaliados = kits.map((k) => avaliarKit(k, bases, parametros))
  const r = resumirKits(avaliados)

  const kpis: Kpi[] = [
    {
      label: 'Kits ativos',
      valor: String(r.ativos),
      hint: r.bloqueados
        ? `${plural(r.bloqueados, 'com base esgotada', 'com base esgotada')}`
        : 'Todos com bases disponíveis',
      tom: r.bloqueados ? 'erro' : 'ok',
    },
    { label: 'Vendas em 30 dias', valor: String(r.vendas30), hint: 'Unidades de kit' },
    {
      label: 'Receita com kits',
      valor: brl(r.receita30),
      hint: `${num(Math.round((r.receita30 / JULHO.receitaBruta) * 1000) / 10)}% da receita de julho`,
      tom: 'ouro',
    },
    {
      label: 'Ticket médio do kit',
      valor: brl(r.ticketMedio),
      hint: 'Ticket médio geral dos pedidos: R$ 412,00',
      tom: 'ok',
    },
    {
      label: 'Margem média',
      valor: pct(r.margemMedia),
      hint:
        r.margemMedia >= parametros.margemAlvo - 0.5
          ? 'Acima da margem alvo'
          : 'Abaixo da margem alvo',
      tom: r.margemMedia >= parametros.margemAlvo - 0.5 ? 'ok' : 'atencao',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Kits e combos</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Montar novo kit</BotaoOuro>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {avaliados.map((k) => (
          <CartaoKit key={k.kit.id} avaliado={k} margemAlvo={parametros.margemAlvo} piso={pisoMargem(parametros)} />
        ))}
      </div>
    </div>
  )
}

function CartaoKit({
  avaliado: k,
  margemAlvo,
  piso,
}: {
  avaliado: KitAvaliado
  margemAlvo: number
  piso: number
}) {
  const tomMargem: Tom =
    k.margem >= margemAlvo - 0.5 ? 'ok' : k.margem >= piso ? 'atencao' : 'erro'

  return (
    <div
      className="hover:border-ouro/25"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '17px 18px',
        border: '1px solid var(--color-borda)',
        borderTop: `2px solid ${k.disponivel ? COR[tomMargem] : COR.erro}`,
        background: 'linear-gradient(170deg,#16151A,#101011)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          className="font-display"
          style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, color: 'var(--color-tinta)', flex: 1, textWrap: 'pretty' }}
        >
          {k.kit.nome}
        </span>
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 9,
            lineHeight: 1,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'rgba(239,209,140,.65)',
            border: '1px solid rgba(239,209,140,.28)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 7px',
            flex: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {k.kit.tag}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          padding: '11px 0',
          borderTop: '1px solid rgba(255,255,255,.05)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}
      >
        {k.kit.itens.map((i) => (
          <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                flex: 'none',
                background: k.basesEsgotadas.some((nome) => i.label.startsWith(nome))
                  ? COR.erro
                  : 'rgba(239,209,140,.45)',
              }}
            />
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'rgba(242,237,227,.65)' }}
            >
              {i.label}
            </span>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Rotulo>Preço</Rotulo>
          <Valor tamanho={17} tom="ouro">
            {brl(k.kit.preco)}
          </Valor>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <Rotulo>Margem</Rotulo>
          <Valor tamanho={15} tom={tomMargem}>
            {pct(k.margem)}
          </Valor>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
        >
          {`${k.kit.vendas30} un em 30 dias`}
        </span>
        <Valor tamanho={10.5} tom="var(--color-secundario)">
          {brl(k.receita30)}
        </Valor>
      </div>

      <span
        className="font-sans"
        style={{
          fontSize: 10,
          lineHeight: 1.4,
          color: k.disponivel ? 'var(--color-terciario)' : COR.erro,
          textWrap: 'pretty',
        }}
      >
        {k.disponivel
          ? 'Todas as bases disponíveis'
          : `${k.basesEsgotadas.join(', ')} esgotado · kit não pode ser montado`}
      </span>
    </div>
  )
}
