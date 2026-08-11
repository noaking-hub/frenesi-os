import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, FaixaAlerta, TituloSecao } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { yampiConfigurada } from '@/data/yampi'
import { lerCarrinhosYampi, type CarrinhoYampi } from '@/data/yampi-crm'
import { brl, plural } from '@/domain'

export const dynamic = 'force-dynamic'

/**
 * Carrinhos abandonados, lidos ao vivo do checkout da Yampi.
 *
 * A recuperação desta operação é uma mensagem no WhatsApp, não uma campanha:
 * o botão de cada carrinho abre a conversa já escrita. Carrinho recuperado
 * some da lista sozinho — por isso a tela lê ao vivo em vez de importar.
 */

type Prioridade = 'Alta' | 'Média' | 'Baixa'

/**
 * Prioridade = valor × recência. Quem abandonou há pouco ainda está com o
 * perfume na cabeça; quem abandonou muito caro merece a mensagem primeiro.
 */
function prioridadeDe(c: CarrinhoYampi, agora: number): Prioridade {
  const horas = c.abandonadoEm
    ? (agora - new Date(c.abandonadoEm).getTime()) / 3_600_000
    : Infinity
  if (c.valor >= 200 && horas <= 72) return 'Alta'
  if (c.valor >= 100 || horas <= 24) return 'Média'
  return 'Baixa'
}

const TOM_PRIORIDADE: Record<Prioridade, Tom> = { Alta: 'erro', Média: 'atencao', Baixa: 'neutro' }

function tempoDesde(iso: string | null, agora: number): string {
  if (!iso) return 'em data desconhecida'
  const horas = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 3_600_000))
  if (horas < 1) return 'há menos de 1 h'
  if (horas < 48) return `há ${plural(horas, 'hora', 'horas')}`
  const dias = Math.round(horas / 24)
  return `há ${plural(dias, 'dia', 'dias')}`
}

function linkWhatsApp(c: CarrinhoYampi): string | null {
  if (!c.telefone) return null
  const nome = c.cliente?.split(' ')[0] ?? ''
  const mensagem =
    `Oi${nome ? ` ${nome}` : ''}! Vi que você montou um carrinho na FRENESI e não finalizou. ` +
    `Posso ajudar em algo? Se quiser, seguro ${c.itens.length === 1 ? 'o seu decant' : 'os seus decants'} para você. 💛`
  return `https://wa.me/${c.telefone}?text=${encodeURIComponent(mensagem)}`
}

export default async function Carrinhos() {
  if (!yampiConfigurada()) {
    return (
      <EstadoVazio
        titulo="Yampi não configurada"
        instrucao="Os carrinhos abandonados vivem no checkout da Yampi. Configure as credenciais no .env.local."
      />
    )
  }

  let leitura: Awaited<ReturnType<typeof lerCarrinhosYampi>> | null = null
  let erro: string | null = null
  try {
    leitura = await lerCarrinhosYampi()
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  if (erro || !leitura) {
    return (
      <FaixaAlerta
        tom="erro"
        texto={`A Yampi não respondeu a leitura de carrinhos: ${erro ?? 'sem detalhe'}. Esta tela lê ao vivo — recarregue quando a conexão voltar.`}
      />
    )
  }

  const agora = Date.now()
  const carrinhos = leitura.carrinhos.map((c) => ({
    ...c,
    prioridade: prioridadeDe(c, agora),
    tempo: tempoDesde(c.abandonadoEm, agora),
    whatsapp: linkWhatsApp(c),
  }))

  if (carrinhos.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum carrinho abandonado"
        instrucao="A Yampi respondeu e a lista veio vazia — todo mundo que montou carrinho finalizou a compra."
      />
    )
  }

  const valorTotal = carrinhos.reduce((a, c) => a + c.valor, 0)
  const alta = carrinhos.filter((c) => c.prioridade === 'Alta')
  const comContato = carrinhos.filter((c) => c.whatsapp || c.email)

  const kpis: Kpi[] = [
    {
      label: 'Carrinhos abertos',
      valor: String(carrinhos.length),
      hint: 'No checkout da Yampi agora',
    },
    {
      label: 'Valor em jogo',
      valor: brl(valorTotal),
      hint: `Ticket médio ${brl(valorTotal / carrinhos.length)}`,
      tom: 'ouro',
    },
    {
      label: 'Prioridade alta',
      valor: String(alta.length),
      hint: 'Caros e recentes — mensagem primeiro',
      tom: alta.length ? 'atencao' : 'ok',
    },
    {
      label: 'Com contato',
      valor: `${comContato.length} de ${carrinhos.length}`,
      hint: 'Deixaram WhatsApp ou e-mail',
      tom: comContato.length ? 'ok' : 'neutro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <TituloSecao tamanho={16}>Carrinhos abandonados</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Lidos ao vivo da Yampi · carrinho recuperado sai da lista sozinho
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {carrinhos.map((c) => {
          const tom = TOM_PRIORIDADE[c.prioridade]
          const cor = tom === 'neutro' ? 'rgba(242,237,227,.4)' : COR[tom]
          return (
            <div
              key={c.id}
              className="hover:border-ouro/22"
              style={{
                background: 'linear-gradient(170deg,#141315,#101011)',
                border: '1px solid var(--color-borda)',
                borderTop: `2px solid ${cor}`,
                borderRadius: 13,
                padding: '16px 17px',
                display: 'flex',
                flexDirection: 'column',
                gap: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span className="font-sans" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.cliente ?? 'Visitante sem cadastro'}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.42)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.email ?? (c.telefone ? `+${c.telefone}` : 'sem contato')}
                  </span>
                </div>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 9.5,
                    lineHeight: 1,
                    letterSpacing: '.07em',
                    textTransform: 'uppercase',
                    color: cor,
                    border: `1px solid ${cor}`,
                    borderRadius: 'var(--radius-pill)',
                    padding: '4px 8px',
                    flex: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.prioridade}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 21, lineHeight: 1, color: 'var(--color-ouro)' }}>
                  {brl(c.valor)}
                </span>
                <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, color: 'rgba(242,237,227,.42)' }}>
                  {`abandonado ${c.tempo}`}
                </span>
              </div>

              {c.itens.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '11px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  {c.itens.slice(0, 4).map((i) => (
                    <span key={i} className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.3, color: 'rgba(242,237,227,.7)' }}>
                      {i}
                    </span>
                  ))}
                  {c.itens.length > 4 && (
                    <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.4)' }}>
                      {`+ ${c.itens.length - 4} itens`}
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {c.whatsapp ? (
                  <a
                    href={c.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:bg-[rgba(92,158,112,.24)] font-sans"
                    style={{
                      flex: 1,
                      height: 31,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(92,158,112,.14)',
                      color: COR.ok,
                      fontWeight: 600,
                      fontSize: 11,
                      lineHeight: 1,
                      borderRadius: 7,
                      textDecoration: 'none',
                    }}
                  >
                    Chamar no WhatsApp
                  </a>
                ) : c.email ? (
                  <a
                    href={`mailto:${c.email}?subject=${encodeURIComponent('Seu carrinho na FRENESI')}`}
                    className="hover:border-ouro/30 font-sans"
                    style={{
                      flex: 1,
                      height: 31,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(255,255,255,.12)',
                      color: 'rgba(242,237,227,.7)',
                      fontWeight: 600,
                      fontSize: 11,
                      lineHeight: 1,
                      borderRadius: 7,
                      textDecoration: 'none',
                    }}
                  >
                    Enviar e-mail
                  </a>
                ) : (
                  <span className="font-sans" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: 'rgba(242,237,227,.35)' }}>
                    Saiu sem deixar contato
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
