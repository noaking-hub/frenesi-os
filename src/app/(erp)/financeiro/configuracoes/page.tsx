import {
  AcaoPainel,
  Celula,
  Chip,
  Colunas,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  LinhaValor,
  Num,
  Painel,
  Pilha,
  TabelaUi,
  Vazio,
  type ColunaUi,
} from '@/components/erp/ui'
import { Progresso } from '@/components/erp/Visualizacoes'
import { carregarConfiguracoes, type CompetenciaFechada } from '@/data/financeiro'
import { brl, competenciaPorExtenso, plural, ROTULO_ORIGEM_SALDO } from '@/domain'

import { AlternarCentro, FecharCompetencia, NovoCentroCusto, ReabrirCompetencia } from './Acoes'

/**
 * Configurações Financeiras — as regras que o resto do módulo obedece.
 *
 * Três coisas moram aqui, e nenhuma é preferência de exibição: o fechamento
 * de competência (que congela o passado), os centros de custo (que cortam o
 * gasto por frente) e o retrato de como cada conta obtém seu saldo. Todas
 * mudam o que os outros números significam.
 */
export const dynamic = 'force-dynamic'

interface LinhaMes {
  competencia: string
  lancamentos: number
  semCategoria: number
  resultado: number
  fechada: CompetenciaFechada | null
  travada: boolean
}

export default async function ConfiguracoesFinanceiras() {
  const c = await carregarConfiguracoes()

  if (c.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para gerenciar o módulo." />
        </Painel>
      </Pilha>
    )
  }

  const travadas = c.competencias.filter((f) => !f.reabertaEm)
  const ultimoFechamento = travadas[0]
  const pendentesDeCategoria = c.abertas.reduce((a, m) => a + m.semCategoria, 0)
  const comContaContabil = c.categorias.filter((x) => x.contaContabil).length
  const conectadas = c.contas.filter((x) => x.origemSaldo === 'api').length

  // Uma linha por mês com movimento: aberta ou fechada. Listar os doze meses
  // do ano ofereceria fechar novembro em agosto.
  const meses: LinhaMes[] = [
    ...c.abertas.map((m) => {
      const registro = c.competencias.find((f) => f.competencia === m.competencia) ?? null
      return {
        competencia: m.competencia,
        lancamentos: m.lancamentos,
        semCategoria: m.semCategoria,
        resultado: registro?.resultado ?? 0,
        fechada: registro,
        travada: false,
      }
    }),
    ...travadas.map((f) => ({
      competencia: f.competencia,
      lancamentos: f.lancamentos,
      semCategoria: 0,
      resultado: f.resultado,
      fechada: f,
      travada: true,
    })),
  ].sort((a, b) => b.competencia.localeCompare(a.competencia))

  const colunas: ColunaUi<LinhaMes>[] = [
    {
      chave: 'mes',
      titulo: 'Competência',
      largura: 'minmax(0,1fr)',
      render: (m) => (
        <Celula
          principal={competenciaPorExtenso(m.competencia)}
          secundaria={
            m.travada && m.fechada
              ? [
                  `fechada em ${m.fechada.fechadaEm.slice(0, 10)}`,
                  m.fechada.fechadaPor,
                  m.fechada.observacao,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : m.fechada?.reabertaEm
                ? `reaberta: ${m.fechada.reaberturaMotivo ?? 'sem motivo registrado'}`
                : plural(m.lancamentos, 'lançamento no mês', 'lançamentos no mês')
          }
        />
      ),
    },
    {
      chave: 'lanc',
      titulo: 'Lançamentos',
      largura: '108px',
      alinhamento: 'right',
      render: (m) => <Num tamanho={12}>{String(m.lancamentos)}</Num>,
    },
    {
      chave: 'pend',
      titulo: 'Sem categoria',
      largura: '124px',
      render: (m) =>
        m.semCategoria > 0 ? (
          <Chip tom="atencao">{plural(m.semCategoria, 'lançamento', 'lançamentos')}</Chip>
        ) : (
          <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.32)' }}>
            nenhum
          </span>
        ),
    },
    {
      chave: 'res',
      titulo: 'Resultado',
      largura: '128px',
      alinhamento: 'right',
      render: (m) => (
        <Num tamanho={12.5} tom={m.resultado >= 0 ? 'ok' : 'erro'}>
          {brl(m.resultado)}
        </Num>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '104px',
      render: (m) => (
        <Chip tom={m.travada ? 'ok' : m.semCategoria ? 'atencao' : 'info'}>
          {m.travada ? 'Fechada' : 'Aberta'}
        </Chip>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação',
      largura: '158px',
      alinhamento: 'right',
      render: (m) =>
        m.travada ? (
          <ReabrirCompetencia competencia={m.competencia} />
        ) : (
          <FecharCompetencia
            competencia={m.competencia}
            lancamentos={m.lancamentos}
            semCategoria={m.semCategoria}
            resultado={m.resultado}
          />
        ),
    },
  ]

  return (
    <Pilha gap={16}>
      <Ferramentas direita={<NovoCentroCusto />} />

      <GradeIndicadores>
        <Indicador
          icone="cadeado"
          tom={travadas.length ? 'ok' : 'neutro'}
          rotulo="Competências fechadas"
          valor={String(travadas.length)}
          nota={
            ultimoFechamento
              ? `a última foi ${competenciaPorExtenso(ultimoFechamento.competencia)}`
              : 'nenhum mês congelado ainda'
          }
          tomNota={travadas.length ? 'ok' : 'neutro'}
        />
        <Indicador
          icone="calendario"
          tom={c.abertas.length > 3 ? 'atencao' : 'info'}
          rotulo="Competências abertas"
          valor={String(c.abertas.length)}
          nota="Meses com movimento que ainda podem mudar"
        />
        <Indicador
          icone={pendentesDeCategoria ? 'alerta' : 'check-circulo'}
          tom={pendentesDeCategoria ? 'erro' : 'ok'}
          rotulo="Lançamentos sem categoria"
          valor={String(pendentesDeCategoria)}
          tomValor={pendentesDeCategoria ? 'erro' : 'ok'}
          nota={
            pendentesDeCategoria
              ? 'Ficam fora da DRE até alguém classificar'
              : 'Todo lançamento está classificado'
          }
          tomNota={pendentesDeCategoria ? 'erro' : 'ok'}
          href={pendentesDeCategoria ? '/financeiro/extrato' : undefined}
        />
        <Indicador
          icone="grade"
          tom="roxo"
          rotulo="Centros de custo"
          valor={String(c.centros.filter((x) => x.ativo).length)}
          nota={
            c.centros.length
              ? `${c.centros.length - c.centros.filter((x) => x.ativo).length} inativo(s)`
              : 'Nenhum cadastrado — o rateio por frente fica indisponível'
          }
        />
        <Indicador
          icone="elo"
          tom={conectadas === c.contas.length ? 'ok' : 'info'}
          rotulo="Contas do caixa"
          valor={String(c.contas.filter((x) => x.ativa).length)}
          nota={`${conectadas} com saldo lido por integração`}
        />
        <Indicador
          icone="documento"
          tom={comContaContabil === c.categorias.length ? 'ok' : 'atencao'}
          rotulo="Categorias mapeadas"
          valor={`${comContaContabil} de ${c.categorias.length}`}
          nota="Com conta contábil definida para a exportação"
          tomNota={comContaContabil === c.categorias.length ? 'ok' : 'atencao'}
          href="/financeiro/contabil"
        />
      </GradeIndicadores>

      <Painel
        titulo="Fechamento de competência"
        icone="cadeado"
        nota="fechar congela valor, categoria e tipo dos lançamentos do mês"
        acao={<AcaoPainel href="/financeiro/dre">Conferir na DRE</AcaoPainel>}
        rodape={{
          nota: 'Dar baixa continua liberado em mês fechado: o caixa de setembro não reescreve o resultado de agosto. A reabertura exige motivo e fica registrada.',
        }}
      >
        <TabelaUi
          colunas={colunas}
          itens={meses}
          chaveDe={(m) => m.competencia}
          larguraMinima={800}
          faixaDe={(m) => (m.travada ? 'ok' : m.semCategoria ? 'atencao' : null)}
          vazio={
            <Vazio
              icone="calendario"
              texto="Nenhum lançamento registrado ainda — não há competência para fechar."
            />
          }
        />
      </Painel>

      <Colunas proporcao="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel
          titulo="Centros de custo"
          icone="grade"
          tom="roxo"
          nota="cortam o gasto por frente"
          acao={<NovoCentroCusto />}
        >
          {c.centros.length === 0 ? (
            <Vazio
              icone="grade"
              texto="Nenhum centro de custo cadastrado. Sem eles, a pergunta “quanto a expedição custou este mês?” só se responde com categoria específica demais."
            />
          ) : (
            <Pilha gap={0}>
              {c.centros.map((x) => (
                <div
                  key={x.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderTop: '1px solid rgba(255,255,255,.05)',
                    opacity: x.ativo ? 1 : 0.5,
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontSize: 12, color: 'rgba(242,237,227,.86)' }}
                    >
                      {x.nome}
                    </span>
                    <Etiqueta>
                      {x.emUso > 0
                        ? plural(x.emUso, 'lançamento usa', 'lançamentos usam')
                        : 'nenhum lançamento usa'}
                    </Etiqueta>
                  </span>
                  <AlternarCentro id={x.id} nome={x.nome} ativo={x.ativo} />
                </div>
              ))}
            </Pilha>
          )}
        </Painel>

        <Painel
          titulo="Origem do saldo de cada conta"
          icone="banco"
          acao={<AcaoPainel href="/financeiro/contas">Ajustar</AcaoPainel>}
          rodape={{
            nota: 'Saldo lido por integração é o mais confiável; informado depende de alguém digitar; calculado é a soma do extrato, que atrasa quando falta importar.',
          }}
        >
          <Pilha gap={0}>
            {c.contas.map((conta) => (
              <LinhaValor
                key={conta.id}
                rotulo={conta.nome}
                nota={ROTULO_ORIGEM_SALDO[conta.origemSaldo]}
                valor={brl(conta.saldoDisponivel)}
                icone={conta.origemSaldo === 'api' ? 'elo' : conta.origemSaldo === 'informado' ? 'lapis' : 'calculadora'}
                tomIcone={conta.origemSaldo === 'api' ? 'ok' : conta.origemSaldo === 'informado' ? 'ouro' : 'neutro'}
              />
            ))}
          </Pilha>
        </Painel>

        <Painel
          titulo="Prontidão para o contador"
          icone="enviar"
          tom="ciano"
          acao={<AcaoPainel href="/financeiro/contabil">Abrir</AcaoPainel>}
        >
          <Pilha gap={12}>
            <Pilha gap={7}>
              <Etiqueta>Categorias com conta contábil</Etiqueta>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <Num tamanho={18} tom={comContaContabil === c.categorias.length ? 'ok' : 'atencao'}>
                  {`${comContaContabil}/${c.categorias.length}`}
                </Num>
                <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)' }}>
                  mapeadas
                </span>
              </span>
              <Progresso
                pct={c.categorias.length ? (comContaContabil / c.categorias.length) * 100 : 0}
                tom={comContaContabil === c.categorias.length ? 'ok' : 'atencao'}
              />
            </Pilha>

            <Pilha gap={0}>
              <LinhaValor
                rotulo="Competências prontas"
                nota="fechadas e sem pendência"
                valor={String(travadas.length)}
                tom="ok"
              />
              <LinhaValor
                rotulo="Ainda abertas"
                nota="podem mudar antes do envio"
                valor={String(c.abertas.length)}
                tom={c.abertas.length ? 'atencao' : 'neutro'}
              />
            </Pilha>
          </Pilha>
        </Painel>
      </Colunas>

      <Painel titulo="Últimas alterações" icone="relogio" nota="trilha de auditoria do módulo">
        {c.auditoria.length === 0 ? (
          <Vazio icone="relogio" texto="Nenhuma alteração registrada." />
        ) : (
          <Pilha gap={0}>
            {c.auditoria.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px minmax(0,1fr) 120px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '9px 0',
                  borderTop: '1px solid rgba(255,255,255,.05)',
                }}
              >
                <Num tamanho={10.5} peso={400} tom="neutro">
                  {a.ocorridoEm.slice(0, 16).replace('T', ' ')}
                </Num>
                <span
                  className="font-sans"
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(242,237,227,.72)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {`${a.acao} · ${a.entidade} ${a.entidadeId}`}
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, color: 'rgba(242,237,227,.38)', textAlign: 'right' }}
                >
                  {a.operador ?? '—'}
                </span>
              </div>
            ))}
          </Pilha>
        )}
      </Painel>
    </Pilha>
  )
}
