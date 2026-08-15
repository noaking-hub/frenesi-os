import Link from 'next/link'

import { Cartao, CabecalhoCartao, LinhaResumo, VazioInterno } from '@/components/erp/Cartao'
import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, LinkSecundario, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { carregarConfiguracoes } from '@/data/financeiro'
import { brl, competenciaPorExtenso, plural, ROTULO_ORIGEM_SALDO } from '@/domain'

import { AlternarCentro, FecharCompetencia, NovoCentroCusto, ReabrirCompetencia } from './Acoes'

/**
 * Configurações financeiras — as regras que o resto do módulo obedece.
 *
 * Três coisas moram aqui: o fechamento de competência (que congela o passado),
 * os centros de custo (que cortam o gasto por frente) e o retrato de como
 * cada conta obtém seu saldo. Nenhuma delas é uma preferência de exibição;
 * todas mudam o que os outros números significam.
 */
export const dynamic = 'force-dynamic'

export default async function ConfiguracoesFinanceiras() {
  const c = await carregarConfiguracoes()

  if (c.semBanco) {
    return (
      <EstadoVazio
        titulo="Configurações indisponíveis"
        instrucao="O Supabase precisa estar configurado para gerenciar fechamento, centros de custo e contas."
      />
    )
  }

  const travadas = c.competencias.filter((f) => !f.reabertaEm)
  const ultimoFechamento = travadas[0]
  const pendentesDeCategoria = c.abertas.reduce((a, m) => a + m.semCategoria, 0)
  const semAutomacao = c.categorias.filter((cat) => cat.ativa && !cat.usarEmAutomacao).length

  const kpis: Kpi[] = [
    {
      label: 'Competências fechadas',
      valor: String(travadas.length).padStart(2, '0'),
      hint: ultimoFechamento
        ? `A última foi ${competenciaPorExtenso(ultimoFechamento.competencia)}`
        : 'Nenhum mês congelado ainda',
      tom: travadas.length ? 'ok' : 'neutro',
    },
    {
      label: 'Competências abertas',
      valor: String(c.abertas.length).padStart(2, '0'),
      hint: 'Meses com movimento que ainda podem mudar',
      tom: c.abertas.length > 3 ? 'atencao' : 'neutro',
    },
    {
      label: 'Sem categoria',
      valor: String(pendentesDeCategoria).padStart(2, '0'),
      hint: pendentesDeCategoria
        ? 'Fora da DRE até alguém classificar'
        : 'Todo lançamento está classificado',
      tom: pendentesDeCategoria ? 'erro' : 'ok',
    },
    {
      label: 'Centros de custo',
      valor: String(c.centros.filter((x) => x.ativo).length).padStart(2, '0'),
      hint: c.centros.length
        ? `${c.centros.length - c.centros.filter((x) => x.ativo).length} inativo(s)`
        : 'Nenhum cadastrado — o rateio por frente fica indisponível',
      tom: 'neutro',
    },
    {
      label: 'Contas do caixa',
      valor: String(c.contas.filter((x) => x.ativa).length).padStart(2, '0'),
      hint: `${c.contas.filter((x) => x.origemSaldo === 'api').length} com saldo lido por integração`,
      tom: 'neutro',
    },
    {
      label: 'Fora da automação',
      valor: String(semAutomacao).padStart(2, '0'),
      hint: semAutomacao
        ? 'Categorias que a classificação automática não pode escolher'
        : 'Toda categoria ativa está disponível',
      tom: 'neutro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao
            titulo="Fechamento de competência"
            nota="Fechar congela valor, categoria e tipo dos lançamentos do mês"
            acao={<LinkSecundario href="/financeiro/dre" altura={28}>Conferir na DRE</LinkSecundario>}
          />

          {c.abertas.length === 0 && c.competencias.length === 0 ? (
            <VazioInterno texto="Nenhum lançamento registrado ainda — não há competência para fechar." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {c.abertas.map((m) => {
                const dados = c.competencias.find((f) => f.competencia === m.competencia)
                return (
                  <Linha
                    key={m.competencia}
                    titulo={competenciaPorExtenso(m.competencia)}
                    detalhe={[
                      plural(m.lancamentos, 'lançamento', 'lançamentos'),
                      m.semCategoria > 0 ? `${m.semCategoria} sem categoria` : null,
                      dados?.reabertaEm
                        ? `reaberta: ${dados.reaberturaMotivo ?? 'sem motivo registrado'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    marca={<Badge tom={m.semCategoria ? 'atencao' : 'info'}>Aberta</Badge>}
                    acao={
                      <FecharCompetencia
                        competencia={m.competencia}
                        lancamentos={m.lancamentos}
                        semCategoria={m.semCategoria}
                        resultado={dados?.resultado ?? 0}
                      />
                    }
                  />
                )
              })}

              {travadas.map((f) => (
                <Linha
                  key={f.competencia}
                  titulo={competenciaPorExtenso(f.competencia)}
                  detalhe={[
                    `fechada em ${f.fechadaEm.slice(0, 10)}`,
                    f.fechadaPor,
                    f.observacao,
                    `resultado ${brl(f.resultado)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  marca={<Badge tom="ok">Fechada</Badge>}
                  acao={<ReabrirCompetencia competencia={f.competencia} />}
                />
              ))}
            </div>
          )}
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Centros de custo"
            nota="Cortam o gasto por frente, sem inchar o plano de contas"
            acao={<NovoCentroCusto />}
          />
          {c.centros.length === 0 ? (
            <VazioInterno texto="Nenhum centro de custo cadastrado." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {c.centros.map((x) => (
                <span
                  key={x.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: '1px solid var(--color-borda-sutil)',
                    opacity: x.ativo ? 1 : 0.55,
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
                      {x.nome}
                    </span>
                    <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                      {x.emUso > 0
                        ? plural(x.emUso, 'lançamento usa', 'lançamentos usam')
                        : 'nenhum lançamento usa'}
                    </span>
                  </span>
                  <AlternarCentro id={x.id} nome={x.nome} ativo={x.ativo} />
                </span>
              ))}
            </div>
          )}
        </Cartao>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px,1fr))', gap: 14 }}>
        <Cartao>
          <CabecalhoCartao
            titulo="Origem do saldo de cada conta"
            acao={<LinkSecundario href="/financeiro/contas" altura={28}>Ajustar</LinkSecundario>}
          />
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Saldo lido por integração é o mais confiável; informado depende de alguém digitar;
            calculado é a soma do extrato, que atrasa quando falta importar.
          </span>
          {c.contas.map((conta) => (
            <LinhaResumo
              key={conta.id}
              rotulo={conta.nome}
              nota={ROTULO_ORIGEM_SALDO[conta.origemSaldo]}
              valor={brl(conta.saldoDisponivel)}
            />
          ))}
        </Cartao>

        <Cartao>
          <CabecalhoCartao
            titulo="Integração contábil"
            nota="O pacote que vai para o contador"
            acao={<LinkSecundario href="/financeiro/contabil" altura={28}>Abrir</LinkSecundario>}
          />
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-secundario)', textWrap: 'pretty' }}
          >
            A exportação usa a conta contábil de cada categoria. Categoria sem código sai no
            arquivo como não classificada, e o contador devolve o pacote pedindo o de-para.
          </span>
          <LinhaResumo
            rotulo="Categorias com conta contábil"
            valor={`${c.categorias.filter((x) => x.contaContabil).length}/${c.categorias.length}`}
          />
          <LinhaResumo
            rotulo="Competências prontas para exportar"
            nota="Fechadas e sem lançamento pendente"
            valor={String(travadas.length)}
            destaque
          />
        </Cartao>

        <Cartao>
          <CabecalhoCartao titulo="Últimas alterações" nota="Trilha de auditoria do módulo" />
          {c.auditoria.length === 0 ? (
            <VazioInterno texto="Nenhuma alteração registrada." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {c.auditoria.map((a) => (
                <span
                  key={a.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '84px minmax(0,1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: '1px solid var(--color-borda-sutil)',
                  }}
                >
                  <Valor tamanho={10} peso={400} tom="var(--color-terciario)">
                    {a.ocorridoEm.slice(0, 16).replace('T', ' ')}
                  </Valor>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 11,
                      color: 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`${a.acao} · ${a.entidade} ${a.entidadeId}`}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                    {a.operador ?? '—'}
                  </span>
                </span>
              ))}
            </div>
          )}
        </Cartao>
      </div>

      {pendentesDeCategoria > 0 && (
        <Link
          href="/financeiro/extrato"
          className="hover:brightness-110"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 17px',
            border: '1px solid rgba(194,90,80,.32)',
            borderRadius: 12,
            background: 'rgba(194,90,80,.06)',
            textDecoration: 'none',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: COR.erro }}>
              {`${plural(pendentesDeCategoria, 'lançamento sem categoria', 'lançamentos sem categoria')}`}
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
              Classificar antes de fechar evita congelar um resultado incompleto.
            </span>
          </span>
        </Link>
      )}
    </div>
  )
}

function Linha({
  titulo,
  detalhe,
  marca,
  acao,
}: {
  titulo: string
  detalhe: string
  marca: React.ReactNode
  acao: React.ReactNode
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 0',
        borderTop: '1px solid var(--color-borda-sutil)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--color-corrente)' }}
          >
            {titulo}
          </span>
          {marca}
        </span>
        <span
          className="font-sans"
          style={{
            fontSize: 10,
            color: 'var(--color-terciario)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {detalhe}
        </span>
      </span>
      {acao}
    </span>
  )
}
