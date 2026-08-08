import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { FaixaAlerta, Rotulo, Valor } from '@/components/erp/primitivos'
import { BORDA, COR, FUNDO_CHIP, type Tom } from '@/components/erp/tokens'
import { carregarSincronia } from '@/data/consultas'
import { shopifyConfigurada, ultimaSincronizacao } from '@/data/shopify'
import { TETO_SHOPIFY, pad2, plural, volume } from '@/domain'
import type { AcaoSync, BaseSync } from '@/domain'

import { ImportarShopify } from './ImportarShopify'

const TOM_ACAO: Record<AcaoSync, Tom> = {
  esgotar: 'erro',
  reduzir: 'atencao',
  repor: 'info',
  ok: 'ok',
}

export default async function SincroniaShopify() {
  const [sync, ultima] = await Promise.all([carregarSincronia(), ultimaSincronizacao('shopify')])
  const foraDeSincronia = sync.esgotar + sync.reduzir + sync.repor

  const kpis: Kpi[] = [
    {
      label: 'Variantes a esgotar',
      valor: pad2(sync.esgotar),
      hint: 'Vendáveis na Shopify sem volume para fracionar',
      tom: sync.esgotar ? 'erro' : 'ok',
    },
    {
      label: 'Variantes a reduzir',
      valor: pad2(sync.reduzir),
      hint: 'Publicado acima do que o estoque permite',
      tom: sync.reduzir ? 'atencao' : 'ok',
    },
    {
      label: 'Unidades sobrevendíveis',
      valor: String(sync.excesso),
      hint: 'Pedidos que você não conseguiria atender',
      tom: sync.excesso ? 'erro' : 'ok',
    },
    {
      label: 'Variantes a repor',
      valor: pad2(sync.repor),
      hint: sync.repor
        ? `Abaixo do teto de ${TETO_SHOPIFY} mesmo com volume sobrando`
        : 'Nenhuma variante abaixo do teto',
      tom: sync.repor ? 'info' : 'ok',
    },
    {
      label: 'Em dia',
      valor: `${sync.emDia} de ${sync.total}`,
      hint: `${sync.noTeto} no teto de ${TETO_SHOPIFY} · sincronia a cada venda e a cada 15 min`,
      tom: 'ok',
    },
  ]

  // O exemplo é lido do estado real. "Reduzir" é o caso que melhor ilustra a
  // conversão ml → unidades, então tem prioridade; se não houver, cai para a
  // base com mais variantes divergentes de qualquer tipo.
  const comReducao = sync.bases.filter((b) => b.variantes.some((v) => v.acao === 'reduzir'))
  const exemplo = (comReducao.length ? comReducao : sync.bases.filter((b) => b.pendentes))
    .slice()
    .sort((a, b) => b.pendentes - a.pendentes)[0]
  const varExemplo = exemplo?.variantes.filter((v) => v.acao !== 'ok').slice(0, 2) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ImportarShopify configurada={shopifyConfigurada()} ultima={ultima} />

      <FaixaKpis kpis={kpis} />

      {sync.excesso > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={`${sync.excesso} unidades continuam vendáveis na Shopify sem volume que as sustente. Aplicar a sincronia corrige as ${foraDeSincronia} variantes de uma vez, incluindo ${sync.repor} com decremento manual desatualizado.`}
          acao={
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', maxWidth: 240, textWrap: 'pretty' }}
            >
              A escrita de volta na Shopify ainda não foi integrada — os valores acima são a
              recomendação do ERP, para aplicar manualmente por enquanto.
            </span>
          }
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '15px 17px',
          borderRadius: 13,
          background: 'rgba(239,209,140,.045)',
          border: '1px solid var(--color-borda-ouro)',
        }}
      >
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>Como o cálculo funciona</Rotulo>
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
          >
            {`O ERP converte ml em unidades: divide o volume disponível pela variante e soma os decants já envasados. Se o resultado for zero, a variante é esgotada na Shopify, mesmo que você tenha deixado ${TETO_SHOPIFY} unidades lá. Quando o volume permite mais que ${TETO_SHOPIFY}, a Shopify continua com o seu teto de ${TETO_SHOPIFY}.`}
          </span>
        </span>
        <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-borda)' }} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>No seu caso</Rotulo>
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
          >
            {exemplo && varExemplo.length
              ? `${exemplo.base.nome} tem ${volume(exemplo.base.volumeMl)} em estoque. A variante de ${varExemplo[0].variante} ml permite ${plural(varExemplo[0].possivel, 'unidade', 'unidades')}${
                  varExemplo[1]
                    ? `, a de ${varExemplo[1].variante} ml permite ${varExemplo[1].possivel}`
                    : ''
                } — e não as ${varExemplo[0].publicado} publicadas em cada uma.`
              : 'Todas as variantes refletem o volume disponível no ERP.'}
          </span>
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 14,
        }}
      >
        {sync.bases.map((b) => (
          <CardBase key={b.base.id} base={b} />
        ))}
      </div>
    </div>
  )
}

function CardBase({ base }: { base: BaseSync }) {
  const bandeira: Tom | null = base.variantes.some((v) => v.acao === 'esgotar')
    ? 'erro'
    : base.variantes.some((v) => v.acao === 'reduzir')
      ? 'atencao'
      : base.pendentes
        ? 'info'
        : null

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 17px',
        border: '1px solid var(--color-borda)',
        borderLeft: `2px solid ${bandeira ? COR[bandeira] : 'transparent'}`,
        background: 'linear-gradient(170deg,#16151A,#101011)',
        borderRadius: 'var(--radius-card)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <span
            className="font-display"
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              lineHeight: 1.25,
              color: 'var(--color-tinta)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {base.base.nome}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              lineHeight: 1.25,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              color: 'rgba(239,209,140,.5)',
            }}
          >
            {base.base.marca}
          </span>
        </span>
        <Valor tamanho={13} tom="ouro">
          {volume(base.base.volumeMl)}
        </Valor>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8 }}
      >
        {base.variantes.map((v) => {
          const tom = TOM_ACAO[v.acao]
          return (
            <span
              key={v.variante}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '9px 8px',
                border: `1px solid ${BORDA[tom]}`,
                background: FUNDO_CHIP[tom],
                borderRadius: 9,
                minWidth: 0,
              }}
            >
              <Valor tamanho={10.5} peso={600}>
                {`${v.variante} ml`}
              </Valor>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                {/* Só mostra o "de → para" quando a sincronia vai mudar algo. */}
                {v.acao !== 'ok' && (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color: 'rgba(242,237,227,.35)',
                      textDecoration: 'line-through',
                    }}
                  >
                    {v.publicado}
                  </span>
                )}
                <Valor tamanho={13} tom={tom}>
                  {v.novoValor}
                </Valor>
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 8.5,
                  lineHeight: 1,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: COR[tom],
                  whiteSpace: 'nowrap',
                }}
              >
                {v.rotulo}
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 9, lineHeight: 1.3, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}
              >
                {v.detalhe}
              </span>
            </span>
          )
        })}
      </div>

      <span
        className="font-sans"
        style={{
          fontWeight: 500,
          fontSize: 10.5,
          lineHeight: 1.3,
          color: base.pendentes ? COR.atencao : COR.ok,
          paddingTop: 10,
          borderTop: '1px solid rgba(255,255,255,.05)',
        }}
      >
        {base.pendentes === 0
          ? 'Todas as variantes em dia'
          : plural(base.pendentes, 'variante fora de sincronia', 'variantes fora de sincronia')}
      </span>
    </section>
  )
}
