import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, Ponto, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { PERMISSOES, type NivelPermissao, type UsuarioErp } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { plural } from '@/domain'

/** Cor de cada perfil, fixa — aparece no card do perfil e no avatar. */
const TOM_PERFIL: Record<string, Tom> = {
  Administrador: 'ouro',
  Financeiro: 'info',
  Operação: 'ok',
  Atendimento: 'neutro',
}

const NIVEL: Record<NivelPermissao, { label: string; tom: Tom | null }> = {
  total: { label: 'Total', tom: 'ok' },
  leitura: { label: 'Leitura', tom: 'info' },
  nenhum: { label: '—', tom: null },
}

export default async function Usuarios() {
  const repo = repositorio()
  const [usuarios, perfis] = await Promise.all([repo.usuarios(), repo.perfis()])

  const ativos = usuarios.filter((u) => u.status === 'Ativo')
  const convites = usuarios.length - ativos.length
  const admins = usuarios.filter((u) => u.perfil === 'Administrador')
  const semDuasEtapas = usuarios.filter((u) => !u.duasEtapas)
  const autorizadosIa = usuarios.filter((u) => u.assessorIa)

  const kpis: Kpi[] = [
    {
      label: 'Usuários ativos',
      valor: String(ativos.length),
      hint: convites ? plural(convites, 'convite pendente', 'convites pendentes') : 'Nenhum convite pendente',
    },
    {
      label: 'Administradores',
      valor: String(admins.length),
      hint: 'Acesso total ao ERP',
      tom: 'ouro',
    },
    {
      label: 'Sem verificação em 2 etapas',
      valor: String(semDuasEtapas.length),
      hint: semDuasEtapas.length ? 'Exigir no próximo acesso' : 'Todos protegidos',
      tom: semDuasEtapas.length ? 'atencao' : 'ok',
    },
    {
      label: 'Autorizados no Assessor IA',
      valor: String(autorizadosIa.length),
      hint: 'Podem enviar comandos por WhatsApp',
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<UsuarioErp>[] = [
    {
      chave: 'usuario',
      titulo: 'Usuário',
      largura: 'minmax(0,1.4fr)',
      render: (u) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span
            aria-hidden
            className="font-sans"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: u.perfil === 'Administrador' ? 'rgba(239,209,140,.18)' : 'rgba(255,255,255,.06)',
              color: u.perfil === 'Administrador' ? COR.ouro : 'rgba(242,237,227,.6)',
              fontWeight: 700,
              fontSize: 10.5,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            {u.iniciais}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                lineHeight: 1.25,
                color: 'var(--color-corrente)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {u.nome}
            </span>
            <span
              className="font-sans"
              style={{
                fontSize: 10.5,
                lineHeight: 1.25,
                color: 'rgba(242,237,227,.4)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {u.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      chave: 'perfil',
      titulo: 'Perfil',
      largura: '150px',
      render: (u) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.3, color: 'rgba(242,237,227,.78)' }}
        >
          {u.perfil}
        </span>
      ),
    },
    {
      chave: 'duasEtapas',
      titulo: '2 etapas',
      largura: '124px',
      render: (u) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ponto tom={u.duasEtapas ? 'ok' : 'atencao'} />
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.3,
              color: u.duasEtapas ? COR.ok : COR.atencao,
            }}
          >
            {u.duasEtapas ? 'Ativa' : 'Inativa'}
          </span>
        </span>
      ),
    },
    {
      chave: 'assessorIa',
      titulo: 'Assessor IA',
      largura: '136px',
      render: (u) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.3,
            color: u.assessorIa ? COR.ouro : 'rgba(242,237,227,.35)',
          }}
        >
          {u.assessorIa ? 'Autorizado' : '—'}
        </span>
      ),
    },
    {
      chave: 'ultimo',
      titulo: 'Último acesso',
      largura: '116px',
      render: (u) => (
        <Valor tamanho={11} peso={400} tom="rgba(242,237,227,.5)">
          {u.ultimoAcesso}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '124px',
      render: (u) => <Badge tom={u.status === 'Ativo' ? 'ok' : 'atencao'}>{u.status}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Usuários</TituloSecao>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Convidar usuário</BotaoOuro>
      </div>

      <Tabela colunas={colunas} itens={usuarios} chaveDe={(u) => u.email} />

      <TituloSecao tamanho={16}>Perfis de acesso</TituloSecao>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13 }}>
        {perfis.map((p) => {
          const tom = TOM_PERFIL[p.nome] ?? 'neutro'
          return (
            <div
              key={p.nome}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '15px 16px',
                border: `1px solid ${tom === 'ouro' ? 'rgba(239,209,140,.24)' : 'var(--color-borda)'}`,
                background: 'linear-gradient(170deg,#16151A,#101011)',
                borderRadius: 13,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Ponto tom={tom} tamanho={6} />
                <span
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 12.5,
                    lineHeight: 1.25,
                    color: 'var(--color-corrente)',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {p.nome}
                </span>
                <Valor tamanho={10} peso={400} tom="rgba(242,237,227,.4)">
                  {plural(p.pessoas, 'pessoa', 'pessoas')}
                </Valor>
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}
              >
                {p.descricao}
              </span>
            </div>
          )
        })}
      </div>

      {/* Matriz área × perfil. As colunas vêm de PERFIS — mesma ordem dos cards. */}
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
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.5fr) repeat(4,minmax(0,1fr))',
            gap: 12,
            padding: '11px 18px',
            background: 'var(--color-cabecalho)',
            borderBottom: '1px solid var(--color-borda)',
          }}
        >
          <span
            className="font-sans"
            style={{
              fontWeight: 600,
              fontSize: 9.5,
              lineHeight: 1,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--color-terciario)',
            }}
          >
            Área do ERP
          </span>
          {perfis.map((p) => (
            <span
              key={p.nome}
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9.5,
                lineHeight: 1,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--color-terciario)',
                textAlign: 'center',
              }}
            >
              {p.nome}
            </span>
          ))}
        </div>
        {PERMISSOES.map((linha) => (
          <div
            key={linha.area}
            className="hover:bg-[rgba(239,209,140,.03)]"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1.5fr) repeat(4,minmax(0,1fr))',
              gap: 12,
              alignItems: 'center',
              padding: '11px 18px',
              borderTop: '1px solid var(--color-borda-sutil)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}
            >
              {linha.area}
            </span>
            {linha.niveis.map((nivel, i) => {
              const n = NIVEL[nivel]
              return (
                <span
                  key={perfis[i]?.nome ?? i}
                  className="font-sans"
                  style={{
                    justifySelf: 'center',
                    fontWeight: 600,
                    fontSize: 10,
                    lineHeight: 1,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase',
                    color: n.tom ? COR[n.tom] : 'rgba(242,237,227,.3)',
                    background: n.tom === 'ok' ? 'rgba(92,158,112,.12)' : n.tom === 'info' ? 'rgba(108,140,176,.12)' : 'transparent',
                    borderRadius: 5,
                    padding: '5px 9px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.label}
                </span>
              )
            })}
          </div>
        ))}
      </section>
    </div>
  )
}
