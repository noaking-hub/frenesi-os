import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { FaixaAlerta, Rotulo, Valor } from '@/components/erp/primitivos'
import { BORDA, COR, FUNDO_CHIP, type Tom } from '@/components/erp/tokens'
import { carregarSincronia } from '@/data/consultas'
import { shopifyConfigurada, ultimaSincronizacao } from '@/data/shopify'
import { TETO_SHOPIFY, pad2, plural, volume } from '@/domain'
import type { AcaoSync, BaseSync } from '@/domain'

import { AplicarShopify } from './AplicarShopify'
import { ImportarShopify } from './ImportarShopify'

/**
 * Estoque nunca pode vir do cache do build.
 *
 * Sem isto a página é pré-renderizada no deploy e congela: reserva muda a
 * cada pedido pago, baixa muda a cada faturamento, e a tela mostraria o
 * saldo de horas atrás com cara de saldo atual.
 */
export const dynamic = 'force-dynamic'


const TOM_ACAO: Record<AcaoSync, Tom> = {
  esgotar: 'erro',
  reduzir: 'atencao',
  repor: 'info',
  ok: 'ok',
  sem_carga: 'neutro',
}

export default async function SincroniaShopify() {
  const [sync, ultima] = await Promise.all([carregarSincronia(), ultimaSincronizacao('shopify')])
  const foraDeSincronia = sync.esgotar + sync.reduzir + sync.repor

  const kpis: Kpi[] = [
    {
      label: 'Fora de sincronia',
      valor: pad2(foraDeSincronia),
      hint: foraDeSincronia
        ? `${sync.esgotar} a esgotar · ${sync.reduzir} a reduzir · ${sync.repor} a repor`
        : 'A loja publica exatamente o que o estoque sustenta',
      tom: sync.esgotar ? 'erro' : sync.reduzir ? 'atencao' : sync.repor ? 'info' : 'ok',
    },
    {
      label: 'Unidades sobrevendíveis',
      valor: String(sync.excesso),
      hint: sync.excesso
        ? 'Pedidos que você não conseguiria atender'
        : 'Nenhuma venda sem lastro possível',
      tom: sync.excesso ? 'erro' : 'ok',
    },
    {
      label: 'Em dia',
      valor: `${sync.emDia} de ${sync.total}`,
      hint: `${sync.noTeto} no teto de ${TETO_SHOPIFY} unidades`,
      tom: 'ok',
    },
    {
      label: 'Fora do controle de estoque',
      valor: pad2(sync.semCarga),
      hint: 'A sincronia não mexe nelas na loja · entram quando a compra do frasco for registrada',
      tom: 'neutro',
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

  // Quem precisa de decisão vem primeiro e aberto; quem está em dia vira uma
  // linha de resumo que expande — a tela era uma parede de cartões iguais, e
  // o que exigia ação se perdia no meio do que estava certo.
  const pendentes = sync.bases.filter((b) => b.pendentes > 0)
  const emDia = sync.bases.filter((b) => b.pendentes === 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ImportarShopify configurada={shopifyConfigurada()} ultima={ultima} />

      <FaixaKpis kpis={kpis} />

      {sync.excesso > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={`${sync.excesso} unidades continuam vendáveis na Shopify sem volume que as sustente. Aplicar corrige as ${foraDeSincronia} variantes de uma vez, incluindo ${sync.repor} com decremento manual desatualizado.`}
          acao={<AplicarShopify foraDeSincronia={foraDeSincronia} />}
        />
      )}

      {sync.excesso === 0 && foraDeSincronia > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
          <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
            A rotina de hora em hora aplica sozinha — o botão é para quem não quer esperar
          </span>
          <AplicarShopify foraDeSincronia={foraDeSincronia} />
        </div>
      )}

      {pendentes.length > 0 ? (
        <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          {pendentes.map((b) => (
            <CardBase key={b.base.id} base={b} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '15px 17px',
            borderRadius: 13,
            background: 'rgba(92,158,112,.06)',
            border: '1px solid rgba(92,158,112,.25)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.75)' }}>
            Nenhuma variante fora de sincronia — a loja está publicando exatamente o que o estoque
            sustenta.
          </span>
        </div>
      )}

      {emDia.length > 0 && (
        <details>
          <summary
            className="font-sans"
            style={{
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 11.5,
              lineHeight: 1,
              color: 'rgba(242,237,227,.55)',
              padding: '10px 0',
              listStyle: 'none',
            }}
          >
            {`▸ ${plural(emDia.length, 'base em dia', 'bases em dia')} — abrir para conferir`}
          </summary>
          <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, paddingTop: 10 }}>
            {emDia.map((b) => (
              <CardBase key={b.base.id} base={b} />
            ))}
          </div>
        </details>
      )}

      <details>
        <summary
          className="font-sans"
          style={{
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 11.5,
            lineHeight: 1,
            color: 'rgba(239,209,140,.6)',
            padding: '10px 0',
            listStyle: 'none',
          }}
        >
          ▸ Como o cálculo funciona
        </summary>
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
            <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>A regra</Rotulo>
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
      </details>
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
