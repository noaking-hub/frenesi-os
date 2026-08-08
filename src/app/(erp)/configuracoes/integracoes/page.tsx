import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoSecundario, FaixaAlerta, Ponto, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { BORDA, COR, type Tom } from '@/components/erp/tokens'
import { RESPONSAVEIS_EMAIL } from '@/data/fixtures'
import type { Integracao } from '@/data/fixtures'
import { repositorio } from '@/data/repository'

const TOM_ESTADO: Record<Integracao['estado'], Tom> = {
  Conectada: 'ok',
  'Via Yampi': 'info',
  'Domínio pendente': 'atencao',
}

type LinhaEmail = (typeof RESPONSAVEIS_EMAIL)[number]

export default async function Integracoes() {
  const integracoes = await repositorio().integracoes()

  const conectadas = integracoes.filter((i) => i.estado === 'Conectada')
  const viaYampi = integracoes.filter((i) => i.estado === 'Via Yampi')
  const pendentes = integracoes.filter((i) => i.estado === 'Domínio pendente')
  const conflitos = RESPONSAVEIS_EMAIL.filter((r) => r.conflito)
  const shopify = integracoes.find((i) => i.nome === 'Shopify')

  const kpis: Kpi[] = [
    {
      label: 'Conectadas',
      valor: String(conectadas.length),
      hint: `${viaYampi.length} acessadas via Yampi`,
      tom: 'ok',
    },
    {
      label: 'Com pendência',
      valor: String(pendentes.length),
      hint: pendentes.length
        ? `${pendentes.map((i) => i.nome).join(', ')} · domínio não autenticado`
        : 'Nenhuma pendência',
      tom: pendentes.length ? 'atencao' : 'ok',
    },
    {
      label: 'Conflitos de e-mail',
      valor: String(conflitos.length),
      hint: conflitos.length ? 'Cliente recebe mensagem duplicada' : 'Cada gatilho com um dono',
      tom: conflitos.length ? 'erro' : 'ok',
    },
    {
      label: 'Última sincronização',
      valor: shopify?.ping ?? '—',
      hint: 'Shopify · pedidos e estoque',
    },
  ]

  // O ponto ao lado do remetente herda o estado da integração que envia — a
  // Klaviyo pendente aparece âmbar também aqui, sem uma segunda lista de status.
  const tomRemetente = (dono: string): Tom => {
    const integracao = integracoes.find((i) => i.nome === dono)
    return integracao ? TOM_ESTADO[integracao.estado] : 'neutro'
  }

  const colunas: Coluna<LinhaEmail>[] = [
    {
      chave: 'gatilho',
      titulo: 'Gatilho',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}
        >
          {r.gatilho}
        </span>
      ),
    },
    {
      chave: 'dono',
      titulo: 'Remetente',
      largura: '168px',
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ponto tom={tomRemetente(r.dono)} />
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 11.5,
              lineHeight: 1.3,
              color: 'rgba(242,237,227,.78)',
              whiteSpace: 'nowrap',
            }}
          >
            {r.dono}
          </span>
        </span>
      ),
    },
    {
      chave: 'conflito',
      titulo: 'Sobreposição',
      largura: 'minmax(0,1.2fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{
            fontSize: 11,
            lineHeight: 1.4,
            color: r.conflito ? COR.erro : 'rgba(242,237,227,.38)',
            textWrap: 'pretty',
          }}
        >
          {r.conflito || 'Sem sobreposição'}
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '128px',
      render: (r) =>
        r.conflito ? <BotaoSecundario altura={27}>Desligar duplicado</BotaoSecundario> : null,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 13 }}>
        {integracoes.map((i) => {
          const tom = TOM_ESTADO[i.estado]
          return (
            <div
              key={i.sigla}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'linear-gradient(150deg,#16151A,#101011)',
                border: `1px solid ${tom === 'ok' ? 'rgba(92,158,112,.22)' : BORDA[tom]}`,
                borderRadius: 13,
                padding: '14px 16px',
              }}
            >
              <span
                aria-hidden
                className="font-display"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: 'rgba(239,209,140,.08)',
                  border: '1px solid rgba(239,209,140,.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12,
                  lineHeight: 1,
                  color: 'var(--color-ouro)',
                  flex: 'none',
                }}
              >
                {i.sigla}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      lineHeight: 1.25,
                      color: 'var(--color-corrente)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i.nome}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 9.5,
                      lineHeight: 1,
                      letterSpacing: '.09em',
                      textTransform: 'uppercase',
                      color: 'rgba(242,237,227,.35)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i.papel}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 9,
                      lineHeight: 1,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: COR[tom],
                      border: `1px solid ${COR[tom]}`,
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 7px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i.estado}
                  </span>
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}
                >
                  {i.detalhe}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 9.5, lineHeight: 1, color: 'rgba(242,237,227,.32)' }}
                >
                  {`conectada ${i.desde} · última resposta ${i.ping}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {conflitos.length > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={
            conflitos.length === 1
              ? `O gatilho "${conflitos[0].gatilho}" tem dois remetentes ativos. O cliente recebe o mesmo aviso duas vezes.`
              : `${conflitos.length} gatilhos têm mais de um remetente ativo. O cliente recebe a mesma mensagem duas vezes e as métricas ficam divididas.`
          }
          acao={<BotaoSecundario altura={32}>Resolver conflitos</BotaoSecundario>}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Quem envia cada e-mail</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}
        >
          Um gatilho, um remetente
        </span>
      </div>

      <Tabela
        colunas={colunas}
        itens={RESPONSAVEIS_EMAIL}
        chaveDe={(r) => r.gatilho}
        bandeiraDe={(r) => (r.conflito ? 'erro' : null)}
      />
    </div>
  )
}
