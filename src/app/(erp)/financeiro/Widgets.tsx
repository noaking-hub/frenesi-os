'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { parseNum } from '@/domain'
import type { CategoriaFinanceira, ContaBancaria, NaturezaCategoria } from '@/domain'

import { conciliarRepasse, criarCategoria, criarConta, criarLancamento, darBaixa, preverRepasses } from './actions'

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
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await criarLancamento({
        descricao,
        categoria,
        contaId,
        tipo,
        valor: parseNum(valor),
        ocorridoEm,
        venceEm,
        baixado,
        recorrente,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDescricao('')
      setValor('')
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
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="font-sans"
                style={{ ...CAMPO, background: '#151417' }}
              >
                {categorias.map((c) => (
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
          <Linha
            titulo="Recorrente"
            explicacao="Marca despesas que se repetem todo mês. Elas somam no KPI de recorrentes, que é a conta fixa da operação."
            ligado={recorrente}
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

const NATUREZAS: NaturezaCategoria[] = ['Custo variável', 'Despesa fixa', 'Despesa']

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
