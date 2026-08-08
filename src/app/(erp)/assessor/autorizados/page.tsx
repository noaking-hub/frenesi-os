import { BotaoOuro, FaixaAlerta, Rotulo } from '@/components/erp/primitivos'
import { COR, FUNDO } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { plural } from '@/domain'

export default async function Autorizados() {
  const autorizados = await repositorio().iaAutorizados()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1080 }}>
      <FaixaAlerta
        tom="ouro"
        texto="Só números verificados podem enviar comandos. Qualquer mensagem de número desconhecido é ignorada e registrada nos logs."
        acao={<BotaoOuro altura={32}>+ Autorizar número</BotaoOuro>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
        {autorizados.map((u) => (
          <div
            key={u.numero}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 13,
              padding: '17px 18px',
              border: '1px solid var(--color-borda)',
              borderLeft: `2px solid ${u.ativo ? COR.ok : 'rgba(255,255,255,.12)'}`,
              background: 'linear-gradient(170deg,#16151A,#101011)',
              borderRadius: 'var(--radius-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                aria-hidden
                className="font-sans"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: u.ativo ? 'rgba(239,209,140,.16)' : 'rgba(255,255,255,.05)',
                  color: u.ativo ? COR.ouro : 'rgba(242,237,227,.4)',
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                {u.iniciais}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    lineHeight: 1.25,
                    color: u.ativo ? 'var(--color-corrente)' : 'rgba(242,237,227,.5)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {u.nome}
                </span>
                <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.25, color: 'rgba(239,209,140,.6)' }}>
                  {u.numero}
                </span>
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 10,
                  lineHeight: 1,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  color: u.ativo ? COR.ok : 'rgba(242,237,227,.5)',
                  background: u.ativo ? FUNDO.ok : 'rgba(255,255,255,.05)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  flex: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.ativo ? 'Ativo' : 'Revogado'}
              </span>
            </div>

            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
              {u.escopo}
            </span>

            <div style={{ display: 'flex', gap: 18, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.06)', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>Perfil</Rotulo>
                <span className="font-sans" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.72)', whiteSpace: 'nowrap' }}>
                  {u.perfil}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>Uso</Rotulo>
                <span className="font-sans" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.72)', whiteSpace: 'nowrap' }}>
                  {plural(u.comandos, 'comando no mês', 'comandos no mês')}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>Último</Rotulo>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.72)', whiteSpace: 'nowrap' }}>
                  {u.ultimo}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>Autorizado</Rotulo>
                <span className="font-sans" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.72)', whiteSpace: 'nowrap' }}>
                  {u.desde}
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
