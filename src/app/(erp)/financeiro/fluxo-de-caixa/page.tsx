import {
  AcaoPainel,
  Celula,
  Chip,
  Colunas,
  Comparacao,
  Destaque,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  LinhaValor,
  ListaBarras,
  Num,
  Painel,
  Pilha,
  Pilula,
  Segmentado,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
import { BarrasEixo, CORES_SERIE, Legenda } from '@/components/erp/Visualizacoes'
import { carregarFluxo } from '@/data/financeiro'
import { brl, diaCurtoPt, plural, situacaoDe } from '@/domain'
import type { DiaDeCaixa, LancamentoGerencial } from '@/domain'

/**
 * Fluxo de Caixa — realizado, comprometido e projetado.
 *
 * O número que decide não é o saldo do fim do período: é o MENOR saldo do
 * caminho. Terminar o mês positivo não ajuda quem não tem dinheiro no dia 23,
 * e é esse ponto que a tela existe para antecipar — enquanto ainda dá para
 * antecipar um recebimento ou renegociar um prazo.
 *
 * O horizonte vem da URL para o alerta do Dashboard conseguir abrir a janela
 * que ele acusou.
 */
export const dynamic = 'force-dynamic'

const HORIZONTES = [
  { id: '15', rotulo: '15 dias' },
  { id: '30', rotulo: '30 dias' },
  { id: '60', rotulo: '60 dias' },
  { id: '90', rotulo: '90 dias' },
]

export default async function FluxoDeCaixa({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const { dias } = await searchParams
  const escolhido = HORIZONTES.some((h) => h.id === dias) ? dias! : '30'
  const f = await carregarFluxo(Number(escolhido))

  if (f.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio icone="cadeado" texto="O Supabase precisa estar configurado para projetar entradas e saídas." />
        </Painel>
      </Pilha>
    )
  }

  const p = f.projecao
  const saldoHoje = f.contas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const entradas = p.dias.reduce((a, d) => a + d.entradas, 0)
  const saidas = p.dias.reduce((a, d) => a + d.saidas, 0)
  const risco = p.menorSaldo < 0

  const saidasCat = f.porCategoria.filter((c) => c.tipo === 'saida').slice(0, 7)
  const entradasCat = f.porCategoria.filter((c) => c.tipo === 'entrada').slice(0, 5)

  const barras = p.dias.map((d) => ({
    rotulo: diaCurtoPt(d.dia),
    entrada: d.entradas,
    saida: d.saidas,
    saldo: d.saldo,
    previsto: !d.realizado,
  }))

  // Cenários: o mesmo horizonte com os recebimentos previstos entrando com
  // atraso (conservador) ou com metade das saídas adiadas (otimista). Não são
  // previsões novas — são a MESMA projeção sob outra hipótese, e a tela diz
  // qual hipótese é cada uma.
  const cenarios = [
    { id: 'base', rotulo: 'Base', tom: 'ouro' as TomUi, projecao: p },
    {
      id: 'conservador',
      rotulo: 'Conservador',
      tom: 'erro' as TomUi,
      projecao: reprojetar(p.dias, p.saldoInicial, { fatorEntrada: 0.7, fatorSaida: 1 }),
    },
    {
      id: 'otimista',
      rotulo: 'Otimista',
      tom: 'ok' as TomUi,
      projecao: reprojetar(p.dias, p.saldoInicial, { fatorEntrada: 1, fatorSaida: 0.8 }),
    },
  ]

  const proximosDias = p.dias.filter((d) => !d.realizado).slice(0, 5)

  const colunas: ColunaUi<LancamentoGerencial>[] = [
    {
      chave: 'venc',
      titulo: 'Vencimento',
      largura: '86px',
      render: (l) => {
        const s = situacaoDe(l, f.de)
        return (
          <Num tamanho={11.5} tom={s === 'vencido' ? 'erro' : undefined}>
            {l.venceEm ? diaCurtoPt(l.venceEm) : '—'}
          </Num>
        )
      },
    },
    {
      chave: 'desc',
      titulo: 'Compromisso',
      largura: 'minmax(0,1fr)',
      render: (l) => <Celula principal={l.descricao} secundaria={l.favorecido ?? l.conta} />,
    },
    {
      chave: 'cat',
      titulo: 'Categoria',
      largura: '156px',
      render: (l) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'rgba(242,237,227,.6)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {l.categoria}
        </span>
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Direção',
      largura: '92px',
      render: (l) => (
        <Chip tom={l.tipo === 'entrada' ? 'ok' : 'erro'} contorno>
          {l.tipo === 'entrada' ? 'Entra' : 'Sai'}
        </Chip>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '116px',
      alinhamento: 'right',
      render: (l) => (
        <Num tamanho={12.5} tom={l.tipo === 'entrada' ? 'ok' : 'erro'}>
          {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor - l.recebido)}`}
        </Num>
      ),
    },
  ]

  return (
    <Pilha gap={16}>

      <Ferramentas
        esquerda={
          <>
            <Pilula icone="calendario">{`${diaCurtoPt(f.de)} — ${diaCurtoPt(f.ate)}`}</Pilula>
            <Comparacao texto="saldo de partida" alvo={brl(saldoHoje)} />
          </>
        }
        direita={
          <Segmentado
            opcoes={HORIZONTES}
            ativo={escolhido}
            base="/financeiro/fluxo-de-caixa"
            chave="dias"
          />
        }
      />

      <GradeIndicadores>
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Saldo inicial"
          valor={brl(saldoHoje)}
          tomValor={saldoHoje > 0 ? 'ok' : 'erro'}
          nota={plural(f.contas.length, 'conta somada', 'contas somadas')}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entradas previstas"
          valor={brl(p.entradasPrevistas)}
          nota={`Ainda não realizadas, em ${escolhido} dias`}
          tomNota="ok"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saídas previstas"
          valor={brl(p.saidasPrevistas)}
          nota={plural(f.compromissos.length, 'compromisso no período', 'compromissos no período')}
          tomNota="erro"
        />
        <Indicador
          icone="queda"
          tom={risco ? 'erro' : 'ok'}
          rotulo="Menor saldo futuro"
          valor={brl(p.menorSaldo)}
          tomValor={risco ? 'erro' : 'ok'}
          nota={p.menorSaldoEm ? `acontece em ${diaCurtoPt(p.menorSaldoEm)}` : 'não cai abaixo do saldo atual'}
          tomNota={risco ? 'erro' : 'neutro'}
        />
        <Indicador
          icone="escudo"
          tom={p.risco === 'alto' ? 'erro' : p.risco === 'medio' ? 'atencao' : 'ok'}
          rotulo="Risco de caixa"
          valor={p.risco === 'alto' ? 'Alto' : p.risco === 'medio' ? 'Médio' : 'Baixo'}
          tomValor={p.risco === 'alto' ? 'erro' : p.risco === 'medio' ? 'atencao' : 'ok'}
          nota={
            p.diasAteNegativar !== null
              ? `negativa em ${p.diasAteNegativar} ${p.diasAteNegativar === 1 ? 'dia' : 'dias'}`
              : 'não negativa no horizonte'
          }
          tomNota={p.diasAteNegativar !== null ? 'erro' : 'ok'}
        />
        <Indicador
          icone="calendario"
          tom="info"
          rotulo="Cobertura de caixa"
          valor={f.cobertura === null ? '—' : `${f.cobertura} dias`}
          nota={
            f.cobertura === null
              ? 'sem saídas no período para medir o ritmo'
              : 'o caixa de hoje aguenta isso no ritmo atual'
          }
          tomNota={f.cobertura !== null && f.cobertura < 30 ? 'atencao' : 'neutro'}
        />
      </GradeIndicadores>

      <Colunas proporcao="minmax(0,2.1fr) minmax(0,.85fr)">
        <Painel
          titulo="Evolução do fluxo de caixa"
          icone="barras"
          nota={`${p.dias.length} dias`}
          rodape={{
            nota: 'Barras cheias já aconteceram; barras vazadas são previsão. Valores abaixo de R$ 0 indicam saldo negativo projetado.',
            link: { href: '/financeiro/lancamentos', texto: 'Ver lançamentos do período' },
          }}
        >
          <Legenda
            itens={[
              { cor: CORES_SERIE.entrada, rotulo: 'Entradas realizadas / previstas' },
              { cor: CORES_SERIE.saida, rotulo: 'Saídas realizadas / previstas' },
              { cor: CORES_SERIE.saldo, rotulo: 'Saldo acumulado' },
            ]}
          />
          {barras.length > 0 ? (
            <BarrasEixo dados={barras} altura={280} />
          ) : (
            <Vazio icone="barras" texto="Nenhum movimento no período." />
          )}
        </Painel>

        <Painel
          titulo={risco ? 'Atenção' : 'Caixa sustentado'}
          icone={risco ? 'alerta' : 'escudo'}
          tom={risco ? 'erro' : 'ok'}
        >
          {p.menorSaldoEm ? (
            <Destaque
              tom={risco ? 'erro' : 'ok'}
              titulo={risco ? 'Menor saldo em' : 'Ponto mais baixo em'}
              icone={risco ? 'alerta-circulo' : 'check-circulo'}
            >
              <Pilha gap={8}>
                <Num tamanho={19} tom={risco ? 'erro' : 'ok'} peso={600}>
                  {new Date(`${p.menorSaldoEm}T12:00:00`).toLocaleDateString('pt-BR')}
                </Num>
                <Etiqueta>Saldo projetado</Etiqueta>
                <Num tamanho={23} tom={risco ? 'erro' : 'ok'} peso={600}>
                  {brl(p.menorSaldo)}
                </Num>
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}
                >
                  {risco
                    ? 'O saldo fica negativo neste ponto. Antecipar recebimento, adiar despesa ou usar reserva evita a falta de caixa.'
                    : 'Mesmo no pior dia do horizonte o caixa continua positivo.'}
                </span>
              </Pilha>
            </Destaque>
          ) : (
            <Vazio icone="escudo" texto="Sem vale no horizonte projetado." />
          )}

          <Pilha gap={0}>
            <LinhaValor rotulo="Total de entradas" valor={brl(entradas)} tom="ok" icone="entrada" tomIcone="ok" />
            <LinhaValor rotulo="Total de saídas" valor={brl(saidas)} tom="erro" icone="saida" tomIcone="erro" />
            <LinhaValor
              rotulo="Resultado de caixa"
              valor={brl(entradas - saidas)}
              tom={entradas - saidas >= 0 ? 'ok' : 'erro'}
              destaque
            />
          </Pilha>
        </Painel>
      </Colunas>

      <Colunas proporcao="minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)">
        <Painel
          titulo="Cenários"
          icone="balanca"
          tom="roxo"
          nota="A mesma projeção sob outra hipótese"
        >
          <Pilha gap={11}>
            {cenarios.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  padding: '11px 12px',
                  border: `1px solid ${c.id === 'base' ? 'rgba(233,197,131,.28)' : 'rgba(255,255,255,.06)'}`,
                  borderRadius: 11,
                  background: c.id === 'base' ? 'rgba(233,197,131,.05)' : 'rgba(255,255,255,.012)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Chip tom={c.tom}>{c.rotulo}</Chip>
                  <div style={{ flex: 1 }} />
                  <Num tamanho={13} tom={c.projecao.menorSaldo < 0 ? 'erro' : 'ok'}>
                    {brl(c.projecao.menorSaldo)}
                  </Num>
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.42)' }}
                >
                  {c.id === 'base'
                    ? 'Tudo entra e sai como está lançado.'
                    : c.id === 'conservador'
                      ? '30% dos recebimentos previstos não entram no prazo.'
                      : '20% das saídas previstas são adiadas para depois do horizonte.'}
                </span>
                <span style={{ display: 'flex', gap: 14 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Etiqueta>Menor saldo em</Etiqueta>
                    <Num tamanho={11} peso={400}>
                      {c.projecao.menorSaldoEm ? diaCurtoPt(c.projecao.menorSaldoEm) : '—'}
                    </Num>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Etiqueta>Saldo final</Etiqueta>
                    <Num tamanho={11} peso={400} tom={c.projecao.saldoFinal < 0 ? 'erro' : undefined}>
                      {brl(c.projecao.saldoFinal)}
                    </Num>
                  </span>
                </span>
              </div>
            ))}
          </Pilha>
        </Painel>

        <Painel
          titulo="Fluxo por categoria"
          icone="pizza"
          nota="no horizonte"
          acao={<AcaoPainel href="/financeiro/categorias">Ver categorias</AcaoPainel>}
        >
          {saidasCat.length + entradasCat.length > 0 ? (
            <Pilha gap={14}>
              {entradasCat.length > 0 && (
                <Pilha gap={9}>
                  <Etiqueta>Entradas</Etiqueta>
                  <ListaBarras
                    itens={entradasCat.map((c) => ({
                      rotulo: c.categoria,
                      valor: c.valor,
                      texto: brl(c.valor),
                      tom: 'ok' as TomUi,
                    }))}
                  />
                </Pilha>
              )}
              {saidasCat.length > 0 && (
                <Pilha gap={9}>
                  <Etiqueta>Saídas</Etiqueta>
                  <ListaBarras
                    itens={saidasCat.map((c) => ({
                      rotulo: c.categoria,
                      valor: c.valor,
                      texto: brl(c.valor),
                      tom: 'erro' as TomUi,
                    }))}
                  />
                </Pilha>
              )}
            </Pilha>
          ) : (
            <Vazio icone="pizza" texto="Nenhum movimento categorizado no horizonte." />
          )}
        </Painel>

        <Painel titulo="Próximos dias" icone="calendario" nota="entradas, saídas e saldo do dia">
          {proximosDias.length > 0 ? (
            <Pilha gap={9}>
              {proximosDias.map((d) => (
                <div
                  key={d.dia}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '10px 12px',
                    border: '1px solid rgba(255,255,255,.06)',
                    borderRadius: 11,
                    background: d.saldo < 0 ? 'rgba(232,117,111,.06)' : 'rgba(255,255,255,.012)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Num tamanho={12} peso={600}>
                      {diaCurtoPt(d.dia)}
                    </Num>
                    <div style={{ flex: 1 }} />
                    <Chip tom={d.saldo < 0 ? 'erro' : 'ok'} contorno>
                      {brl(d.saldo)}
                    </Chip>
                  </span>
                  <span style={{ display: 'flex', gap: 14 }}>
                    <Num tamanho={10.5} tom="ok" peso={400}>
                      {`+ ${brl(d.entradas)}`}
                    </Num>
                    <Num tamanho={10.5} tom="erro" peso={400}>
                      {`− ${brl(d.saidas)}`}
                    </Num>
                  </span>
                </div>
              ))}
            </Pilha>
          ) : (
            <Vazio icone="calendario" texto="Nenhum dia previsto no horizonte." />
          )}
        </Painel>
      </Colunas>

      <Painel
        titulo="Agenda de compromissos"
        icone="lista"
        nota="na ordem em que o dinheiro precisa estar lá"
        acao={<AcaoPainel href="/financeiro/lancamentos">Abrir lançamentos</AcaoPainel>}
      >
        <TabelaUi
          colunas={colunas}
          itens={f.compromissos}
          chaveDe={(l) => l.id}
          larguraMinima={720}
          faixaDe={(l) => (situacaoDe(l, f.de) === 'vencido' ? 'erro' : null)}
          vazio={<Vazio icone="check-circulo" texto="Nenhum compromisso com vencimento no período." />}
        />
      </Painel>
    </Pilha>
  )
}

/**
 * Reprojeta a mesma série com entradas ou saídas escaladas.
 *
 * Só os dias PREVISTOS mudam: o passado já aconteceu, e mexer nele não seria
 * cenário — seria reescrever a história.
 */
function reprojetar(
  dias: DiaDeCaixa[],
  saldoInicial: number,
  fatores: { fatorEntrada: number; fatorSaida: number },
) {
  let acumulado = saldoInicial
  let menor = saldoInicial
  let menorEm: string | null = null

  for (const d of dias) {
    const entradas = d.realizado ? d.entradas : d.entradas * fatores.fatorEntrada
    const saidas = d.realizado ? d.saidas : d.saidas * fatores.fatorSaida
    acumulado = Math.round((acumulado + entradas - saidas) * 100) / 100
    if (acumulado < menor) {
      menor = acumulado
      menorEm = d.dia
    }
  }

  return { menorSaldo: menor, menorSaldoEm: menorEm, saldoFinal: acumulado }
}
