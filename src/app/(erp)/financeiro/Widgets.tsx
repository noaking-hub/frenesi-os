'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { parseNum } from '@/domain'
import { brl, saldoEmAberto } from '@/domain'
import type {
  CategoriaFinanceira,
  ContaBancaria,
  Lancamento,
  NaturezaCategoria,
} from '@/domain'

import {
  conciliarRepasse,
  criarCategoria,
  criarConta,
  criarLancamento,
  darBaixa,
  editarConta,
  editarLancamento,
  estornarRecebimento,
  excluirLancamento,
  preverRepasses,
  registrarRecebimento,
  removerConta,
} from './actions'

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

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
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

function Confirmar({
  rotulo,
  onClick,
  pendente,
  desabilitado,
}: {
  rotulo: string
  onClick: () => void
  pendente: boolean
  desabilitado?: boolean
}) {
  const travado = pendente || desabilitado
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={travado}
      className="botao-ouro font-sans hover:brightness-[1.07]"
      style={{
        height: 36,
        padding: '0 18px',
        fontWeight: 700,
        fontSize: 11.5,
        lineHeight: 1,
        borderRadius: 9,
        whiteSpace: 'nowrap',
        cursor: pendente ? 'wait' : desabilitado ? 'not-allowed' : 'pointer',
        opacity: travado ? 0.5 : 1,
      }}
    >
      {pendente ? 'Salvando…' : rotulo}
    </button>
  )
}

const hoje = () => new Date().toISOString().slice(0, 10)

/** Cadências que o banco aceita. A lista aqui e o CHECK lá precisam bater. */
const CADENCIAS = [
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
  { valor: 'bimestral', rotulo: 'A cada 2 meses' },
  { valor: 'trimestral', rotulo: 'A cada 3 meses' },
  { valor: 'semestral', rotulo: 'A cada 6 meses' },
  { valor: 'anual', rotulo: 'Todo ano' },
] as const

/**
 * Novo lançamento.
 *
 * A baixa é uma pergunta explícita, e não algo deduzido da data: lançar hoje
 * uma conta que só será paga na semana que vem é o caso comum, e assumir que
 * "hoje = pago" inflaria o saldo do caixa com dinheiro que não saiu.
 */
export function NovoLancamento({
  contas,
  categorias,
}: {
  contas: ContaBancaria[]
  categorias: CategoriaFinanceira[]
}) {
  const [aberto, setAberto] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState(categorias[0]?.nome ?? '')
  const [contaId, setContaId] = useState(contas.find((c) => c.principal)?.id ?? contas[0]?.id ?? '')
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('saida')
  const [valor, setValor] = useState('')
  const [ocorridoEm, setOcorridoEm] = useState(hoje())
  const [venceEm, setVenceEm] = useState('')
  const [baixado, setBaixado] = useState(false)
  const [recorrente, setRecorrente] = useState(false)
  // Quanto já entrou, quando não foi tudo. Vazio significa "nada ainda", e
  // `baixado` continua sendo o atalho para "entrou tudo".
  const [recebido, setRecebido] = useState('')
  const [recorrencia, setRecorrencia] = useState('')
  const [recorrenciaAte, setRecorrenciaAte] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  // Categoria de despesa em lançamento de entrada é erro de digitação
  // oferecido como opção. Dinheiro entrando só pode ser receita; dinheiro
  // saindo, qualquer coisa menos receita.
  const doTipo = categorias.filter((c) =>
    tipo === 'entrada' ? c.natureza === 'Receita' : c.natureza !== 'Receita',
  )

  // Trocar o tipo com uma categoria do outro lado selecionada gravaria a
  // categoria errada sem ninguém ver. Escolher a primeira válida é o que
  // mantém o formulário sempre coerente consigo mesmo.
  const categoriaValida = doTipo.some((c) => c.nome === categoria)
    ? categoria
    : (doTipo[0]?.nome ?? '')

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      if (!categoriaValida) {
        setErro(
          tipo === 'entrada'
            ? 'Não há categoria de receita cadastrada. Crie uma em Financeiro → Categorias com natureza Receita.'
            : 'Não há categoria de despesa cadastrada.',
        )
        return
      }
      const r = await criarLancamento({
        descricao,
        categoria: categoriaValida,
        contaId,
        tipo,
        valor: parseNum(valor),
        ocorridoEm,
        venceEm,
        baixado,
        recorrente: recorrente || Boolean(recorrencia),
        recebido: recebido.trim() === '' ? null : parseNum(recebido),
        recorrencia: recorrencia || null,
        recorrenciaAte: recorrenciaAte || null,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDescricao('')
      setValor('')
      setRecebido('')
      setAberto(false)
    })

  return (
    <>
      <BotaoOuro altura={34} onClick={() => setAberto(true)}>
        + Novo lançamento
      </BotaoOuro>

      {aberto && (
        <Modal titulo="Novo lançamento" largura={560} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>Novo lançamento</TituloSecao>

          <Campo rotulo="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Assinatura da ferramenta de e-mail"
              autoFocus
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Tipo">
              <div style={{ display: 'flex', gap: 8 }}>
                {(['saida', 'entrada'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="hover:border-ouro/40 font-sans"
                    style={{
                      flex: 1,
                      height: 38,
                      border: `1px solid ${tipo === t ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                      background: tipo === t ? 'rgba(239,209,140,.09)' : 'transparent',
                      color: tipo === t ? COR.ouro : 'rgba(242,237,227,.65)',
                      fontWeight: 600,
                      fontSize: 11.5,
                      borderRadius: 9,
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'saida' ? 'Saída' : 'Entrada'}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                inputMode="decimal"
                placeholder="0,00"
                className="font-mono focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Categoria">
              <select
                value={categoriaValida}
                onChange={(e) => setCategoria(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                {doTipo.length === 0 && (
                  <option value="">
                    {tipo === 'entrada' ? 'Nenhuma categoria de receita' : 'Nenhuma categoria'}
                  </option>
                )}
                {doTipo.map((c) => (
                  <option key={c.nome} value={c.nome}>
                    {`${c.nome} · ${c.natureza}`}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Conta">
              <select
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                {contas.length === 0 && <option value="">Nenhuma conta cadastrada</option>}
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.nome} · ${c.banco}`}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Data do lançamento">
              <input
                type="date"
                value={ocorridoEm}
                onChange={(e) => setOcorridoEm(e.target.value)}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417' }}
              />
            </Campo>
            <Campo rotulo="Vencimento (opcional)">
              <input
                type="date"
                value={venceEm}
                onChange={(e) => setVenceEm(e.target.value)}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417' }}
              />
            </Campo>
          </div>

          <Linha
            titulo="Já foi pago ou recebido"
            explicacao="Só o que tem baixa entra no saldo da conta. Sem baixa, o lançamento fica na fila e vira “A pagar” ou “Vencido” conforme o vencimento."
            ligado={baixado}
            onChange={setBaixado}
          />

          <Campo rotulo="Já entrou parte (opcional)">
            <input
              value={recebido}
              onChange={(e) => setRecebido(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder="0,00"
              className="font-mono focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Para venda parcelada: o valor acima é o total combinado e aqui vai o que já entrou. O
            que falta aparece em “a receber” até ser quitado, em vez de virar três lançamentos
            soltos que ninguém sabe serem a mesma venda.
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Repetir">
              <select
                value={recorrencia}
                onChange={(e) => setRecorrencia(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                <option value="">Não repete</option>
                {CADENCIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Repetir até (opcional)">
              <input
                type="date"
                value={recorrenciaAte}
                onChange={(e) => setRecorrenciaAte(e.target.value)}
                disabled={!recorrencia}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417', opacity: recorrencia ? 1 : 0.45 }}
              />
            </Campo>
          </div>
          {recorrencia && (
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              As próximas ocorrências são criadas como lançamentos de verdade, em aberto — dá para
              ajustar o valor de uma, baixar outra e apagar a terceira sem mexer nas demais. Sem
              data-limite, vai até um ano à frente.
            </span>
          )}

          <Linha
            titulo="Recorrente"
            explicacao="Marca a despesa como fixa no KPI de recorrentes, mesmo sem gerar ocorrências futuras."
            ligado={recorrente || Boolean(recorrencia)}
            onChange={setRecorrente}
          />

          <Erro texto={erro} />

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Criar lançamento"
              onClick={salvar}
              pendente={pendente}
              desabilitado={!descricao.trim() || parseNum(valor) <= 0}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

function Linha({
  titulo,
  explicacao,
  ligado,
  onChange,
}: {
  titulo: string
  explicacao: string
  ligado: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 13px',
        borderRadius: 10,
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}>
          {titulo}
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {explicacao}
        </span>
      </span>
      <Switch ligado={ligado} onChange={onChange} label={titulo} />
    </div>
  )
}

/** Baixa de um lançamento, direto na linha da tabela. */
/**
 * Ações de um lançamento: receber, editar, excluir.
 *
 * Tudo num menu só porque a coluna de ação tem largura de um botão, e três
 * botões lado a lado empurrariam o valor para fora da tela nas resoluções
 * onde este ERP de fato é usado.
 */
export function AcoesLancamento({
  lancamento,
  contas,
  categorias,
}: {
  lancamento: Lancamento
  contas: ContaBancaria[]
  categorias: CategoriaFinanceira[]
}) {
  const [modal, setModal] = useState<'receber' | 'editar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const falta = saldoEmAberto(lancamento)
  const entrada = lancamento.tipo === 'entrada'

  // ── Receber ──────────────────────────────────────────────────────────────
  const [quanto, setQuanto] = useState(String(falta).replace('.', ','))
  const [quando, setQuando] = useState(hoje())

  const receber = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await registrarRecebimento(lancamento.id, parseNum(quanto), quando)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setModal(null)
    })

  const estornar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      if (!window.confirm(`Desfazer os recebimentos de "${lancamento.descricao}"?`)) return
      const r = await estornarRecebimento(lancamento.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setModal(null)
    })

  // ── Editar ───────────────────────────────────────────────────────────────
  const [descricao, setDescricao] = useState(lancamento.descricao)
  const [categoria, setCategoria] = useState(lancamento.categoriaId)
  const [contaId, setContaId] = useState(lancamento.contaId)
  const [tipo, setTipo] = useState<'entrada' | 'saida'>(lancamento.tipo)
  const [valor, setValor] = useState(String(lancamento.valor).replace('.', ','))
  const [ocorridoEm, setOcorridoEm] = useState(lancamento.ocorridoEm)
  const [venceEm, setVenceEm] = useState(lancamento.venceEm ?? '')
  const [serie, setSerie] = useState(false)

  const doTipo = categorias.filter((c) =>
    tipo === 'entrada' ? c.natureza === 'Receita' : c.natureza !== 'Receita',
  )
  const categoriaValida = doTipo.some((c) => c.nome === categoria)
    ? categoria
    : (doTipo[0]?.nome ?? '')

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await editarLancamento(lancamento.id, {
        descricao,
        categoria: categoriaValida,
        contaId,
        tipo,
        valor: parseNum(valor),
        ocorridoEm,
        venceEm,
        serie,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setModal(null)
    })

  const excluir = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const aviso = lancamento.serieId
        ? `Excluir "${lancamento.descricao}"?\n\nOK apaga ${serie ? 'esta E as próximas ocorrências ainda não recebidas' : 'só esta ocorrência'}.`
        : `Excluir "${lancamento.descricao}"?`
      if (!window.confirm(aviso)) return
      const r = await excluirLancamento(lancamento.id, serie)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setModal(null)
    })

  return (
    <>
      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {falta > 0 && (
          <BotaoSecundario altura={27} onClick={() => setModal('receber')}>
            {entrada ? 'Receber' : 'Pagar'}
          </BotaoSecundario>
        )}
        <BotaoSecundario altura={27} onClick={() => setModal('editar')}>
          Editar
        </BotaoSecundario>
      </span>

      {modal === 'receber' && (
        <Modal
          titulo={entrada ? 'Registrar recebimento' : 'Registrar pagamento'}
          largura={440}
          aoFechar={() => setModal(null)}
        >
          <TituloSecao tamanho={15}>{lancamento.descricao}</TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-secundario)' }}
          >
            {`Combinado ${brl(lancamento.valor)} · já ${entrada ? 'entrou' : 'saiu'} ${brl(lancamento.recebido)} · faltam `}
            <strong style={{ color: COR.ouro }}>{brl(falta)}</strong>
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo={entrada ? 'Quanto entrou (R$)' : 'Quanto saiu (R$)'}>
              <input
                value={quanto}
                onChange={(e) => setQuanto(e.target.value.replace(/[^0-9.,]/g, ''))}
                inputMode="decimal"
                autoFocus
                className="font-mono focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
            <Campo rotulo="Quando">
              <input
                type="date"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417' }}
              />
            </Campo>
          </div>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Pode ser menos que o total. O restante continua em aberto e aparece no “a receber” até
            ser quitado.
          </span>

          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            {lancamento.recebido > 0 && (
              <button
                type="button"
                onClick={estornar}
                disabled={pendente}
                className="font-sans"
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  fontSize: 11.5,
                  color: COR.erro,
                  cursor: pendente ? 'default' : 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Estornar tudo
              </button>
            )}
            <div style={{ flex: 1 }} />
            <BotaoSecundario altura={36} onClick={() => setModal(null)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar rotulo="Registrar" onClick={receber} pendente={pendente} />
          </div>
        </Modal>
      )}

      {modal === 'editar' && (
        <Modal titulo="Editar lançamento" largura={560} aoFechar={() => setModal(null)}>
          <TituloSecao tamanho={15}>Editar lançamento</TituloSecao>

          <Campo rotulo="Descrição">
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              autoFocus
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Tipo">
              <div style={{ display: 'flex', gap: 8 }}>
                {(['saida', 'entrada'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="hover:border-ouro/40 font-sans"
                    style={{
                      flex: 1,
                      height: 38,
                      border: `1px solid ${tipo === t ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                      background: tipo === t ? 'rgba(239,209,140,.09)' : 'transparent',
                      color: tipo === t ? COR.ouro : 'rgba(242,237,227,.65)',
                      fontWeight: 600,
                      fontSize: 11.5,
                      borderRadius: 9,
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'saida' ? 'Saída' : 'Entrada'}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Valor total (R$)">
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
                inputMode="decimal"
                className="font-mono focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
          </div>

          {lancamento.recebido > 0 && (
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
            >
              {`Já ${entrada ? 'entraram' : 'saíram'} ${brl(lancamento.recebido)} neste lançamento — o total não pode ficar abaixo disso. Para reduzir, estorne primeiro.`}
            </span>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Categoria">
              <select
                value={categoriaValida}
                onChange={(e) => setCategoria(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                {doTipo.map((c) => (
                  <option key={c.nome} value={c.nome}>
                    {`${c.nome} · ${c.natureza}`}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Conta">
              <select
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.nome} · ${c.banco}`}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Data do lançamento">
              <input
                type="date"
                value={ocorridoEm}
                onChange={(e) => setOcorridoEm(e.target.value)}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417' }}
              />
            </Campo>
            <Campo rotulo="Vencimento (opcional)">
              <input
                type="date"
                value={venceEm}
                onChange={(e) => setVenceEm(e.target.value)}
                className="font-mono focus:border-ouro/45"
                style={{ ...CAMPO, background: '#151417' }}
              />
            </Campo>
          </div>

          {lancamento.serieId && (
            <Linha
              titulo="Aplicar às próximas ocorrências"
              explicacao="Alcança só as futuras ainda não recebidas. As passadas ficam como estão — reescrever o aluguel de março porque o de setembro reajustou mudaria um fato já ocorrido."
              ligado={serie}
              onChange={setSerie}
            />
          )}

          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <button
              type="button"
              onClick={excluir}
              disabled={pendente}
              className="font-sans"
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                fontSize: 11.5,
                color: COR.erro,
                cursor: pendente ? 'default' : 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Excluir
            </button>
            <div style={{ flex: 1 }} />
            <BotaoSecundario altura={36} onClick={() => setModal(null)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Salvar"
              onClick={salvar}
              pendente={pendente}
              desabilitado={!descricao.trim()}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

export function BotaoBaixa({ id, descricao }: { id: string; descricao: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <button
      type="button"
      title={erro ?? undefined}
      aria-label={`Dar baixa em ${descricao}`}
      onClick={() =>
        iniciarTransicao(async () => {
          setErro(null)
          const r = await darBaixa(id)
          if (!r.ok) setErro(r.erro)
        })
      }
      disabled={pendente}
      className="font-sans hover:bg-[rgba(239,209,140,.16)]"
      style={{
        height: 27,
        padding: '0 11px',
        border: `1px solid ${erro ? 'rgba(194,90,80,.4)' : 'rgba(239,209,140,.28)'}`,
        background: erro ? 'rgba(194,90,80,.08)' : 'rgba(239,209,140,.07)',
        color: erro ? COR.erro : 'var(--color-ouro)',
        fontWeight: 600,
        fontSize: 10.5,
        lineHeight: 1,
        borderRadius: 7,
        cursor: pendente ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: pendente ? 0.6 : 1,
      }}
    >
      {pendente ? 'Baixando…' : erro ? 'Falhou' : 'Dar baixa'}
    </button>
  )
}

export function NovaConta() {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [banco, setBanco] = useState('')
  const [tipo, setTipo] = useState('Conta corrente')
  const [uso, setUso] = useState('')
  const [principal, setPrincipal] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await criarConta({ nome, tipo, banco, uso, principal })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setNome('')
      setBanco('')
      setAberto(false)
    })

  return (
    <>
      <BotaoSecundario altura={34} onClick={() => setAberto(true)}>
        + Nova conta
      </BotaoSecundario>

      {aberto && (
        <Modal titulo="Nova conta" largura={480} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>Nova conta</TituloSecao>
          <Campo rotulo="Nome">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Inter · operação"
              autoFocus
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Banco">
              <input
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                placeholder="Inter"
                className="font-sans focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
            <Campo rotulo="Tipo">
              <input
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="font-sans focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
          </div>
          <Campo rotulo="Para que serve">
            <input
              value={uso}
              onChange={(e) => setUso(e.target.value)}
              placeholder="Recebimento das vendas"
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <Linha
            titulo="Conta principal"
            explicacao="A que o ERP assume como padrão. Só pode haver uma — marcar esta desmarca a anterior."
            ligado={principal}
            onChange={setPrincipal}
          />
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            O saldo não é digitado: ele é a soma dos lançamentos baixados desta conta. Guardar o
            número aqui criaria uma segunda verdade que envelhece a cada baixa esquecida.
          </span>
          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Criar conta"
              onClick={salvar}
              pendente={pendente}
              desabilitado={!nome.trim() || !banco.trim()}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * Editar a conta — inclusive apagá-la e informar o saldo real.
 *
 * O saldo é o campo que muda o comportamento do módulo inteiro. Vazio, o ERP
 * mostra o que conseguiu somar do extrato e diz que é uma leitura. Preenchido,
 * ele passa a mostrar o número que você digitou, com a data em que digitou —
 * porque a conta do Mercado Pago não entrega saldo por API (responde 403), e
 * fingir que a soma é o saldo foi como o ERP chegou a mostrar R$ 83 mil numa
 * conta com R$ 10 mil.
 */
export function EditarConta({ conta }: { conta: ContaBancaria }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState(conta.nome)
  const [banco, setBanco] = useState(conta.banco)
  const [tipo, setTipo] = useState(conta.tipo)
  const [uso, setUso] = useState(conta.uso)
  const [principal, setPrincipal] = useState(conta.principal)
  const [saldo, setSaldo] = useState(
    conta.saldoInformado === null ? '' : String(conta.saldoInformado).replace('.', ','),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const informado = saldo.trim() === '' ? null : parseNum(saldo)
      if (informado !== null && !Number.isFinite(informado)) {
        setErro('O saldo precisa ser um número. Deixe vazio para voltar a usar a soma do extrato.')
        return
      }
      const r = await editarConta(conta.id, {
        nome,
        tipo,
        banco,
        uso,
        principal,
        saldoInformado: informado,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
    })

  const remover = () =>
    iniciarTransicao(async () => {
      setErro(null)
      if (!window.confirm(`Remover a conta "${conta.nome}"?`)) return
      const r = await removerConta(conta.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
    })

  return (
    <>
      <BotaoSecundario altura={26} onClick={() => setAberto(true)}>
        Editar
      </BotaoSecundario>

      {aberto && (
        <Modal titulo={`Editar ${conta.nome}`} largura={480} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>{`Editar ${conta.nome}`}</TituloSecao>
          <Campo rotulo="Nome">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo rotulo="Banco">
              <input
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                className="font-sans focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
            <Campo rotulo="Tipo">
              <input
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="font-sans focus:border-ouro/45"
                style={CAMPO}
              />
            </Campo>
          </div>
          <Campo rotulo="Para que serve">
            <input
              value={uso}
              onChange={(e) => setUso(e.target.value)}
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>

          <Campo rotulo="Saldo real da conta (opcional)">
            <input
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              placeholder="10788,55"
              inputMode="decimal"
              className="font-mono focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Preencha com o saldo que aparece no app do banco ou do gateway. Enquanto estiver vazio, o
            ERP mostra a soma do extrato e avisa que é leitura, não saldo. O Mercado Pago não
            entrega saldo por API — este campo existe por causa disso.
          </span>

          <Linha
            titulo="Conta principal"
            explicacao="A que o ERP assume como padrão. Só pode haver uma — marcar esta desmarca a anterior."
            ligado={principal}
            onChange={setPrincipal}
          />

          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <button
              type="button"
              onClick={remover}
              disabled={pendente}
              className="font-sans"
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                fontSize: 11.5,
                color: COR.erro,
                cursor: pendente ? 'default' : 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Remover conta
            </button>
            <div style={{ flex: 1 }} />
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Salvar"
              onClick={salvar}
              pendente={pendente}
              desabilitado={!nome.trim()}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

const NATUREZAS: NaturezaCategoria[] = ['Receita', 'Custo variável', 'Despesa fixa', 'Despesa']

export function NovaCategoria() {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [natureza, setNatureza] = useState<NaturezaCategoria>('Despesa')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await criarCategoria({ nome, natureza })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setNome('')
      setAberto(false)
    })

  return (
    <>
      <BotaoSecundario altura={34} onClick={() => setAberto(true)}>
        + Nova categoria
      </BotaoSecundario>

      {aberto && (
        <Modal titulo="Nova categoria" largura={460} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>Nova categoria</TituloSecao>
          <Campo rotulo="Nome">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Embalagem de presente"
              autoFocus
              className="font-sans focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Rotulo>Natureza</Rotulo>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {NATUREZAS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNatureza(n)}
                  className="hover:border-ouro/40 font-sans"
                  style={{
                    height: 32,
                    padding: '0 13px',
                    border: `1px solid ${natureza === n ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                    background: natureza === n ? 'rgba(239,209,140,.09)' : 'transparent',
                    color: natureza === n ? COR.ouro : 'rgba(242,237,227,.65)',
                    fontWeight: 600,
                    fontSize: 11.5,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              Custo variável acompanha a venda; despesa fixa existe vendendo ou não. É essa divisão
              que sustenta o ponto de equilíbrio — classificar errado desloca a conta inteira.
            </span>
          </div>
          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Criar categoria"
              onClick={salvar}
              pendente={pendente}
              desabilitado={!nome.trim()}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/** Informa o crédito de um repasse e, de quebra, gera as previsões que faltam. */
export function ConciliarRepasse({ pedidoId, esperado }: { pedidoId: string; esperado: number }) {
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await conciliarRepasse(pedidoId, parseNum(valor))
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-sans hover:bg-[rgba(239,209,140,.16)]"
        style={{
          height: 27,
          padding: '0 11px',
          border: '1px solid rgba(239,209,140,.28)',
          background: 'rgba(239,209,140,.07)',
          color: 'var(--color-ouro)',
          fontWeight: 600,
          fontSize: 10.5,
          lineHeight: 1,
          borderRadius: 7,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Conciliar
      </button>

      {aberto && (
        <Modal titulo={`Conciliar ${pedidoId}`} largura={420} aoFechar={() => setAberto(false)}>
          <TituloSecao tamanho={15}>{`Repasse do pedido ${pedidoId}`}</TituloSecao>
          <Campo rotulo="Valor creditado na conta (R$)">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder={esperado.toFixed(2).replace('.', ',')}
              autoFocus
              className="font-mono focus:border-ouro/45"
              style={CAMPO}
            />
          </Campo>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Informe o que caiu de fato. A divergência não é digitada: ela é a comparação com o
            líquido esperado, calculada na leitura — assim mudar a taxa não reescreve o histórico.
          </span>
          <Erro texto={erro} />
          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setAberto(false)}>
              Cancelar
            </BotaoSecundario>
            <Confirmar
              rotulo="Gravar crédito"
              onClick={salvar}
              pendente={pendente}
              desabilitado={valor.trim() === ''}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/** Cria as linhas de repasse dos pedidos que ainda não têm previsão. */
export function PreverRepasses() {
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {(msg || erro) && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
        >
          {erro ?? msg}
        </span>
      )}
      <BotaoSecundario
        altura={34}
        onClick={() =>
          iniciarTransicao(async () => {
            setErro(null)
            setMsg(null)
            const r = await preverRepasses()
            if (!r.ok) {
              setErro(r.erro)
              return
            }
            setMsg(r.novos ? `${r.novos} previstos` : 'nada novo a prever')
          })
        }
      >
        {pendente ? 'Prevendo…' : 'Prever repasses dos pedidos'}
      </BotaoSecundario>
    </span>
  )
}
