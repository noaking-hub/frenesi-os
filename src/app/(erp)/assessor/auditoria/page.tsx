import {
  CabecalhoPagina,
  Colunas,
  Etiqueta,
  GradeIndicadores,
  Ico,
  Indicador,
  Num,
  Painel,
  Pilha,
  Pilula,
  TabelaUi,
  TINTA,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { carregarAuditoriaDoGerente, type InteracaoAuditada, type UsoDaFerramenta } from '@/data/assessor/auditoria'

/**
 * Auditoria e observabilidade do Gerente — §11, §12 e §27 do escopo.
 *
 * Existe porque um assistente que consome API paga e lê o financeiro inteiro
 * precisa ter custo, latência e taxa de erro VISÍVEIS. Sem esta tela, a
 * primeira notícia de que algo saiu do controle é a fatura no fim do mês — ou,
 * pior, ninguém percebe que uma ferramenta está falhando há dias enquanto as
 * respostas continuam saindo com um buraco no meio, plausíveis e erradas.
 *
 * A tabela por ferramenta é a que mais paga o próprio espaço: a taxa de erro
 * global de 2% esconde a integração quebrada que aparece aqui com 100%.
 */

export const dynamic = 'force-dynamic'

const COLUNAS_FERRAMENTA: ColunaUi<UsoDaFerramenta>[] = [
  {
    chave: 'ferramenta',
    titulo: 'Ferramenta',
    largura: 'minmax(200px, 2fr)',
    render: (f) => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-tinta)' }}>
          {f.ferramenta}
        </span>
        <Etiqueta>{f.modo}</Etiqueta>
      </span>
    ),
  },
  {
    chave: 'chamadas',
    largura: '100px',
    titulo: 'Chamadas',
    alinhamento: 'right',
    render: (f) => <Num tamanho={12}>{String(f.chamadas)}</Num>,
  },
  {
    chave: 'falhas',
    largura: '130px',
    titulo: 'Falhas',
    alinhamento: 'right',
    render: (f) => (
      <Num tamanho={12} tom={f.falhas > 0 ? 'erro' : undefined}>
        {f.chamadas > 0 ? `${f.falhas} · ${((f.falhas / f.chamadas) * 100).toFixed(0)}%` : '—'}
      </Num>
    ),
  },
  {
    chave: 'bloqueadas',
    largura: '100px',
    titulo: 'Barradas',
    alinhamento: 'right',
    render: (f) => (
      <Num tamanho={12} tom={f.bloqueadas > 0 ? 'atencao' : undefined}>
        {String(f.bloqueadas)}
      </Num>
    ),
  },
  {
    chave: 'msMedio',
    largura: '120px',
    titulo: 'Tempo médio',
    alinhamento: 'right',
    render: (f) => <Num tamanho={12}>{f.msMedio == null ? '—' : `${f.msMedio}ms`}</Num>,
  },
  {
    chave: 'msMaximo',
    largura: '110px',
    titulo: 'Pior caso',
    alinhamento: 'right',
    render: (f) => (
      <Num tamanho={12} tom={(f.msMaximo ?? 0) > 8000 ? 'atencao' : undefined}>
        {f.msMaximo == null ? '—' : `${f.msMaximo}ms`}
      </Num>
    ),
  },
]

export default async function TelaDeAuditoria() {
  const p = await carregarAuditoriaDoGerente()
  const r = p.resumo
  const taxaErro = r.interacoes > 0 ? (r.comErro / r.interacoes) * 100 : 0

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Auditoria e uso"
        subtitulo="Toda interação com o Gerente fica registrada: quem perguntou, quais consultas rodaram, quanto custou e por que parou."
        icone="escudo"
        acao={<Pilula icone="calendario">Últimos 30 dias</Pilula>}
      />

      <GradeIndicadores conectada minimo={190}>
        <Indicador
          plano
          icone="faisca"
          tom="ouro"
          rotulo="Interações"
          valor={String(r.interacoes)}
          nota="perguntas respondidas no período"
        />
        <Indicador
          plano
          icone={taxaErro > 0 ? 'alerta' : 'check-circulo'}
          tom={taxaErro > 5 ? 'erro' : taxaErro > 0 ? 'atencao' : 'ok'}
          rotulo="Falhas"
          valor={`${taxaErro.toFixed(1)}%`}
          tomValor={taxaErro > 5 ? 'erro' : undefined}
          nota={`${r.comErro} interação(ões) sem resposta`}
        />
        <Indicador
          plano
          icone="ampulheta"
          tom={r.truncadas > 0 ? 'atencao' : 'neutro'}
          rotulo="Truncadas"
          valor={String(r.truncadas)}
          nota="pararam num limite — resposta incompleta, e avisada"
        />
        <Indicador
          plano
          icone="relogio"
          tom="info"
          rotulo="Tempo médio"
          valor={r.duracaoMediaMs == null ? '—' : `${(r.duracaoMediaMs / 1000).toFixed(1)}s`}
          nota="do envio até a resposta pronta"
        />
        <Indicador
          plano
          icone="moeda"
          tom="neutro"
          rotulo="Tokens"
          valor={`${Math.round((r.tokensEntrada + r.tokensSaida) / 1000)}k`}
          nota={`${Math.round(r.tokensEntrada / 1000)}k de entrada · ${Math.round(r.tokensSaida / 1000)}k de saída`}
        />
      </GradeIndicadores>

      <Painel
        titulo="Uso por ferramenta"
        icone="ajustes"
        nota="A taxa de erro global esconde a integração quebrada; esta tabela não."
      >
        {p.ferramentas.length === 0 ? (
          <Vazio texto="Nenhuma consulta registrada ainda." icone="ajustes" />
        ) : (
          <TabelaUi colunas={COLUNAS_FERRAMENTA} itens={p.ferramentas} chaveDe={(f) => f.ferramenta} />
        )}
      </Painel>

      <Painel
        titulo="Interações recentes"
        icone="lista"
        nota="Pergunta, consultas executadas e como terminou. É o registro que o escopo §11 exige."
      >
        {p.interacoes.length === 0 ? (
          <Vazio texto="Nenhuma interação registrada nos últimos 30 dias." icone="lista" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {p.interacoes.map((i) => (
              <LinhaDeAuditoria key={i.id} i={i} />
            ))}
          </div>
        )}
      </Painel>
    </Pilha>
  )
}

function LinhaDeAuditoria({ i }: { i: InteracaoAuditada }) {
  const tom: TomUi = i.erro ? 'erro' : i.parouPor && i.parouPor !== 'concluiu' ? 'atencao' : 'neutro'
  const quando = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(i.criadaEm))

  return (
    <details
      style={{
        borderRadius: 11,
        border: '1px solid rgba(255,255,255,.06)',
        background: 'rgba(255,255,255,.018)',
        padding: '11px 13px',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          flexWrap: 'wrap',
        }}
      >
        <Num tamanho={10.5} tom="neutro">
          {quando}
        </Num>
        <span
          className="font-sans"
          style={{
            flex: 1,
            minWidth: 180,
            fontSize: 12,
            color: 'var(--color-tinta)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {i.pergunta ?? '—'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: TINTA[tom] }}>
          <Ico n={i.erro ? 'x-circulo' : i.parouPor && i.parouPor !== 'concluiu' ? 'ampulheta' : 'check'} tamanho={13} />
          <span className="font-sans" style={{ fontSize: 10.5 }}>
            {i.erro ? 'falhou' : (i.parouPor ?? 'concluiu')}
          </span>
        </span>
        <Num tamanho={10.5} tom="neutro">
          {i.duracaoMs == null ? '—' : `${(i.duracaoMs / 1000).toFixed(1)}s`}
        </Num>
      </summary>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
        <Colunas proporcao="repeat(auto-fit, minmax(150px, 1fr))" gap={12}>
          <Ficha rotulo="Canal">{i.canal ?? '—'}</Ficha>
          <Ficha rotulo="Perfil do ator">{i.ator?.perfil ?? '—'}</Ficha>
          <Ficha rotulo="Permissões">{i.ator?.permissoes?.join(', ') || '—'}</Ficha>
          <Ficha rotulo="Modelo">{i.modelo ?? '—'}</Ficha>
          <Ficha rotulo="Escrita">{i.escritaLiberada ? 'liberada' : 'bloqueada'}</Ficha>
          <Ficha rotulo="Tokens">
            {i.tokensEntrada == null ? '—' : `${i.tokensEntrada} + ${i.tokensSaida ?? 0}`}
          </Ficha>
          <Ficha rotulo="Trace">{i.traceId?.slice(0, 8) ?? '—'}</Ficha>
        </Colunas>

        {i.ferramentas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Etiqueta>Consultas executadas</Etiqueta>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {i.ferramentas.map((f, k) => (
                <span
                  key={k}
                  title={f.erro ?? f.bloqueio ?? undefined}
                  className="font-sans"
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,.08)',
                    background: 'rgba(255,255,255,.02)',
                    fontSize: 10.5,
                    color: f.erro
                      ? TINTA.erro
                      : f.bloqueio
                        ? TINTA.atencao
                        : 'rgba(242,237,227,.6)',
                  }}
                >
                  {f.nome}
                  {typeof f.ms === 'number' && f.ms > 0 ? ` · ${f.ms}ms` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {i.erro && (
          <span className="font-sans" style={{ fontSize: 11, color: TINTA.erro, textWrap: 'pretty' }}>
            {i.erro}
          </span>
        )}

        {i.resposta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Etiqueta>Resposta</Etiqueta>
            <span
              className="font-sans"
              style={{
                fontSize: 11.5,
                lineHeight: 1.55,
                color: 'rgba(242,237,227,.62)',
                whiteSpace: 'pre-wrap',
                textWrap: 'pretty',
              }}
            >
              {i.resposta}
            </span>
          </div>
        )}
      </div>
    </details>
  )
}

function Ficha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <Etiqueta>{rotulo}</Etiqueta>
      <span
        className="font-sans"
        style={{ fontSize: 11.5, color: 'rgba(242,237,227,.72)', textWrap: 'pretty' }}
      >
        {children}
      </span>
    </span>
  )
}
