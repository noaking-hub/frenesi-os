'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, parseNum, ROTULO_NATUREZA, saldoAberto } from '@/domain'
import type {
  CategoriaGerencial,
  ContaFinanceira,
  LancamentoGerencial,
  SituacaoLancamento,
} from '@/domain'

import {
  baixarComEncargos,
  cancelarCompromisso,
  criarCompromisso,
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

const hoje = () => new Date().toISOString().slice(0, 10)
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

/** Prévia do que vai ser gravado — o número antes do clique. */
function Previa({ linhas }: { linhas: { rotulo: string; valor: string; tom?: string }[] }) {
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
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

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
        valor: parseNum(valor),
        competencia,
        venceEm,
        documento,
        observacao,
        recorrencia: recorrencia || null,
        recorrenciaAte: recorrenciaAte || null,
        baixadoNoAto: baixado,
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
              <Campo rotulo="Valor">
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
                  { rotulo: 'Valor', valor: brl(parseNum(valor)), tom: tipo === 'entrada' ? COR.ok : COR.erro },
                  { rotulo: 'Entra no resultado de', valor: competencia },
                  { rotulo: 'Entra no caixa em', valor: baixado ? venceEm : `${venceEm} (previsto)` },
                ]}
              />
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
  const [aberto, setAberto] = useState<'baixa' | 'parcelar' | 'cancelar' | null>(null)
  const encerrado = situacao === 'liquidado' || situacao === 'cancelado'

  return (
    <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
      {!encerrado && (
        <MiniBotao onClick={() => setAberto('baixa')} destaque>
          Dar baixa
        </MiniBotao>
      )}
      {!encerrado && !lancamento.parcela && !lancamento.transferenciaId && (
        <MiniBotao onClick={() => setAberto('parcelar')}>Parcelar</MiniBotao>
      )}
      {!encerrado && <MiniBotao onClick={() => setAberto('cancelar')}>Cancelar</MiniBotao>}
      {encerrado && (
        <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
          {situacao === 'cancelado' ? 'cancelado' : lancamento.baixadoEm ?? 'liquidado'}
        </span>
      )}

      {aberto === 'baixa' && (
        <DialogoBaixa lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
      {aberto === 'parcelar' && (
        <DialogoParcelar lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
      {aberto === 'cancelar' && (
        <DialogoCancelar lancamento={lancamento} aoFechar={() => setAberto(null)} />
      )}
    </span>
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

function DialogoParcelar({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoGerencial
  aoFechar: () => void
}) {
  const [parcelas, setParcelas] = useState('2')
  const [intervalo, setIntervalo] = useState('30')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const n = Math.max(2, Math.min(48, Math.round(parseNum(parcelas))))
  const cada = Math.trunc((lancamento.valor / n) * 100) / 100
  const resto = Math.round((lancamento.valor - cada * n) * 100) / 100

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await parcelarLancamento(lancamento.id, n, Math.round(parseNum(intervalo)) || 30)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Parcelar" largura={500} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Parcelar compromisso</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {`${lancamento.descricao} · ${brl(lancamento.valor)}. O lançamento original é cancelado e substituído pelas parcelas — a competência de todas continua sendo ${lancamento.competencia.slice(0, 7)}, porque o fato aconteceu uma vez só.`}
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Parcelas">
            <input value={parcelas} onChange={(e) => setParcelas(e.target.value)} inputMode="numeric" style={CAMPO} />
          </Campo>
          <Campo rotulo="Intervalo (dias)" dica="30 dias é o padrão do boleto mensal">
            <input value={intervalo} onChange={(e) => setIntervalo(e.target.value)} inputMode="numeric" style={CAMPO} />
          </Campo>
        </div>

        <Previa
          linhas={[
            { rotulo: `${n}× de`, valor: brl(cada) },
            ...(resto > 0
              ? [{ rotulo: 'Diferença de arredondamento na 1ª', valor: brl(resto), tom: COR.ouro }]
              : []),
            { rotulo: 'Soma das parcelas', valor: brl(lancamento.valor) },
          ]}
        />

        <Erro texto={erro} />
        <Rodape rotulo={`Criar ${n} parcelas`} aoConfirmar={confirmar} aoCancelar={aoFechar} pendente={pendente} />
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
