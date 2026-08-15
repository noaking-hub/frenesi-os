'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { Ico, type NomeIcone } from '@/components/erp/IconesUi'
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
  editarLancamento,
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
  contas,
  categorias,
  centros,
}: {
  lancamento: LancamentoGerencial
  situacao: SituacaoLancamento
  /** Sem as listas não há como montar os seletores — o lápis some em vez de
      abrir um diálogo com combos vazios. */
  contas?: ContaFinanceira[]
  categorias?: CategoriaGerencial[]
  centros?: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState<'baixa' | 'parcelar' | 'cancelar' | 'editar' | null>(null)
  const encerrado = situacao === 'liquidado' || situacao === 'cancelado'
  // Liquidado ainda se edita — é o caso do que veio do extrato já baixado e
  // sem categoria. Cancelado não: o registro deixou de valer.
  const podeEditar = Boolean(contas && categorias) && situacao !== 'cancelado'

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
      {!encerrado && !lancamento.parcela && !lancamento.transferenciaId && (
        <BotaoIcone icone="calendario" rotulo="Parcelar" onClick={() => setAberto('parcelar')} />
      )}
      {!encerrado && (
        <BotaoIcone icone="x" rotulo="Cancelar compromisso" onClick={() => setAberto('cancelar')} />
      )}
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
