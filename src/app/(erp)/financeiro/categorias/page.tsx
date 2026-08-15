import {
  AcaoPainel,
  Celula,
  Chip,
  Colunas,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { Progresso } from '@/components/erp/Visualizacoes'
import { lerRegrasCategoria } from '@/data/extrato'
import { lerCategorias, lerCentrosCusto, lerLancamentos } from '@/data/financeiro'
import {
  brl,
  competenciaPorExtenso,
  ehSaida,
  impactaResultado,
  plural,
  ROTULO_NATUREZA,
} from '@/domain'
import type { CategoriaGerencial, NaturezaGerencial } from '@/domain'

import { EditarCategoria, NovaCategoria } from './Editor'
import { RegrasCategoria } from './Regras'

/**
 * Categorias — o plano de contas gerencial.
 *
 * É a tela mais consequente do módulo e a que menos parece: a natureza
 * escolhida aqui decide em qual linha da DRE cada pagamento cai. "Compra de
 * perfume" cadastrada como despesa administrativa não muda o resultado final
 * do mês, mas destrói a margem de contribuição — e é ela que diz se vender
 * mais melhora ou piora a situação.
 */
export const dynamic = 'force-dynamic'

const TOM_NATUREZA: Record<NaturezaGerencial, TomUi> = {
  receita_operacional: 'ok',
  deducao_receita: 'atencao',
  cmv: 'erro',
  despesa_fixa: 'info',
  despesa_comercial: 'roxo',
  despesa_administrativa: 'neutro',
  despesa_financeira: 'erro',
  investimento: 'ouro',
  transferencia: 'neutro',
  aporte_retirada: 'ouro',
}

export default async function Categorias() {
  const [categorias, centros, lancamentos, regras] = await Promise.all([
    lerCategorias(),
    lerCentrosCusto(),
    lerLancamentos(),
    lerRegrasCategoria(),
  ])

  if (categorias.length === 0) {
    return (
      <Pilha>
      <Ferramentas direita={<NovaCategoria centros={centros} />} />
        <Painel>
          <Vazio
            icone="etiqueta"
            texto="Nenhuma categoria cadastrada. Sem categoria, nenhum lançamento entra na DRE — crie ao menos uma de receita e uma de custo variável."
          />
        </Painel>
      </Pilha>
    )
  }

  const competencia = new Date().toISOString().slice(0, 7)
  const doMes = lancamentos.filter(
    (l) => !l.canceladoEm && l.competencia.slice(0, 7) === competencia,
  )

  const valorPorCategoria = new Map<string, number>()
  for (const l of doMes) {
    if (!l.categoriaId) continue
    valorPorCategoria.set(l.categoriaId, (valorPorCategoria.get(l.categoriaId) ?? 0) + l.valor)
  }

  const enriquecidas = categorias
    .map((c) => ({ c, valorMes: valorPorCategoria.get(c.id) ?? 0 }))
    .sort((a, b) => b.valorMes - a.valorMes || a.c.nome.localeCompare(b.c.nome))

  const somaPorNatureza = (n: NaturezaGerencial) =>
    enriquecidas.filter((x) => x.c.natureza === n).reduce((a, x) => a + x.valorMes, 0)

  const custoVariavel = somaPorNatureza('cmv')
  const estruturaFixa = somaPorNatureza('despesa_fixa')
  const totalSaidas = enriquecidas
    .filter(({ c }) => ehSaida(c.natureza))
    .reduce((a, x) => a + x.valorMes, 0)

  const semLigacao = lancamentos.filter((l) => !l.canceladoEm && !l.categoriaId).length
  const foraDaDre = categorias.filter((c) => !impactaResultado(c.natureza) || !c.impactaDre).length
  const semContaContabil = categorias.filter((c) => c.ativa && !c.contaContabil).length
  const ativas = categorias.filter((c) => c.ativa).length

  const maiorValor = Math.max(1, ...enriquecidas.map((x) => x.valorMes))

  const colunas: ColunaUi<{ c: CategoriaGerencial; valorMes: number }>[] = [
    {
      chave: 'nome',
      titulo: 'Categoria',
      largura: 'minmax(0,1fr)',
      render: ({ c }) => (
        <Celula
          principal={c.nome}
          secundaria={[
            c.contaContabil || 'sem conta contábil',
            c.centroCusto,
            c.emUso > 0 ? plural(c.emUso, 'lançamento', 'lançamentos') : 'nunca usada',
          ]
            .filter(Boolean)
            .join(' · ')}
          tom={c.ativa ? undefined : 'neutro'}
        />
      ),
    },
    {
      chave: 'natureza',
      titulo: 'Natureza gerencial',
      largura: '186px',
      render: ({ c }) => <Chip tom={TOM_NATUREZA[c.natureza]}>{ROTULO_NATUREZA[c.natureza]}</Chip>,
    },
    {
      chave: 'regras',
      titulo: 'Regras',
      largura: '190px',
      render: ({ c }) => (
        <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {!c.impactaDre && <Chip tom="atencao" contorno>fora da DRE</Chip>}
          {!c.impactaCaixa && <Chip tom="info" contorno>fora do caixa</Chip>}
          {c.exigeDocumento && <Chip tom="ouro" contorno>exige doc.</Chip>}
          {!c.usarEmAutomacao && <Chip tom="neutro" contorno>sem automação</Chip>}
          {c.impactaDre && c.impactaCaixa && !c.exigeDocumento && c.usarEmAutomacao && (
            <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }}>
              padrão
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'No mês',
      largura: '152px',
      alinhamento: 'right',
      render: ({ c, valorMes }) => (
        <span
          style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', width: '100%' }}
        >
          <Num tamanho={12.5} tom={valorMes === 0 ? 'neutro' : TOM_NATUREZA[c.natureza]}>
            {valorMes === 0 ? '—' : brl(valorMes)}
          </Num>
          {valorMes > 0 && (
            <span style={{ width: '100%' }}>
              <Progresso pct={(valorMes / maiorValor) * 100} tom={TOM_NATUREZA[c.natureza]} altura={4} />
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '140px',
      alinhamento: 'right',
      render: ({ c }) => <EditarCategoria categoria={c} centros={centros} />,
    },
  ]

  return (
    <Pilha gap={16}>
      <Ferramentas direita={<NovaCategoria centros={centros} />} />

      <GradeIndicadores>
        <Indicador
          icone="lista"
          tom="neutro"
          rotulo="Categorias ativas"
          valor={String(ativas)}
          nota={
            categorias.length - ativas > 0
              ? `${categorias.length - ativas} inativa(s) preservando histórico`
              : 'Nenhuma categoria inativa'
          }
        />
        <Indicador
          icone="caixa"
          tom="erro"
          rotulo="Custo variável no mês"
          valor={brl(custoVariavel)}
          nota="CMV — varia com a venda e entra na margem de contribuição"
        />
        <Indicador
          icone="banco"
          tom="info"
          rotulo="Estrutura fixa no mês"
          valor={brl(estruturaFixa)}
          nota="Base do ponto de equilíbrio na DRE"
        />
        <Indicador
          icone="moeda"
          tom="ouro"
          rotulo="Total classificado"
          valor={brl(totalSaidas)}
          nota={`Custos e despesas de ${competenciaPorExtenso(competencia)}`}
        />
        <Indicador
          icone="transferir"
          tom="neutro"
          rotulo="Fora do resultado"
          valor={String(foraDaDre)}
          nota="Transferência, investimento e aporte movem caixa sem virar resultado"
        />
        <Indicador
          icone={semLigacao ? 'alerta' : 'check-circulo'}
          tom={semLigacao ? 'erro' : 'ok'}
          rotulo="Lançamentos sem categoria"
          valor={String(semLigacao)}
          tomValor={semLigacao ? 'erro' : 'ok'}
          nota={
            semLigacao
              ? 'Não entram na DRE nem no fechamento contábil'
              : 'Tudo classificado'
          }
          tomNota={semLigacao ? 'erro' : 'ok'}
          href={semLigacao ? '/financeiro/extrato' : undefined}
        />
      </GradeIndicadores>

      <Painel
        titulo="Plano de contas gerencial"
        icone="lista"
        nota={`Valores de ${competenciaPorExtenso(competencia)} · a natureza decide a linha da DRE`}
        acao={<AcaoPainel href="/financeiro/dre">Ver reflexo na DRE</AcaoPainel>}
      >
        <TabelaUi
          colunas={colunas}
          itens={enriquecidas}
          chaveDe={({ c }) => c.id}
          larguraMinima={860}
          faixaDe={({ c }) => (c.ativa ? null : 'neutro')}
          vazio={<Vazio icone="etiqueta" texto="Nenhuma categoria cadastrada." />}
        />
      </Painel>

      <Colunas proporcao="minmax(0,1.15fr) minmax(0,1fr)">
        <Painel
          titulo="Classificação automática do extrato"
          icone="faisca"
          tom="ciano"
          nota="o que casar com o padrão vira lançamento sozinho"
          rodape={{
            nota: 'A regra procura o padrão na descrição, na contraparte e na resposta crua do banco. O motoboy de toda semana deixa de pedir clique.',
            link: { href: '/financeiro/extrato', texto: 'Abrir extrato' },
          }}
        >
          <RegrasCategoria
            regras={regras}
            categorias={categorias.filter((c) => c.ativa && c.usarEmAutomacao).map((c) => c.nome)}
          />
        </Painel>

        <Pilha gap={14}>
          <Painel titulo="Como a natureza muda o resultado" icone="balanca" tom="roxo">
            <ListaBarras
              itens={(Object.keys(ROTULO_NATUREZA) as NaturezaGerencial[])
                .map((n) => ({
                  rotulo: ROTULO_NATUREZA[n],
                  valor: Math.max(somaPorNatureza(n), 0),
                  texto: somaPorNatureza(n) > 0 ? brl(somaPorNatureza(n)) : '—',
                  direita: impactaResultado(n) ? 'no resultado' : 'fora',
                  tom: TOM_NATUREZA[n],
                }))
                .filter((x) => x.valor > 0 || x.direita === 'fora')}
            />
          </Painel>

          {semContaContabil > 0 && (
            <Painel
              titulo="Pendências do plano de contas"
              icone="alerta"
              tom="atencao"
              rodape={{ link: { href: '/financeiro/contabil', texto: 'Abrir integração contábil' } }}
            >
              <span
                className="font-sans"
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: 'rgba(242,237,227,.6)',
                  textWrap: 'pretty',
                }}
              >
                {`${plural(semContaContabil, 'categoria ativa está', 'categorias ativas estão')} sem conta contábil. No arquivo do escritório elas saem como não classificadas, e o contador devolve o pacote pedindo o de‑para.`}
              </span>
            </Painel>
          )}
        </Pilha>
      </Colunas>
    </Pilha>
  )
}
