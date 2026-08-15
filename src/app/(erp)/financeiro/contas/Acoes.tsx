'use client'

import { useState, useTransition } from 'react'

import { Ico, type NomeIcone } from '@/components/erp/IconesUi'
import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, TituloSecao } from '@/components/erp/primitivos'
import { BORDA, COR, FUNDO } from '@/components/erp/tokens'
import { brl, parseNum } from '@/domain'
import type { ContaFinanceira } from '@/domain'

import {
  informarSaldo,
  registrarTransferencia,
  removerConta,
  salvarConta,
  type DadosConta,
} from '../acoes-gerenciais'
import { CAMPO, Campo, Erro, Previa, Rodape } from '../Compromissos'

/**
 * Tile de atalho das "Movimentações rápidas" — a versão BOTÃO do atalho em
 * link da trilha. Existe aqui, e não no kit, porque só as ações de modal
 * desta tela precisam dele: o mockup desenha o mesmo tile para link e para
 * ação, e um botão inerte imitando link seria pior que a duplicação.
 */
function TileAtalho({
  icone,
  titulo,
  sub,
  onClick,
}: {
  icone: NomeIcone
  titulo: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans hover:border-ouro/40"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
        padding: '11px 12px',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 11,
        background: 'rgba(255,255,255,.015)',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: FUNDO.ouro,
            border: `1px solid ${BORDA.ouro}`,
            color: COR.ouro,
          }}
        >
          <Ico n={icone} tamanho={14} />
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'rgba(242,237,227,.3)', display: 'grid', placeItems: 'center' }}>
          <Ico n="seta-direita" tamanho={12} />
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(242,237,227,.88)' }}>
          {titulo}
        </span>
        <span style={{ fontSize: 9.5, lineHeight: 1.35, color: 'rgba(242,237,227,.4)' }}>{sub}</span>
      </span>
    </button>
  )
}

/** Transferência entre contas próprias — as duas pernas nascem juntas. */
export function Transferir({ contas, atalho }: { contas: ContaFinanceira[]; atalho?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [origem, setOrigem] = useState(contas[0]?.id ?? '')
  const [destino, setDestino] = useState(contas[1]?.id ?? '')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const contaOrigem = contas.find((c) => c.id === origem)
  const contaDestino = contas.find((c) => c.id === destino)
  const montante = parseNum(valor)

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await registrarTransferencia({
        contaOrigem: origem,
        contaDestino: destino,
        valor: montante,
        data,
        descricao,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setValor('')
      setDescricao('')
      setAberto(false)
    })

  return (
    <>
      {atalho ? (
        <TileAtalho
          icone="transferir"
          titulo="Transferir entre contas"
          sub="Entre suas contas e carteiras"
          onClick={() => setAberto(true)}
        />
      ) : (
        <BotaoOuro altura={32} onClick={() => setAberto(true)}>
          Transferir entre contas
        </BotaoOuro>
      )}

      {aberto && (
        <Modal titulo="Transferir entre contas" largura={540} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>Transferir entre contas</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              Transferência não é receita nem despesa: o dinheiro muda de bolso e o resultado do
              mês continua igual. O ERP grava as duas pernas ligadas, e a DRE as ignora.
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <Campo rotulo="Sai de" dica={contaOrigem ? `Saldo ${brl(contaOrigem.saldoDisponivel)}` : undefined}>
                <select value={origem} onChange={(e) => setOrigem(e.target.value)} style={CAMPO}>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Entra em" dica={contaDestino ? `Saldo ${brl(contaDestino.saldoDisponivel)}` : undefined}>
                <select value={destino} onChange={(e) => setDestino(e.target.value)} style={CAMPO}>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <Campo rotulo="Valor">
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" style={CAMPO} />
              </Campo>
              <Campo rotulo="Data">
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={CAMPO} />
              </Campo>
            </div>

            <Campo rotulo="Descrição">
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Transferência entre contas"
                style={CAMPO}
              />
            </Campo>

            {montante > 0 && contaOrigem && contaDestino && origem !== destino && (
              <Previa
                linhas={[
                  {
                    rotulo: `${contaOrigem.nome} fica com`,
                    valor: brl(contaOrigem.saldoDisponivel - montante),
                    tom: contaOrigem.saldoDisponivel - montante < 0 ? COR.erro : undefined,
                  },
                  { rotulo: `${contaDestino.nome} fica com`, valor: brl(contaDestino.saldoDisponivel + montante) },
                  { rotulo: 'Efeito no resultado do mês', valor: 'Nenhum', tom: COR.ok },
                ]}
              />
            )}

            <Erro texto={erro} />
            <Rodape
              rotulo="Registrar transferência"
              aoConfirmar={confirmar}
              aoCancelar={() => setAberto(false)}
              pendente={pendente}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * Informa o saldo que o app do banco mostra.
 *
 * A conta do Mercado Pago responde 403 no endpoint de saldo; sem um lugar
 * para digitar o número real, o ERP exibiria a soma do extrato como se fosse
 * saldo — que é sempre a foto do dia em que se leu, não a de agora.
 */
export function InformarSaldo({ conta, atalho }: { conta: ContaFinanceira; atalho?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState(
    conta.origemSaldo === 'informado' ? conta.saldoInformado.toFixed(2).replace('.', ',') : '',
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const informado = parseNum(valor)
  const diferenca = Math.round((informado - conta.saldoCalculado) * 100) / 100

  const gravar = (limpar: boolean) =>
    iniciar(async () => {
      setErro(null)
      const r = await informarSaldo(conta.id, limpar ? null : informado)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
    })

  return (
    <>
      {atalho ? (
        <TileAtalho
          icone="lapis"
          titulo="Registrar saldo"
          sub="Atualizar saldo manualmente"
          onClick={() => setAberto(true)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            color: 'var(--color-terciario)',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Informar saldo
        </button>
      )}

      {aberto && (
        <Modal titulo="Informar saldo" largura={470} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>{`Saldo de ${conta.nome}`}</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              Digite o saldo que o app do banco mostra agora. O ERP guarda a data da leitura e
              passa a exibir a diferença contra o que ele calculou do extrato — é essa diferença
              que revela lançamento faltando.
            </span>

            <Campo rotulo="Saldo no app do banco">
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" style={CAMPO} />
            </Campo>

            <Previa
              linhas={[
                { rotulo: 'Calculado pelo ERP', valor: brl(conta.saldoCalculado) },
                { rotulo: 'Informado agora', valor: brl(informado) },
                {
                  rotulo: 'Diferença a investigar',
                  valor: brl(diferenca),
                  tom: Math.abs(diferenca) > 0.05 ? COR.atencao : COR.ok,
                },
              ]}
            />

            <Erro texto={erro} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {conta.origemSaldo === 'informado' && (
                <button
                  type="button"
                  onClick={() => gravar(true)}
                  disabled={pendente}
                  className="font-sans hover:text-ouro"
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    color: 'var(--color-terciario)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Voltar ao calculado
                </button>
              )}
              <div style={{ flex: 1 }} />
              <Rodape
                rotulo="Gravar saldo"
                aoConfirmar={() => gravar(false)}
                aoCancelar={() => setAberto(false)}
                pendente={pendente}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ── Cadastro de conta ──────────────────────────────────────────────────────

const TIPOS = [
  'Conta corrente',
  'Conta poupança',
  'Carteira digital',
  'Gateway de pagamento',
  'Caixa de rendimento',
  'Dinheiro em espécie',
]

/** Paleta fixa: a cor identifica a conta no gráfico e nas barras. */
const CORES = ['#EFD18C', '#5FA97A', '#7BA7D4', '#C89BD9', '#E0A86D', '#6DC7C0', '#E06D6D']

export function NovaConta() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <BotaoOuro altura={32} onClick={() => setAberto(true)}>
        + Nova conta ou carteira
      </BotaoOuro>
      {aberto && <EditorConta conta={null} aoFechar={() => setAberto(false)} />}
    </>
  )
}

export function EditarConta({ conta }: { conta: ContaFinanceira }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-sans hover:text-ouro"
        style={{
          border: 0,
          background: 'transparent',
          padding: 0,
          color: 'var(--color-terciario)',
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Editar
      </button>
      {aberto && <EditorConta conta={conta} aoFechar={() => setAberto(false)} />}
    </>
  )
}

function EditorConta({
  conta,
  aoFechar,
}: {
  conta: ContaFinanceira | null
  aoFechar: () => void
}) {
  const [dados, setDados] = useState<DadosConta>({
    nome: conta?.nome ?? '',
    tipo: conta?.tipo ?? TIPOS[0],
    banco: conta?.banco ?? '',
    finalidade: conta?.finalidade ?? '',
    principal: conta?.principal ?? false,
    ativa: conta?.ativa ?? true,
    cor: conta?.cor ?? CORES[0],
  })
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const trocar = <K extends keyof DadosConta>(chave: K, valor: DadosConta[K]) =>
    setDados((d) => ({ ...d, [chave]: valor }))

  const salvar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await salvarConta(conta?.id ?? null, dados)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const apagar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await removerConta(conta!.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo={conta ? 'Editar conta' : 'Nova conta'} largura={560} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>{conta ? 'Editar conta' : 'Nova conta'}</TituloSecao>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Nome">
            <input
              value={dados.nome}
              onChange={(e) => trocar('nome', e.target.value)}
              placeholder="Sicoob PJ"
              style={CAMPO}
            />
          </Campo>
          <Campo rotulo="Banco ou instituição">
            <input
              value={dados.banco}
              onChange={(e) => trocar('banco', e.target.value)}
              placeholder="Sicoob · 756"
              style={CAMPO}
            />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Tipo">
            <select value={dados.tipo} onChange={(e) => trocar('tipo', e.target.value)} style={CAMPO}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Finalidade" dica="Para que esta conta serve na operação">
            <input
              value={dados.finalidade}
              onChange={(e) => trocar('finalidade', e.target.value)}
              placeholder="Operacional · fornecedores"
              style={CAMPO}
            />
          </Campo>
        </div>

        <Campo rotulo="Cor no gráfico">
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => trocar('cor', c)}
                aria-label={`Cor ${c}`}
                aria-pressed={dados.cor === c}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: c,
                  border: dados.cor === c ? '2px solid #F2EDE3' : '1px solid rgba(255,255,255,.14)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </span>
        </Campo>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dados.principal}
              onChange={(e) => trocar('principal', e.target.checked)}
              style={{ accentColor: '#EFD18C', width: 15, height: 15 }}
            />
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
              Conta principal
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dados.ativa}
              onChange={(e) => trocar('ativa', e.target.checked)}
              style={{ accentColor: '#EFD18C', width: 15, height: 15 }}
            />
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
              Ativa no caixa
            </span>
          </label>
        </div>

        <Erro texto={erro} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {conta && (
            <button
              type="button"
              onClick={apagar}
              disabled={pendente}
              className="font-sans hover:brightness-110"
              style={{
                height: 36,
                padding: '0 12px',
                border: `1px solid ${COR.erro}`,
                background: 'transparent',
                color: COR.erro,
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Excluir
            </button>
          )}
          <div style={{ flex: 1 }} />
          <Rodape
            rotulo={conta ? 'Salvar conta' : 'Criar conta'}
            aoConfirmar={salvar}
            aoCancelar={aoFechar}
            pendente={pendente}
          />
        </div>
      </div>
    </Modal>
  )
}
