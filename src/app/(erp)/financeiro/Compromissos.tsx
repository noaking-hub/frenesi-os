'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { Ico, type NomeIcone } from '@/components/erp/IconesUi'
import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import {
  INTERVALO_PADRAO_DIAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  brl,
  diaCurtoPt,
  diaPt,
  efeitoDoParcelamento,
  hojeEmSaoPaulo,
  parcelasValidas,
  parseNum,
  planejarParcelamento,
  ROTULO_NATUREZA,
  ROTULO_ORIGEM_SALDO,
  saldoAberto,
} from '@/domain'
import type {
  CategoriaGerencial,
  ContaFinanceira,
  LancamentoGerencial,
  SituacaoLancamento,
} from '@/domain'

import { useListasDeEdicao } from './ListasDoFormulario'
import {
  baixarComEncargos,
  cancelarCompromisso,
  criarCompromisso,
  editarLancamento,
  excluirLancamento,
  parcelarLancamento,
} from './acoes-gerenciais'

/**
 * Diálogos do Financeiro gerencial.
 *
 * Todos seguem a mesma regra: o formulário mostra o que o registro vai virar
 * ANTES de gravar. Baixa parcial diz quanto sobra; parcelamento diz o valor
 * de cada parcela. Sem essa prévia, o operador só descobre o resultado na
 * tabela — e desfazer custa mais que conferir.
 */

const CAMPO = {
  height: 38,
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 9,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
  width: '100%',
} as const

const CADENCIAS = [
  { valor: '', rotulo: 'Sem repetição' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
  { valor: 'bimestral', rotulo: 'A cada 2 meses' },
  { valor: 'trimestral', rotulo: 'A cada 3 meses' },
  { valor: 'semestral', rotulo: 'A cada 6 meses' },
  { valor: 'anual', rotulo: 'Todo ano' },
]

const hoje = () => hojeEmSaoPaulo()
const mesAtual = () => hoje().slice(0, 7)

function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
      {dica && (
        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {dica}
        </span>
      )}
    </label>
  )
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <span
      className="font-sans"
      style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
    >
      {texto}
    </span>
  )
}

function Rodape({
  rotulo,
  aoConfirmar,
  aoCancelar,
  pendente,
  destrutivo,
}: {
  rotulo: string
  aoConfirmar: () => void
  aoCancelar: () => void
  pendente: boolean
  destrutivo?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
      <BotaoSecundario altura={36} onClick={aoCancelar} desabilitado={pendente}>
        Cancelar
      </BotaoSecundario>
      <button
        type="button"
        onClick={aoConfirmar}
        disabled={pendente}
        className={destrutivo ? 'font-sans hover:brightness-110' : 'botao-ouro font-sans hover:brightness-[1.07]'}
        style={{
          height: 36,
          padding: '0 16px',
          fontWeight: 700,
          fontSize: 11.5,
          lineHeight: 1,
          borderRadius: 8,
          cursor: pendente ? 'wait' : 'pointer',
          opacity: pendente ? 0.55 : 1,
          ...(destrutivo
            ? {
                border: `1px solid ${COR.erro}`,
                background: 'rgba(194,90,80,.14)',
                color: COR.erro,
              }
            : { border: 0, boxShadow: 'var(--shadow-ouro)' }),
        }}
      >
        {pendente ? 'Gravando…' : rotulo}
      </button>
    </div>
  )
}

/**
 * Prévia do que vai ser gravado — o número antes do clique.
 *
 * `rolagem` existe por causa do cronograma do Parcelar: 48 parcelas empurrariam
 * o botão de confirmar para fora do modal, e o operador não teria como gravar o
 * que a própria tela acabou de mostrar.
 */
function Previa({
  linhas,
  rolagem,
}: {
  linhas: { rotulo: string; valor: string; tom?: string }[]
  rolagem?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 14px',
        border: '1px solid rgba(239,209,140,.22)',
        borderRadius: 10,
        background: 'rgba(239,209,140,.045)',
        ...(rolagem ? { maxHeight: 196, overflowY: 'auto' as const } : null),
      }}
    >
      {linhas.map((l) => (
        <span
          key={l.rotulo}
          style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}
        >
          <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
            {l.rotulo}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 12.5, fontWeight: 500, color: l.tom ?? 'var(--color-tinta)' }}
          >
            {l.valor}
          </span>
        </span>
      ))}
    </div>
  )
}

// ── Novo compromisso ───────────────────────────────────────────────────────

export function NovoCompromisso({
  contas,
  categorias,
  centros,
}: {
  contas: ContaFinanceira[]
  categorias: CategoriaGerencial[]
  centros: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [descricao, setDescricao] = useState('')
  const [favorecido, setFavorecido] = useState('')
  const [valor, setValor] = useState('')
  const [competencia, setCompetencia] = useState(mesAtual())
  const [venceEm, setVenceEm] = useState(hoje())
  const [contaId, setContaId] = useState(
    contas.find((c) => c.principal)?.id ?? contas[0]?.id ?? '',
  )
  const [categoriaId, setCategoriaId] = useState('')
  const [centroCusto, setCentroCusto] = useState('')
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')
  const [recorrencia, setRecorrencia] = useState('')
  const [recorrenciaAte, setRecorrenciaAte] = useState('')
  const [baixado, setBaixado] = useState(false)
  const [parcelas, setParcelas] = useState('1')
  const [intervalo, setIntervalo] = useState(String(INTERVALO_PADRAO_DIAS))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // Nunca grampeado no `onChange`: apagar o campo para digitar "12" faria o
  // cursor pular para "1" no meio da digitação. Fora da faixa, quem explica é
  // a prévia, com a mesma frase que o banco levantaria.
  const nParcelas = Math.max(1, Math.round(parseNum(parcelas)) || 1)

  // Receita em lançamento de saída é erro de digitação oferecido como opção.
  // A natureza da categoria já responde de que lado ela pode aparecer.
  const disponiveis = categorias.filter((c) => {
    if (!c.ativa) return false
    if (c.natureza === 'transferencia') return false
    return tipo === 'entrada'
      ? c.natureza === 'receita_operacional' || c.natureza === 'aporte_retirada'
      : c.natureza !== 'receita_operacional'
  })
  const categoriaValida = disponiveis.some((c) => c.id === categoriaId)
    ? categoriaId
    : (disponiveis[0]?.id ?? '')
  const escolhida = disponiveis.find((c) => c.id === categoriaValida)

  const salvar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await criarCompromisso({
        descricao,
        favorecido,
        categoriaId: categoriaValida,
        contaId,
        centroCusto: centroCusto || null,
        tipo,
        // A action e o banco trabalham com o TOTAL — é assim que a DRE lê a
        // compra e é assim que `parcelar_lancamento` reparte. A tela pede a
        // parcela porque é o número que está na fatura, e multiplica aqui.
        // Como o total é parcela × N exato, a divisão volta a dar a parcela
        // cheia, sem centavo sobrando na primeira.
        valor: parseNum(valor) * nParcelas,
        competencia,
        venceEm,
        documento,
        observacao,
        recorrencia: recorrencia || null,
        recorrenciaAte: recorrenciaAte || null,
        baixadoNoAto: baixado,
        parcelas: nParcelas,
        intervaloDias: Math.round(parseNum(intervalo)) || INTERVALO_PADRAO_DIAS,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDescricao('')
      setFavorecido('')
      setValor('')
      setDocumento('')
      setObservacao('')
      setBaixado(false)
      setParcelas('1')
      setAberto(false)
    })

  return (
    <>
      <BotaoOuro altura={32} onClick={() => setAberto(true)}>
        + Novo compromisso
      </BotaoOuro>

      {aberto && (
        <Modal titulo="Novo compromisso" largura={660} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>Novo compromisso</TituloSecao>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['saida', 'entrada'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className="font-sans"
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 9,
                    border: `1px solid ${tipo === t ? (t === 'entrada' ? COR.ok : COR.erro) : 'rgba(255,255,255,.11)'}`,
                    background: tipo === t ? (t === 'entrada' ? 'rgba(92,158,112,.12)' : 'rgba(194,90,80,.12)') : 'transparent',
                    color: tipo === t ? (t === 'entrada' ? COR.ok : COR.erro) : 'var(--color-secundario)',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'entrada' ? 'A receber' : 'A pagar'}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 12 }}>
              <Campo rotulo="Descrição">
                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Aluguel do galpão"
                  style={CAMPO}
                />
              </Campo>
              {/* Com parcelamento, o número que se tem na mão é o da PARCELA:
                  a fatura do cartão diz "5x de R$ 64,90", não "R$ 324,50 em
                  5x". Pedir o total obrigaria a multiplicar de cabeça antes de
                  digitar, e é onde o erro entra. O total é derivado e mostrado
                  na prévia. */}
              <Campo
                rotulo={nParcelas > 1 ? 'Valor da parcela' : 'Valor'}
                dica={
                  nParcelas > 1
                    ? `${nParcelas}× de ${brl(parseNum(valor))} — total de ${brl(parseNum(valor) * nParcelas)}`
                    : undefined
                }
              >
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  style={CAMPO}
                />
              </Campo>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <Campo rotulo={tipo === 'entrada' ? 'Pagador' : 'Favorecido'}>
                <input
                  value={favorecido}
                  onChange={(e) => setFavorecido(e.target.value)}
                  placeholder="Quem recebe ou paga"
                  style={CAMPO}
                />
              </Campo>
              <Campo
                rotulo="Categoria"
                dica={escolhida ? ROTULO_NATUREZA[escolhida.natureza] : 'Nenhuma categoria disponível para este tipo'}
              >
                <select
                  value={categoriaValida}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  style={CAMPO}
                >
                  {disponiveis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <Campo rotulo="Competência" dica="O mês do fato — é ele que a DRE usa">
                <input
                  type="month"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  style={CAMPO}
                />
              </Campo>
              <Campo rotulo="Vencimento" dica="A data que a projeção de caixa usa">
                <input
                  type="date"
                  value={venceEm}
                  onChange={(e) => setVenceEm(e.target.value)}
                  style={CAMPO}
                />
              </Campo>
              <Campo rotulo="Conta">
                <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={CAMPO}>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <Campo rotulo="Documento" dica={escolhida?.exigeDocumento ? 'Obrigatório nesta categoria' : 'NF, boleto ou recibo'}>
                <input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="NF 1234"
                  style={CAMPO}
                />
              </Campo>
              <Campo rotulo="Centro de custo">
                <select value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} style={CAMPO}>
                  <option value="">Sem centro de custo</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Repetir">
                <select
                  value={recorrencia}
                  onChange={(e) => setRecorrencia(e.target.value)}
                  style={CAMPO}
                >
                  {CADENCIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            {recorrencia && (
              <Campo rotulo="Repetir até" dica="Sem data, a série segue por 12 meses">
                <input
                  type="date"
                  value={recorrenciaAte}
                  onChange={(e) => setRecorrenciaAte(e.target.value)}
                  style={{ ...CAMPO, width: 200 }}
                />
              </Campo>
            )}

            {/* PARCELAR não é REPETIR, e o campo fica escondido enquanto o
                operador escolhe repetir justamente para as duas ideias não se
                misturarem: repetir é a conta que volta todo mês e não acaba;
                parcelar é um valor total quebrado em N vencimentos. Compra no
                cartão é sempre a segunda. */}
            {!recorrencia && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Campo
                  rotulo="Parcelas"
                  dica={
                    nParcelas > 1
                      ? `O valor acima se repete nas ${nParcelas} parcelas, uma por mês`
                      : '1 não divide. De 2 a 48, o valor acima vira o de CADA parcela'
                  }
                >
                  <input
                    inputMode="numeric"
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value)}
                    placeholder="1"
                    style={CAMPO}
                  />
                </Campo>
                {nParcelas > 1 && (
                  <Campo rotulo="Intervalo (dias)" dica="30 é o mês do cartão">
                    <input
                      inputMode="numeric"
                      value={intervalo}
                      onChange={(e) => setIntervalo(e.target.value)}
                      placeholder="30"
                      style={CAMPO}
                    />
                  </Campo>
                )}
              </div>
            )}

            <Campo rotulo="Observação">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Contexto que ajuda a conferir depois"
                style={CAMPO}
              />
            </Campo>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 13px',
                border: '1px solid var(--color-borda-sutil)',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={baixado}
                onChange={(e) => setBaixado(e.target.checked)}
                style={{ accentColor: '#EFD18C', width: 15, height: 15 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
                  {tipo === 'entrada' ? 'Já recebi este valor' : 'Já paguei este valor'}
                </span>
                <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                  Sem marcar, entra como previsão e aparece na projeção de caixa
                </span>
              </span>
            </label>

            {parseNum(valor) > 0 && (
              <Previa
                linhas={[
                  ...(nParcelas > 1
                    ? [
                        {
                          rotulo: 'Parcela',
                          valor: `${nParcelas}× de ${brl(parseNum(valor))}`,
                          tom: tipo === 'entrada' ? COR.ok : COR.erro,
                        },
                        { rotulo: 'Total da compra', valor: brl(parseNum(valor) * nParcelas) },
                      ]
                    : [
                        {
                          rotulo: 'Valor',
                          valor: brl(parseNum(valor)),
                          tom: tipo === 'entrada' ? COR.ok : COR.erro,
                        },
                      ]),
                  { rotulo: 'Entra no resultado de', valor: competencia },
                  {
                    rotulo: nParcelas > 1 ? 'Primeiro vencimento' : 'Entra no caixa em',
                    valor:
                      nParcelas > 1
                        ? `${venceEm}${baixado ? ' (1ª parcela já paga)' : ''}`
                        : baixado
                          ? venceEm
                          : `${venceEm} (previsto)`,
                  },
                ]}
              />
            )}
            {nParcelas > 1 && (
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {`A compra inteira (${brl(parseNum(valor) * nParcelas)}) entra no resultado de ${competencia} — é quando ela aconteceu. O que se reparte é o CAIXA: ${nParcelas} parcelas de ${brl(parseNum(valor))}, uma a cada ${Math.round(parseNum(intervalo)) || INTERVALO_PADRAO_DIAS} dias, cada uma aparecendo sozinha na projeção.`}
              </span>
            )}

            <Erro texto={erro} />
            <Rodape
              rotulo="Criar compromisso"
              aoConfirmar={salvar}
              aoCancelar={() => setAberto(false)}
              pendente={pendente}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Ações da linha ─────────────────────────────────────────────────────────

export function AcoesGerenciais({
  lancamento,
  situacao,
}: {
  lancamento: LancamentoGerencial
  situacao: SituacaoLancamento
}) {
  // As listas vêm do contexto, não de propriedade por linha: repetir contas,
  // categorias e centros em cada uma das mil linhas da tabela era o que
  // estourava o payload e derrubava a tela. Sem elas o lápis some, em vez de
  // abrir um diálogo com combos vazios.
  const { contas, categorias, centros } = useListasDeEdicao()
  const [aberto, setAberto] = useState<
    'baixa' | 'parcelar' | 'cancelar' | 'editar' | 'excluir' | null
  >(null)
  const encerrado = situacao === 'liquidado' || situacao === 'cancelado'
  // Liquidado ainda se edita — é o caso do que veio do extrato já baixado e
  // sem categoria. Cancelado não: o registro deixou de valer.
  const podeEditar = Boolean(contas && categorias) && situacao !== 'cancelado'
  // A regra final é do banco, que conhece pedido, conciliação e mês fechado.
  // Aqui só se decide quando MOSTRAR o botão: origem manual e sem
  // transferência. Oferecer no que o banco vai recusar seria um botão que só
  // serve para dar erro.
  const podeExcluir = lancamento.origem === 'Manual' && !lancamento.transferenciaId

  return (
    <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'flex-end' }}>
      {/* Ícones como no mockup, com o rótulo no title/aria — três palavras
          por linha viravam uma coluna de 180px só de botões. */}
      {!encerrado && (
        <BotaoIcone
          icone="check"
          rotulo={lancamento.tipo === 'entrada' ? 'Registrar recebimento' : 'Dar baixa'}
          destaque
          onClick={() => setAberto('baixa')}
        />
      )}
      {podeEditar && (
        <BotaoIcone
          icone="lapis"
          rotulo="Editar lançamento"
          // Sem categoria, o lançamento não entra na DRE: o lápis dourado é o
          // que faz o operador achar os que faltam classificar.
          destaque={!lancamento.categoriaId || !lancamento.venceEm}
          onClick={() => setAberto('editar')}
        />
      )}
      {/* Liquidado TAMBÉM parcela, e não é folga: é onde mora o erro que a
          funcionalidade conserta — "parcelei em 2x, mas lancei a venda só
          depois de receber a primeira parcela", com o ERP marcando o total
          como recebido. Enquanto o ícone sumia no liquidado, o único caminho
          para corrigir isso não existia na interface. O banco protege o que
          precisa ser protegido: `parcelar_lancamento` recusa quando o
          parcelamento marcaria como recebido mais do que já estava.
          Cancelado continua fora: o registro deixou de valer. */}
      {situacao !== 'cancelado' && !lancamento.parcela && !lancamento.transferenciaId && (
        <BotaoIcone icone="calendario" rotulo="Parcelar" onClick={() => setAberto('parcelar')} />
      )}
      {!encerrado && (
        <BotaoIcone icone="x" rotulo="Cancelar compromisso" onClick={() => setAberto('cancelar')} />
      )}
      {/* Excluir aparece só no lançamento MANUAL, e é a diferença entre
          "existiu e morreu" e "nunca deveria ter existido". O que veio do
          extrato, de uma venda ou de uma transferência responde pelo saldo de
          alguma coisa — o banco recusa, e a frase da recusa explica o porquê.
          Liquidado entra: o engano mais comum é justamente marcar como pago o
          que nem era para estar lá. */}
      {podeExcluir && (
        <BotaoIcone icone="lixeira" rotulo="Excluir lançamento" onClick={() => setAberto('excluir')} />
      )}
      {/* Data de baixa em dd/mm. Antes saía a data ISO inteira, que não cabia
          na coluna ao lado do lápis e vazava por cima da linha seguinte. O ano
          fica no title: quem confere baixa de agosto não precisa dele na
          tabela, quem confere de outro ano precisa saber que existe. */}
      {encerrado && (
        <span
          className="font-sans"
          title={lancamento.baixadoEm ?? undefined}
          style={{
            fontSize: 10,
            color: 'var(--color-terciario)',
            whiteSpace: 'nowrap',
            alignSelf: 'center',
          }}
        >
          {situacao === 'cancelado'
            ? 'cancelado'
            : lancamento.baixadoEm
              ? diaCurtoPt(lancamento.baixadoEm)
              : 'liquidado'}
        </span>
      )}

      {aberto === 'baixa' && (
        <DialogoBaixa lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
      {aberto === 'parcelar' && (
        <DialogoParcelar
          lancamento={lancamento}
          // A conta sai da mesma lista do contexto que o lápis usa: o diálogo
          // precisa dos saldos dela para dizer quanto o parcelamento derruba.
          // Sem provedor, `contas` é undefined e o aviso mostra só a diferença
          // no lançamento — que continua sendo verdade.
          conta={contas?.find((c) => c.id === lancamento.contaId)}
          aoFechar={() => setAberto(null)}
        />
      )}
      {aberto === 'cancelar' && (
        <DialogoCancelar lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
      {aberto === 'excluir' && (
        <DialogoExcluir lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
      {aberto === 'editar' && contas && categorias && (
        <DialogoEditar
          lancamento={lancamento}
          contas={contas}
          categorias={categorias}
          centros={centros ?? []}
          aoFechar={() => setAberto(null)}
        />
      )}
    </span>
  )
}

/**
 * Edição de um lançamento já registrado.
 *
 * Nasceu de dois problemas reais: recebimento lançado sem vencimento não
 * aparece na projeção de caixa (a projeção posiciona a entrada na data de
 * vencimento — sem data, ela não existe no gráfico) e lançamento importado do
 * extrato chega sem categoria, então a DRE não sabe o que ele é.
 *
 * Campo travado aparece desabilitado E explicado: esconder o campo faria
 * parecer que o ERP não sabe editá-lo, quando na verdade ele não DEVE ser
 * editado ali.
 */
function DialogoEditar({
  lancamento,
  contas,
  categorias,
  centros,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  contas: ContaFinanceira[]
  categorias: CategoriaGerencial[]
  centros: { id: string; nome: string }[]
  aoFechar: () => void
}) {
  const [descricao, setDescricao] = useState(lancamento.descricao)
  const [favorecido, setFavorecido] = useState(lancamento.favorecido ?? '')
  const [valor, setValor] = useState(lancamento.valor.toFixed(2).replace('.', ','))
  const [venceEm, setVenceEm] = useState(lancamento.venceEm ?? '')
  const [categoriaId, setCategoriaId] = useState(lancamento.categoriaId ?? '')
  const [contaId, setContaId] = useState(lancamento.contaId)
  const [centroCusto, setCentroCusto] = useState(lancamento.centroCusto ?? '')
  const [documento, setDocumento] = useState(lancamento.documento ?? '')
  const [observacao, setObservacao] = useState(lancamento.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const ehTransferencia = Boolean(lancamento.transferenciaId)
  const veioDoExtrato = lancamento.origem.startsWith('Extrato ')
  const jaBaixado = Boolean(lancamento.baixadoEm)

  const travaValor = ehTransferencia || jaBaixado
  const motivoValor = ehTransferencia
    ? 'Perna de transferência: mudar só um lado desequilibraria o par'
    : 'Lançamento já baixado: o saldo da conta foi calculado com este valor'
  const travaConta = ehTransferencia || veioDoExtrato
  const motivoConta = ehTransferencia
    ? 'Perna de transferência: a conta faz parte do par'
    : `Veio do extrato (${lancamento.origem}) e pertence à conta do movimento`

  // A natureza da categoria decide de que lado ela pode aparecer: despesa
  // classificada como receita não é erro de digitação, é faturamento
  // inventado na DRE. A categoria atual entra na lista mesmo inativa, senão o
  // select trocaria a classificação sozinho ao abrir.
  const disponiveis = categorias.filter((c) => {
    if (!c.ativa && c.id !== lancamento.categoriaId) return false
    if (c.natureza === 'transferencia') return ehTransferencia
    return lancamento.tipo === 'entrada'
      ? c.natureza === 'receita_operacional' || c.natureza === 'aporte_retirada'
      : c.natureza !== 'receita_operacional'
  })
  const escolhida = disponiveis.find((c) => c.id === categoriaId)

  const salvar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await editarLancamento(lancamento.id, {
        descricao,
        favorecido,
        valor: travaValor ? lancamento.valor : parseNum(valor),
        venceEm,
        categoriaId,
        contaId: travaConta ? lancamento.contaId : contaId,
        centroCusto: centroCusto || null,
        documento,
        observacao,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Editar lançamento" largura={660} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Editar lançamento</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`${lancamento.tipo === 'entrada' ? 'A receber' : 'A pagar'} · competência ${lancamento.competencia.slice(0, 7)} · origem ${lancamento.origem}${
            jaBaixado ? ` · baixado em ${lancamento.baixadoEm}` : ''
          }`}
        </span>

        {!lancamento.categoriaId && (
          <span
            className="font-sans"
            style={{
              padding: '10px 12px',
              border: '1px solid rgba(233,197,131,.28)',
              borderRadius: 10,
              background: 'rgba(233,197,131,.06)',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: COR.ouro,
              textWrap: 'pretty',
            }}
          >
            Este lançamento está sem categoria e por isso não aparece na DRE. Escolha a categoria
            que descreve o que ele foi.
          </span>
        )}

        {!lancamento.venceEm && (
          <span
            className="font-sans"
            style={{
              padding: '10px 12px',
              border: '1px solid rgba(233,197,131,.28)',
              borderRadius: 10,
              background: 'rgba(233,197,131,.06)',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: COR.ouro,
              textWrap: 'pretty',
            }}
          >
            Este lançamento está sem data de vencimento e por isso fica fora da projeção de caixa.
            Informe a data prevista para ele entrar no fluxo.
          </span>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 12 }}>
          <Campo rotulo="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              style={CAMPO}
            />
          </Campo>
          <Campo rotulo="Valor" dica={travaValor ? motivoValor : 'Maior que zero'}>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              disabled={travaValor}
              style={{ ...CAMPO, opacity: travaValor ? 0.5 : 1, cursor: travaValor ? 'not-allowed' : 'text' }}
            />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo={lancamento.tipo === 'entrada' ? 'Pagador' : 'Favorecido'}>
            <input
              value={favorecido}
              onChange={(e) => setFavorecido(e.target.value)}
              placeholder="Quem recebe ou paga"
              style={CAMPO}
            />
          </Campo>
          <Campo
            rotulo="Categoria"
            dica={
              escolhida
                ? ROTULO_NATUREZA[escolhida.natureza]
                : 'Sem categoria, o lançamento fica fora da DRE'
            }
          >
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              style={{
                ...CAMPO,
                border: categoriaId ? CAMPO.border : `1px solid ${COR.ouro}66`,
              }}
            >
              {/* A opção vazia só existe para quem ainda não tem categoria:
                  tirar a classificação de um lançamento já classificado o
                  faria sumir da DRE, e não há motivo para oferecer isso. */}
              {!lancamento.categoriaId && <option value="">Sem categoria</option>}
              {disponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Vencimento" dica="A data que a projeção de caixa usa">
            <input
              type="date"
              value={venceEm}
              onChange={(e) => setVenceEm(e.target.value)}
              style={{ ...CAMPO, colorScheme: 'dark' }}
            />
          </Campo>
          <Campo rotulo="Conta" dica={travaConta ? motivoConta : undefined}>
            <select
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              disabled={travaConta}
              style={{ ...CAMPO, opacity: travaConta ? 0.5 : 1, cursor: travaConta ? 'not-allowed' : 'pointer' }}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Centro de custo">
            <select value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} style={CAMPO}>
              <option value="">Sem centro de custo</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 12 }}>
          <Campo rotulo="Documento" dica="NF, boleto ou recibo">
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="NF 1234"
              style={CAMPO}
            />
          </Campo>
          <Campo rotulo="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Contexto que ajuda a conferir depois"
              style={CAMPO}
            />
          </Campo>
        </div>

        <Previa
          linhas={[
            {
              rotulo: 'Valor',
              valor: brl(travaValor ? lancamento.valor : parseNum(valor)),
              tom: lancamento.tipo === 'entrada' ? COR.ok : COR.erro,
            },
            {
              rotulo: 'Entra na projeção de caixa em',
              valor: venceEm || 'sem data — fica fora da projeção',
              tom: venceEm ? undefined : COR.ouro,
            },
            {
              rotulo: 'Entra na DRE como',
              valor: escolhida ? escolhida.nome : 'sem categoria — fica fora da DRE',
              tom: escolhida ? undefined : COR.ouro,
            },
          ]}
        />

        <Erro texto={erro} />
        <Rodape
          rotulo="Salvar alterações"
          aoConfirmar={salvar}
          aoCancelar={aoFechar}
          pendente={pendente}
        />
      </div>
    </Modal>
  )
}

function BotaoIcone({
  icone,
  rotulo,
  onClick,
  destaque,
}: {
  icone: NomeIcone
  rotulo: string
  onClick: () => void
  destaque?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={rotulo}
      aria-label={rotulo}
      className="hover:border-ouro/45 hover:text-ouro"
      style={{
        width: 28,
        height: 28,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${destaque ? 'rgba(233,197,131,.34)' : 'rgba(255,255,255,.1)'}`,
        background: destaque ? 'rgba(233,197,131,.08)' : 'transparent',
        color: destaque ? '#E9C583' : 'rgba(242,237,227,.55)',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      <Ico n={icone} tamanho={13} />
    </button>
  )
}

function MiniBotao({
  children,
  onClick,
  destaque,
}: {
  children: ReactNode
  onClick: () => void
  destaque?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans hover:border-ouro/45 hover:text-ouro"
      style={{
        height: 26,
        padding: '0 9px',
        border: `1px solid ${destaque ? 'rgba(239,209,140,.32)' : 'rgba(255,255,255,.1)'}`,
        background: destaque ? 'rgba(239,209,140,.07)' : 'transparent',
        color: destaque ? COR.ouro : 'var(--color-secundario)',
        fontWeight: 600,
        fontSize: 10,
        lineHeight: 1,
        borderRadius: 7,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Baixa com multa, juros e desconto em campos separados.
 *
 * Somar juros ao principal faria a despesa de energia crescer retroativamente
 * — e o que cresceu foi despesa financeira, que é outra linha da DRE.
 */
function DialogoBaixa({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  aoFechar: () => void
}) {
  const aberto = saldoAberto(lancamento)
  const [valor, setValor] = useState(aberto.toFixed(2).replace('.', ','))
  const [data, setData] = useState(hoje())
  const [multa, setMulta] = useState('')
  const [juros, setJuros] = useState('')
  const [desconto, setDesconto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const totalDevido =
    lancamento.valor + parseNum(multa) + parseNum(juros) - parseNum(desconto) - lancamento.recebido
  const sobra = Math.max(0, Math.round((totalDevido - parseNum(valor)) * 100) / 100)

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await baixarComEncargos({
        id: lancamento.id,
        valor: parseNum(valor),
        data,
        multa: parseNum(multa),
        juros: parseNum(juros),
        desconto: parseNum(desconto),
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Dar baixa" largura={540} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>
          {lancamento.tipo === 'entrada' ? 'Registrar recebimento' : 'Registrar pagamento'}
        </TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`${lancamento.descricao} · ${brl(lancamento.valor)} · vence ${lancamento.venceEm ?? '—'}`}
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Valor movimentado" dica="Pode ser menos que o total — o resto continua em aberto">
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" style={CAMPO} />
          </Campo>
          <Campo rotulo="Data efetiva" dica="É esta data que entra no caixa">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={CAMPO} />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Multa">
            <input value={multa} onChange={(e) => setMulta(e.target.value)} inputMode="decimal" placeholder="0,00" style={CAMPO} />
          </Campo>
          <Campo rotulo="Juros">
            <input value={juros} onChange={(e) => setJuros(e.target.value)} inputMode="decimal" placeholder="0,00" style={CAMPO} />
          </Campo>
          <Campo rotulo="Desconto">
            <input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00" style={CAMPO} />
          </Campo>
        </div>

        <Previa
          linhas={[
            { rotulo: 'Total devido com encargos', valor: brl(lancamento.valor + parseNum(multa) + parseNum(juros) - parseNum(desconto)) },
            { rotulo: 'Sendo movimentado agora', valor: brl(parseNum(valor)) },
            {
              rotulo: sobra > 0 ? 'Continua em aberto' : 'Situação depois da baixa',
              valor: sobra > 0 ? brl(sobra) : 'Liquidado',
              tom: sobra > 0 ? COR.ouro : COR.ok,
            },
          ]}
        />

        <Erro texto={erro} />
        <Rodape rotulo="Confirmar baixa" aoConfirmar={confirmar} aoCancelar={aoFechar} pendente={pendente} />
      </div>
    </Modal>
  )
}

/**
 * Parcelar um compromisso que já existe — inclusive um que já foi baixado.
 *
 * A prévia sai INTEIRA de `planejarParcelamento`, no domínio. A versão anterior
 * deste diálogo tinha cópia própria da divisão
 * (`Math.trunc((lancamento.valor / n) * 100) / 100`), que é a conta em ponto
 * flutuante que `src/domain/parcelamento.ts` foi criado para matar: numa
 * varredura de R$ 0,01 a R$ 10.000,00 × 2..48 parcelas, 348.983 de 47 milhões
 * de combinações discordavam de `dividirEmParcelas` (~1 em 135). Casos banais
 * caíam nela — R$ 100,02 em 3× exibia "3× de R$ 33,33" com R$ 0,03 de diferença
 * na 1ª, e o banco gravava 33,34/33,34/33,34, porque `trunc(100.02/3, 2)` em
 * numeric dá 33.34 e em float dá 33.33 (100.02/3 é 33.339999999999996). A
 * prévia mentia sobre TODAS as parcelas, e o dono só descobriria conferindo
 * boleto — que é literalmente o cenário que aquele módulo diz querer evitar.
 *
 * "Já recebidas" é o caso do dono: "parcelei essa venda em 2x, mas o lançamento
 * eu só fiz depois que recebi a primeira parcela". O ERP tinha gravado
 * R$ 216,00 recebidos em 12/08 quando só R$ 108,00 entraram. Marcar K parcelas
 * como recebidas é o conserto — e por isso o diálogo agora abre para lançamento
 * liquidado também, que é onde esse erro mora.
 */
function DialogoParcelar({
  lancamento,
  conta,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  /** A conta do lançamento — é o saldo dela que muda. Ausente fora do provedor. */
  conta: ContaFinanceira | undefined
  aoFechar: () => void
}) {
  const jaBaixado = Boolean(lancamento.baixadoEm)
  const [parcelas, setParcelas] = useState(String(MIN_PARCELAS))
  const [intervalo, setIntervalo] = useState(String(INTERVALO_PADRAO_DIAS))
  // Lançamento já baixado abre com UMA parcela recebida, não com zero: quem
  // chega aqui com o compromisso liquidado está quase sempre consertando o
  // relato do dono — "parcelei em 2x e lancei depois de receber a primeira".
  // Zero seria pedir para ele redigitar o que o ERP já sabe, e — pior — um
  // clique distraído desmarcaria como recebido um dinheiro que entrou.
  const [jaRecebidas, setJaRecebidas] = useState(jaBaixado ? '1' : '0')
  // A data padrão é a baixa do próprio lançamento quando ela existe: se o
  // dinheiro entrou, aquele é o dia. É também o que o banco assume no
  // `coalesce(p_recebidas_em, v_pai.baixado_em)`.
  const [recebidasEm, setRecebidasEm] = useState(lancamento.baixadoEm ?? hoje())
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const n = parcelasValidas(parseNum(parcelas))
  const dias = Math.round(parseNum(intervalo)) || INTERVALO_PADRAO_DIAS
  const k = Math.max(0, Math.round(parseNum(jaRecebidas)) || 0)

  /*
   * A âncora do cronograma copia o `case` de `gravar_parcelas_do_lancamento`,
   * linha por linha: com K > 0 a primeira parcela é a que já foi recebida, e a
   * data dela é a do recebimento; sem K, vale o vencimento e, na falta dele, a
   * competência — porque compromisso previsto ainda precisa cair em algum dia
   * para entrar na projeção. Ancorar em outra coisa faria a prévia prometer
   * vencimentos diferentes dos que o banco grava.
   */
  const primeiroVencimento =
    k > 0 ? recebidasEm : (lancamento.venceEm ?? lancamento.competencia)

  const plano = useMemo(
    () =>
      planejarParcelamento({
        valor: lancamento.valor,
        parcelas: n,
        primeiroVencimento,
        intervaloDias: dias,
        jaRecebidas: k,
        recebidasEm,
      }),
    [lancamento.valor, n, primeiroVencimento, dias, k, recebidasEm],
  )

  /*
   * O invariante que o banco levanta, dito ANTES do clique.
   *
   * `parcelar_lancamento` recusa quando o total marcado como recebido depois
   * passaria do que já estava recebido antes — isso seria o ERP inventando uma
   * entrada que o extrato nunca teve. Ficar MENOR passa de propósito: é o
   * conserto, e o saldo da conta cai na diferença.
   *
   * Quanto ele cai sai de `efeitoDoParcelamento`, que espelha a view
   * `saldos_das_contas` — inclusive as duas regras que fazem o número surpreender
   * quem só olha a tela: baixa sem data não entra em saldo nenhum, e o saldo
   * EXIBIDO em Contas e Caixas só soma baixas posteriores à data do saldo
   * informado à mão. No caso do dono, o calculado do Inter cai R$ 108,00 e o
   * exibido não se mexe. Anunciar só "o saldo cai R$ 108" mandaria ele conferir
   * um número parado.
   */
  const recebidoAgora = plano.ok ? plano.recebido : 0
  const efeito = plano.ok
    ? efeitoDoParcelamento({
        tipo: lancamento.tipo,
        movimentadoAntes: lancamento.recebido,
        baixadoEmAntes: lancamento.baixadoEm,
        movimentadoDepois: recebidoAgora,
        baixadoEmDepois: recebidoAgora > 0 ? recebidasEm : null,
        saldoInformadoPara: conta?.saldoInformadoPara ?? null,
      })
    : null
  const inventaDinheiro = Boolean(efeito?.inventaDinheiro)
  const devolveDinheiro = Boolean(efeito && efeito.diferenca < -0.004)

  // Entrada e saída falam línguas diferentes: "recebido" numa despesa é "pago".
  const movimentados = lancamento.tipo === 'entrada' ? 'recebidos' : 'pagos'
  /*
   * Desmarcar recebimento nem sempre derruba saldo, e essa diferença precisa
   * aparecer no texto — não só no número.
   *
   * Lançamento com `recebido` e sem `baixado_em` é dinheiro que nenhuma view de
   * saldo soma (regra 1 de `efeitoDoParcelamento`). Na base real são três, e
   * todos parceláveis: LC-00013, LC-00014 e LC-00018, R$ 669,00 / R$ 200,00 /
   * R$ 150,00 de baixa parcial no Sicoob. Parcelar qualquer um deles com as
   * frases fixas de queda anunciava "o saldo cai" com o calculado exibindo o
   * MESMO número duas vezes — e ainda mandava conferir o "Calculado pelo ERP",
   * que também não se mexe. Prévia que erra a explicação queima a confiança nos
   * números que ela acerta.
   */
  const mexeEmSaldo = Boolean(
    efeito && (efeito.variacaoNoCalculado !== 0 || efeito.variacaoNoDisponivel !== 0),
  )
  /*
   * O aviso é montado aqui, e não no meio do JSX, porque são três frases
   * condicionais: o que muda no lançamento, o que muda no saldo calculado e o
   * que acontece (ou não) com o saldo exibido. Sem a conta — fora do provedor
   * de listas — sobra a primeira, que continua verdadeira.
   */
  const avisoDeSaldo: string[] = []
  /*
   * A guarda pergunta se o SALDO se mexe, não se o dinheiro desceu.
   *
   * Ela era `devolveDinheiro` sozinho, e isso abria um buraco silencioso.
   * Parcelar com K = N e data retroativa não muda o total recebido — a
   * diferença dá exatamente zero — mas muda a DATA da baixa, e data é metade
   * do que decide o saldo: `saldos_das_contas` só soma o que foi baixado
   * DEPOIS de `saldo_informado_para`. Medido num gêmeo descartável de
   * LC-00021 (saída de R$ 965,89 baixada em 16/08 no Rafael PF, saldo
   * informado para 15/08): parcelar em 2x com as duas recebidas em 10/08
   * fazia a despesa deixar de ser descontada e o saldo EXIBIDO subir
   * R$ 965,89 — sem uma palavra no diálogo, e com o botão dizendo
   * "Criar 2 parcelas, 2 recebidas".
   *
   * `mexeEmSaldo` já existia e era consultado só DENTRO deste if, ou seja,
   * nunca chegava a proteger o caso em que a diferença é zero.
   */
  if (efeito && (devolveDinheiro || mexeEmSaldo)) {
    if (devolveDinheiro)
      avisoDeSaldo.push(
        `O ERP tem ${brl(lancamento.recebido)} marcados como ${movimentados} neste lançamento e passa a ter ${brl(recebidoAgora)} — ${brl(lancamento.recebido - recebidoAgora)} a menos, que é o dinheiro que ainda não entrou.`,
      )
    if (conta && mexeEmSaldo) {
      const calculadoDepois = conta.saldoCalculado + efeito.variacaoNoCalculado
      avisoDeSaldo.push(
        `Saldo calculado de ${conta.nome}: ${brl(conta.saldoCalculado)} → ${brl(calculadoDepois)}.`,
      )
      avisoDeSaldo.push(
        efeito.variacaoNoDisponivel === 0 && conta.saldoInformadoPara
          ? `O saldo exibido em Contas e Caixas (${brl(conta.saldoDisponivel)}) NÃO muda: ele foi informado à mão para ${diaPt(conta.saldoInformadoPara)} e só soma baixas posteriores a essa data. Quem ${efeito.variacaoNoCalculado > 0 ? 'sobe' : 'cai'} é o número da conferência, "${ROTULO_ORIGEM_SALDO.calculado}".`
          : `O saldo exibido de ${conta.nome} vai de ${brl(conta.saldoDisponivel)} para ${brl(conta.saldoDisponivel + efeito.variacaoNoDisponivel)}.`,
      )
    } else if (conta) {
      avisoDeSaldo.push(
        `Nenhum saldo de ${conta.nome} se mexe: este recebimento está gravado sem data de baixa, e conta só soma linha baixada — ele nunca chegou a entrar nos ${brl(conta.saldoDisponivel)} exibidos nem no calculado.`,
      )
    }
  }

  const confirmar = () =>
    iniciar(async () => {
      // A recusa já está escrita na tela, com a mesma frase que o banco usaria;
      // a viagem ao servidor só voltaria com ela traduzida de plpgsql.
      if (!plano.ok) {
        setErro(plano.erro)
        return
      }
      setErro(null)
      const r = await parcelarLancamento(lancamento.id, n, dias, k, k > 0 ? recebidasEm : null)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Parcelar" largura={520} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Parcelar compromisso</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`${lancamento.descricao} · ${brl(lancamento.valor)}. O lançamento original é cancelado e substituído pelas parcelas — a competência de todas continua sendo ${lancamento.competencia.slice(0, 7)}, porque o fato aconteceu uma vez só.`}
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Parcelas" dica={`De ${MIN_PARCELAS} a ${MAX_PARCELAS}`}>
            <input value={parcelas} onChange={(e) => setParcelas(e.target.value)} inputMode="numeric" style={CAMPO} />
          </Campo>
          <Campo rotulo="Intervalo (dias)" dica="Dias corridos — 30 é o padrão do boleto mensal">
            <input value={intervalo} onChange={(e) => setIntervalo(e.target.value)} inputMode="numeric" style={CAMPO} />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo
            rotulo="Já recebidas"
            dica="Quantas das PRIMEIRAS parcelas já entraram na conta. Zero é o parcelamento de sempre, inteiro em aberto."
          >
            <input
              value={jaRecebidas}
              onChange={(e) => setJaRecebidas(e.target.value)}
              inputMode="numeric"
              style={CAMPO}
            />
          </Campo>
          <Campo
            rotulo="Recebidas em"
            dica={
              k > 0
                ? 'O dia em que o dinheiro caiu na conta, que quase sempre é retroativo — é esta data que o fluxo de caixa usa'
                : 'Só vale com "Já recebidas" maior que zero'
            }
          >
            <input
              type="date"
              value={recebidasEm}
              onChange={(e) => setRecebidasEm(e.target.value)}
              disabled={k === 0}
              style={{ ...CAMPO, opacity: k === 0 ? 0.4 : 1 }}
            />
          </Campo>
        </div>

        {plano.ok ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* O rótulo diz o total, não "N× de X": quando a divisão não fecha
                redonda não existe um "de X" único, e é justamente essa mentira
                que a cópia antiga da conta contava. */}
            <Rotulo>{`Cronograma — ${n}× · ${brl(lancamento.valor)}`}</Rotulo>
            <Previa
              rolagem
              linhas={[
                ...plano.parcelas.map((p) => ({
                  rotulo: p.recebidaEm
                    ? `${p.numero}/${n} · RECEBIDA em ${diaPt(p.recebidaEm)}`
                    : `${p.numero}/${n} · vence ${diaPt(p.venceEm)}`,
                  valor: brl(p.valor),
                  tom: p.recebidaEm ? COR.ok : undefined,
                })),
                { rotulo: 'Soma das parcelas', valor: brl(lancamento.valor), tom: COR.ok },
                ...(k > 0
                  ? [
                      { rotulo: 'Já no caixa', valor: brl(plano.recebido), tom: COR.ok },
                      { rotulo: 'Ainda a receber', valor: brl(plano.emAberto), tom: COR.ouro },
                    ]
                  : []),
              ]}
            />
            {inventaDinheiro && (
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
              >
                {`Isto marcaria ${brl(recebidoAgora)} como ${movimentados}, e este lançamento só tem ${brl(lancamento.recebido)} ${movimentados} — seria uma entrada que o extrato nunca teve. O banco vai recusar; reduza "Já recebidas".`}
              </span>
            )}
            {/* O saldo cai, e o dono precisa ver QUANTO e POR QUÊ antes de
                confirmar — não descobrir depois, conferindo o extrato. É um
                bloco destacado, e não mais uma linha de prévia, porque é a
                única consequência deste diálogo que sai do lançamento e chega
                na conta. */}
            {avisoDeSaldo.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '11px 13px',
                  border: `1px solid ${COR.atencao}`,
                  borderRadius: 10,
                  background: 'rgba(217,140,63,.08)',
                }}
              >
                <span className="font-sans" style={{ fontSize: 11.5, fontWeight: 600, color: COR.atencao }}>
                  {mexeEmSaldo
                    ? `O saldo ${conta ? `de ${conta.nome} ` : ''}${(efeito?.variacaoNoCalculado ?? 0) > 0 || (efeito?.variacaoNoDisponivel ?? 0) > 0 ? 'SOBE' : 'cai'} com este parcelamento`
                    : 'Este parcelamento desmarca dinheiro que já estava fora dos saldos'}
                </span>
                {avisoDeSaldo.map((frase) => (
                  <span
                    key={frase}
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
                  >
                    {frase}
                  </span>
                ))}
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                >
                  {/* A narrativa segue o SINAL. Ela era fixa em "a queda é o
                      conserto" e aparecia inclusive quando o saldo SUBIA —
                      números certos, história invertida, que é o jeito mais
                      rápido de queimar a confiança nos números que a prévia
                      acerta. Subir merece frase de alerta, não de conforto:
                      dinheiro que aparece no caixa por causa de uma data
                      escolhida na tela é a coisa que mais precisa de um
                      segundo olhar antes do clique. */}
                  {!mexeEmSaldo
                    ? 'O conserto é no lançamento, não no caixa: o dinheiro entra no saldo no dia em que a parcela for baixada com data.'
                    : (efeito?.variacaoNoCalculado ?? 0) > 0 || (efeito?.variacaoNoDisponivel ?? 0) > 0
                      ? 'O saldo SOBE porque as datas de baixa que você escolheu passam a contar para a conta. Confira se esse dinheiro entrou mesmo nesses dias — o extrato do banco é quem decide, não esta tela.'
                      : 'A queda é o conserto, não um efeito colateral: esse dinheiro não tinha entrado. Ele volta ao saldo quando a parcela em aberto for baixada.'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <Erro texto={plano.erro} />
        )}

        <Erro texto={erro} />
        <Rodape
          rotulo={k > 0 ? `Criar ${n} parcelas, ${k} recebida${k > 1 ? 's' : ''}` : `Criar ${n} parcelas`}
          aoConfirmar={confirmar}
          aoCancelar={aoFechar}
          pendente={pendente}
        />
      </div>
    </Modal>
  )
}

/**
 * Apaga o que foi lançado por engano.
 *
 * O diálogo é irmão do Cancelar de propósito, e a diferença está escrita nele:
 * cancelar guarda a linha com o desfecho; excluir tira do caminho o que nunca
 * aconteceu. O motivo é opcional aqui — quem apaga um erro de digitação não
 * tem uma história para contar, e exigir uma faria o operador inventar texto
 * para conseguir seguir em frente. O rastro fica de qualquer jeito: o banco
 * copia o lançamento inteiro para a auditoria antes de apagar.
 */
function DialogoExcluir({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  aoFechar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await excluirLancamento(lancamento.id, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Excluir lançamento" largura={480} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Excluir lançamento</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`"${lancamento.descricao}" (${brl(lancamento.valor)}) sai do ERP e não volta. Use isto para o lançamento digitado por engano — se ele existiu de verdade e não vai mais acontecer, o caminho é Cancelar, que guarda a linha com o motivo.`}
        </span>
        {lancamento.parcelas && lancamento.parcelas > 1 && (
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.55, color: COR.atencao, textWrap: 'pretty' }}
          >
            {`Este lançamento faz parte de um parcelamento de ${lancamento.parcelas} vezes — a série INTEIRA será apagada. Apagar uma parcela sozinha deixaria um parcelamento que não soma o total.`}
          </span>
        )}

        <Campo rotulo="Motivo" dica="Opcional — fica guardado na auditoria">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Lancei errado, era parcelamento…"
            style={CAMPO}
          />
        </Campo>

        <Erro texto={erro} />
        <Rodape
          rotulo="Excluir de vez"
          aoConfirmar={confirmar}
          aoCancelar={aoFechar}
          pendente={pendente}
          destrutivo
        />
      </div>
    </Modal>
  )
}

function DialogoCancelar({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  aoFechar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await cancelarCompromisso(lancamento.id, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Cancelar compromisso" largura={480} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Cancelar compromisso</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`"${lancamento.descricao}" sai da fila de trabalho e da projeção de caixa, mas continua no histórico com o motivo — quem perguntar depois o que aconteceu com ele terá resposta.`}
        </span>

        <Campo rotulo="Motivo">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Boleto duplicado, serviço cancelado…"
            style={CAMPO}
          />
        </Campo>

        <Erro texto={erro} />
        <Rodape
          rotulo="Cancelar compromisso"
          aoConfirmar={confirmar}
          aoCancelar={aoFechar}
          pendente={pendente}
          destrutivo
        />
      </div>
    </Modal>
  )
}

export { CAMPO, Campo, Erro, Previa, Rodape, MiniBotao }
