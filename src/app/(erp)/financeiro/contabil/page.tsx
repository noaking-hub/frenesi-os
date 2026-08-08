import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { NOTAS_EMITIDAS, PEDIDOS_SEM_NOTA, PLANO_CONTAS, AGOSTO } from '@/data/fixtures'
import { brl, pct, plural } from '@/domain'
import type { EnvioContabil } from '@/data/fixtures'

const TOM_ESTADO: Record<EnvioContabil['estado'], Tom> = {
  Aceito: 'ok',
  Processando: 'info',
  Recusado: 'erro',
}

export default async function IntegracaoContabil() {
  const repo = repositorio()
  const [envios, categorias, parametros] = await Promise.all([
    repo.enviosContabeis(),
    repo.categorias(),
    repo.parametros(),
  ])

  const ultimoAceito = envios.find((e) => e.estado === 'Aceito')
  const impostoProvisionado = AGOSTO.entradas * (parametros.impostoPct / 100)

  const kpis: Kpi[] = [
    {
      label: 'Competência aberta',
      valor: 'Agosto',
      hint: 'Fecha em 05/09 para o contador',
    },
    {
      label: 'Notas emitidas',
      valor: String(NOTAS_EMITIDAS),
      hint: 'Pedidos com NF-e no mês',
    },
    {
      label: 'Sem nota',
      valor: String(PEDIDOS_SEM_NOTA),
      hint: PEDIDOS_SEM_NOTA ? 'Precisa emitir antes do fechamento' : 'Tudo emitido',
      tom: PEDIDOS_SEM_NOTA ? 'atencao' : 'ok',
    },
    {
      label: 'Imposto provisionado',
      valor: brl(impostoProvisionado),
      // O percentual vem dos parâmetros de precificação — mesma fonte do preço.
      hint: `${pct(parametros.impostoPct, 0)} sobre a receita de agosto`,
      tom: 'erro',
    },
    {
      label: 'Último envio',
      valor: ultimoAceito?.quando ?? '—',
      hint: ultimoAceito ? 'Arquivo aceito pelo escritório' : 'Nenhum envio aceito ainda',
      tom: 'ok',
    },
  ]

  const fluxo = [
    { n: '1', titulo: 'Nota fiscal emitida por pedido', desc: 'O ERP usa o certificado A1 e o CNAE dos Dados da empresa', feito: true },
    { n: '2', titulo: 'Lançamentos classificados por categoria', desc: `${plural(categorias.length, 'categoria', 'categorias')} com plano de contas amarrado`, feito: true },
    { n: '3', titulo: 'Conciliação bancária conferida', desc: 'Extrato do Inter contra os lançamentos do mês', feito: true },
    { n: '4', titulo: 'Arquivo enviado ao escritório', desc: 'XML das notas e razão em CSV, todo dia às 23h', feito: true },
    { n: '5', titulo: 'Competência fechada', desc: 'Só depois disso o DRE do mês fica definitivo', feito: false },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '340px minmax(0,1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section
          className="card-ouro"
          style={{
            borderRadius: 16,
            padding: '18px 19px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <TituloSecao tamanho={14.5}>Como o mês fecha</TituloSecao>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {fluxo.map((e) => (
              <span
                key={e.n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px minmax(0,1fr)',
                  gap: 11,
                  alignItems: 'start',
                }}
              >
                <span
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%' }}
                >
                  <span
                    className="font-sans"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: `1px solid ${e.feito ? 'rgba(92,158,112,.45)' : 'rgba(239,209,140,.28)'}`,
                      background: e.feito ? 'rgba(92,158,112,.12)' : 'transparent',
                      color: e.feito ? COR.ok : 'rgba(242,237,227,.72)',
                      fontWeight: 600,
                      fontSize: 9.5,
                      lineHeight: '18px',
                      textAlign: 'center',
                      flex: 'none',
                    }}
                  >
                    {e.feito ? '✓' : e.n}
                  </span>
                  <span
                    style={{ width: 1, flex: 1, minHeight: 10, background: 'var(--color-borda)', display: 'block' }}
                  />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 14, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      color: e.feito ? COR.ok : 'rgba(242,237,227,.72)',
                      textWrap: 'pretty',
                    }}
                  >
                    {e.titulo}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                  >
                    {e.desc}
                  </span>
                </span>
              </span>
            ))}
          </div>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            O escritório recebe o arquivo automaticamente. Nenhum lançamento entra no fechamento
            sem categoria e conta contábil.
          </span>
          <BotaoOuro altura={36}>Fechar competência de agosto</BotaoOuro>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section
            style={{
              background: 'var(--color-mesa)',
              border: '1px solid var(--color-borda)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '15px 18px',
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <TituloSecao tamanho={14.5}>Arquivos enviados ao escritório</TituloSecao>
              <div style={{ flex: 1 }} />
              <BotaoSecundario altura={30}>Enviar agora</BotaoSecundario>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '96px minmax(150px,1.3fr) minmax(110px,1fr) 76px 72px 110px',
                gap: 12,
                padding: '10px 18px',
                background: 'rgba(255,255,255,.025)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}
            >
              {['Quando', 'Arquivo', 'Conteúdo', 'Registros', 'Tamanho', 'Estado'].map((t, i) => (
                <span
                  key={t}
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 9,
                    lineHeight: 1,
                    letterSpacing: '.11em',
                    textTransform: 'uppercase',
                    color: 'var(--color-terciario)',
                    textAlign: i === 3 || i === 4 ? 'right' : 'left',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            {envios.map((e) => (
              <div
                key={e.arquivo}
                className="hover:bg-[rgba(239,209,140,.035)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(150px,1.3fr) minmax(110px,1fr) 76px 72px 110px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '11px 18px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                  borderLeft: `2px solid ${e.estado === 'Recusado' ? COR.erro : 'transparent'}`,
                }}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
                >
                  {e.quando}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span
                    className="font-mono"
                    style={{
                      fontWeight: 500,
                      fontSize: 11,
                      lineHeight: 1.3,
                      color: 'var(--color-ouro)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.arquivo}
                  </span>
                  {e.nota && (
                    <span
                      className="font-sans"
                      style={{ fontSize: 10, lineHeight: 1.4, color: COR.erro, textWrap: 'pretty' }}
                    >
                      {e.nota}
                    </span>
                  )}
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-secundario)', textWrap: 'pretty' }}
                >
                  {e.conteudo}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 11, lineHeight: 1, color: 'var(--color-secundario)', textAlign: 'right', whiteSpace: 'nowrap' }}
                >
                  {e.registros}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 11, lineHeight: 1, color: 'var(--color-terciario)', textAlign: 'right', whiteSpace: 'nowrap' }}
                >
                  {e.tamanho}
                </span>
                <span style={{ justifySelf: 'start' }}>
                  <Badge tom={TOM_ESTADO[e.estado]}>{e.estado}</Badge>
                </span>
              </div>
            ))}
          </section>

          <section
            style={{
              background: 'var(--color-mesa)',
              border: '1px solid var(--color-borda)',
              borderRadius: 'var(--radius-card)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '15px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <TituloSecao tamanho={14.5}>Plano de contas por categoria</TituloSecao>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px,1fr) 132px minmax(220px,1.4fr) 116px',
                gap: 12,
                padding: '10px 18px',
                background: 'rgba(255,255,255,.025)',
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}
            >
              {['Categoria', 'Natureza', 'Conta contábil', 'No mês'].map((t, i) => (
                <span
                  key={t}
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 9,
                    lineHeight: 1,
                    letterSpacing: '.11em',
                    textTransform: 'uppercase',
                    color: 'var(--color-terciario)',
                    textAlign: i === 3 ? 'right' : 'left',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
            {categorias.map((c) => (
              <div
                key={c.nome}
                className="hover:bg-[rgba(239,209,140,.035)]"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(160px,1fr) 132px minmax(220px,1.4fr) 116px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '10px 18px',
                  borderTop: '1px solid var(--color-borda-sutil)',
                }}
              >
                <span
                  className="font-sans"
                  style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)', textWrap: 'pretty' }}
                >
                  {c.nome}
                </span>
                <span
                  className="font-sans"
                  style={{
                    fontSize: 10,
                    lineHeight: 1.3,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    color:
                      c.natureza === 'Custo variável'
                        ? COR.atencao
                        : c.natureza === 'Despesa fixa'
                          ? COR.info
                          : 'rgba(242,237,227,.5)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.natureza}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 10.5, lineHeight: 1.35, color: 'var(--color-secundario)', textWrap: 'pretty' }}
                >
                  {PLANO_CONTAS[c.nome] ?? '—'}
                </span>
                <Valor tamanho={11.5} style={{ textAlign: 'right' }}>
                  {brl(c.valorMes)}
                </Valor>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
