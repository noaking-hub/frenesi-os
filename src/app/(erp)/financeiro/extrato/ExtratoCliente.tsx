'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import {
  Badge,
  BotaoOuro,
  BotaoSecundario,
  EstadoVazio,
  FaixaAlerta,
  Rotulo,
  TituloSecao,
  Valor,
} from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import { INICIO_DA_OPERACAO, brl, dataEmSaoPaulo, sugerirCategoria } from '@/domain'
import type { LinhaExtrato } from '@/domain'

import type { ConferenciaConta } from '@/data/extrato'
import type { RelatorioDisponivel } from '@/data/mercadopago'

import {
  atualizarExtrato,
  classificarLinha,
  diagnosticarGateway,
  ignorarLinha,
  importarExtratoCompleto,
  listarRelatoriosProntos,
  sondarExtratoCompleto,
  zerarFinanceiro,
  recasarExtrato,
  relerGateway,
  sincronizarGateway,
} from './actions'

const campo = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
} as const

const mono = {
  fontSize: 10,
  lineHeight: 1.6,
  color: 'rgba(242,237,227,.55)',
  whiteSpace: 'pre-wrap',
  textWrap: 'pretty',
} as const

/**
 * Hoje em São Paulo, não em UTC.
 *
 * Das 21h à meia-noite, `toISOString()` já devolve o dia seguinte — e o
 * Mercado Pago recusa relatório que termina amanhã. O extrato deixava de
 * atualizar toda noite, e só toda noite, que é o tipo de defeito que some
 * quando alguém vai conferir de manhã.
 */
function hoje(): string {
  return dataEmSaoPaulo(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Quanto a tela espera o Mercado Pago montar o extrato antes de desistir.
 *
 * 15 em 15 segundos por 6 minutos. O relatório costuma ficar pronto em menos
 * de um minuto; o teto existe para a tela parar de perguntar sozinha se a
 * pessoa esquecer a aba aberta, não porque 6 minutos signifique alguma coisa.
 */
const ESPERA_MS = 15_000
const MAX_ESPERAS = 24

/**
 * A partir de quantos minutos o extrato é considerado velho.
 *
 * Abrir a tela dispara a atualização sozinha quando passou disso. Dez minutos
 * porque cada atualização gera um relatório do lado do Mercado Pago: abrir a
 * tela cinco vezes seguidas não pode virar cinco relatórios, e ninguém precisa
 * do movimento do minuto anterior num extrato.
 */
const VALIDADE_MIN = 10

/** "há 3 min", "há 2 h", "ontem". Vago de propósito quando fica velho. */
function desdeQuando(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 0) return 'agora'
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

export interface FiltroAtual {
  situacao: 'a-decidir' | 'todas'
  tipo: string
  de: string
  ate: string
  busca: string
}

interface Props {
  linhas: LinhaExtrato[]
  total: number
  filtro: FiltroAtual
  contas: ConferenciaConta[]
  categorias: { nome: string; natureza: string }[]
  gatewayLigado: boolean
  /** Quando o extrato foi lido pela última vez. Null = nunca. */
  atualizadoEm: string | null
}

/**
 * Filtros do extrato, guardados na URL.
 *
 * Na URL e não no estado do componente por três motivos que aparecem no uso:
 * o filtro sobrevive ao F5 que toda classificação provoca, o link pode ser
 * mandado para outra pessoa, e o botão voltar do navegador desfaz o filtro em
 * vez de sair da tela.
 */
function Filtros({ filtro, total, mostrando }: { filtro: FiltroAtual; total: number; mostrando: number }) {
  const router = useRouter()
  const [busca, setBusca] = useState(filtro.busca)
  const [pendente, iniciar] = useTransition()

  const aplicar = useCallback(
    (mudanca: Partial<FiltroAtual>) => {
      const novo = { ...filtro, ...mudanca }
      const p = new URLSearchParams()
      if (novo.situacao === 'todas') p.set('situacao', 'todas')
      if (novo.tipo) p.set('tipo', novo.tipo)
      if (novo.de) p.set('de', novo.de)
      if (novo.ate) p.set('ate', novo.ate)
      if (novo.busca.trim()) p.set('busca', novo.busca.trim())
      const qs = p.toString()
      iniciar(() => router.replace(qs ? `/financeiro/extrato?${qs}` : '/financeiro/extrato'))
    },
    [filtro, router],
  )

  const limpo =
    filtro.situacao === 'a-decidir' && !filtro.tipo && !filtro.de && !filtro.ate && !filtro.busca

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Rotulo>Mostrar</Rotulo>
          <select
            value={filtro.situacao}
            onChange={(e) => aplicar({ situacao: e.target.value as FiltroAtual['situacao'] })}
            style={{ ...campo, minWidth: 178 }}
          >
            <option value="a-decidir">Só o que precisa de você</option>
            <option value="todas">Todo o movimento</option>
          </select>
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Rotulo>Direção</Rotulo>
          <select
            value={filtro.tipo}
            onChange={(e) => aplicar({ tipo: e.target.value })}
            style={{ ...campo, minWidth: 118 }}
          >
            <option value="">Entradas e saídas</option>
            <option value="entrada">Só entradas</option>
            <option value="saida">Só saídas</option>
          </select>
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Rotulo>De</Rotulo>
          <input
            type="date"
            value={filtro.de}
            onChange={(e) => aplicar({ de: e.target.value })}
            style={campo}
          />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Rotulo>Até</Rotulo>
          <input
            type="date"
            value={filtro.ate}
            onChange={(e) => aplicar({ ate: e.target.value })}
            style={campo}
          />
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 180 }}>
          <Rotulo>Buscar</Rotulo>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') aplicar({ busca })
            }}
            onBlur={() => {
              if (busca !== filtro.busca) aplicar({ busca })
            }}
            placeholder="Descrição, pedido, documento…"
            style={{ ...campo, width: '100%' }}
          />
        </span>

        {!limpo && (
          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() => {
              setBusca('')
              aplicar({ situacao: 'a-decidir', tipo: '', de: '', ate: '', busca: '' })
            }}
          >
            Limpar
          </BotaoSecundario>
        )}
      </div>

      <span
        className="font-sans"
        style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}
      >
        {pendente
          ? 'Filtrando…'
          : total === 0
            ? 'Nenhum movimento com esses filtros.'
            : mostrando < total
              ? `Mostrando ${mostrando} de ${total} movimentos. Aperte o período para ver o resto.`
              : `${total} movimento(s).`}
      </span>
    </div>
  )
}

/**
 * Extrato: a fila entre "o dinheiro se moveu" e "o ERP sabe o que foi".
 *
 * A tela tem uma ordem deliberada: primeiro de onde os fatos vêm (sincronizar
 * ou importar), depois a conferência de saldo — que é onde se descobre que o
 * ERP está atrasado —, e só então a fila de classificação. Quem abre a tela
 * pela primeira vez lê nessa ordem e entende o módulo.
 */
export function ExtratoCliente({
  linhas,
  total,
  filtro,
  contas,
  categorias,
  gatewayLigado,
  atualizadoEm,
}: Props) {
  const [de, setDe] = useState(INICIO_DA_OPERACAO)
  const [ate, setAte] = useState(hoje())
  const [relatorio, setRelatorio] = useState<string[] | null>(null)
  // Relatórios que o Mercado Pago já montou. Escolher qual importar é do
  // operador: pegar "o mais recente" por conta própria traria o de outro
  // período sem nenhum erro aparecer.
  const [prontos, setProntos] = useState<RelatorioDisponivel[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // Zero é "não está esperando". Acima disso, é a vez da espera — e mudar o
  // número é o que faz o efeito abaixo agendar a próxima consulta.
  const [espera, setEspera] = useState(0)
  // Os relatórios que já existiam quando pedimos. A volta automática só
  // aceita um arquivo que NÃO esteja nesta lista — é assim que se distingue o
  // relatório novo do que já estava lá, sem depender de relógio nenhum.
  const [jaExistiam, setJaExistiam] = useState<string[]>([])
  const [atualizando, setAtualizando] = useState(false)
  const [ferramentas, setFerramentas] = useState(false)
  const [editandoPeriodo, setEditandoPeriodo] = useState(false)

  // Categoria escolhida por linha. A sugestão entra como valor inicial e o
  // operador troca quando o palpite erra — palpite que não dá para corrigir
  // vira erro gravado.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const chaveDe = (l: LinhaExtrato) => `${l.origem}:${l.chave}`

  const categoriaDe = (l: LinhaExtrato) =>
    escolhas[chaveDe(l)] ?? sugerirCategoria(l.descricao, l.tipo) ?? ''

  // A filtragem acontece no banco; aqui só se soma o que veio.
  const pendentes = linhas
  const entradas = pendentes.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0)
  const saidas = pendentes.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0)

  /** Uma linha resolvida não tem o que decidir — mostra o estado, não um menu. */
  const resolvida = (l: LinhaExtrato) => Boolean(l.lancamentoId) || l.ignorado || l.interno

  /**
   * Atualizar o extrato: um clique, e a tela se vira.
   *
   * `pedir` só é verdadeiro no clique. Nas voltas automáticas ela apenas
   * pergunta se ficou pronto — pedir de novo a cada consulta encheria a conta
   * do Mercado Pago de relatórios idênticos.
   */
  const atualizar = useCallback(
    async (pedir: boolean) => {
      setErro(null)
      setAtualizando(true)
      try {
        const r = await atualizarExtrato(de, ate, pedir, pedir ? undefined : jaExistiam)
        if (!r.ok) {
          setErro(r.erro)
          setEspera(0)
          return
        }
        setRelatorio(r.linhas)
        if (r.estado === 'pronto') {
          setEspera(0)
          setJaExistiam([])
        } else {
          setJaExistiam(r.jaExistiam)
          setEspera((n) => (n === 0 ? 1 : n + 1))
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
        setEspera(0)
      } finally {
        setAtualizando(false)
      }
    },
    [de, ate, jaExistiam],
  )

  // Atualiza sozinho ao abrir a tela, quando o extrato está velho.
  //
  // O `ref` garante uma vez por montagem: sem ele, cada re-render do React
  // dispararia outro pedido de relatório ao Mercado Pago.
  const jaTentou = useRef(false)
  useEffect(() => {
    if (jaTentou.current) return
    if (!gatewayLigado) return
    const min = atualizadoEm ? (Date.now() - Date.parse(atualizadoEm)) / 60_000 : Infinity
    if (min < VALIDADE_MIN) return
    jaTentou.current = true
    void atualizar(true)
  }, [gatewayLigado, atualizadoEm, atualizar])

  useEffect(() => {
    if (espera === 0) return
    if (espera > MAX_ESPERAS) {
      setErro(
        'O Mercado Pago passou de seis minutos para montar o extrato. O pedido continua valendo do lado deles — clique em Atualizar extrato daqui a pouco e ele será importado sem pedir de novo.',
      )
      setEspera(0)
      return
    }
    const t = setTimeout(() => {
      void atualizar(false)
    }, ESPERA_MS)
    return () => clearTimeout(t)
  }, [espera, atualizar])

  function rodar(acao: () => Promise<string[] | null>) {
    setErro(null)
    setRelatorio(null)
    iniciar(async () => {
      try {
        const linhasRelatorio = await acao()
        if (linhasRelatorio) setRelatorio(linhasRelatorio)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const colunas: Coluna<LinhaExtrato>[] = [
    {
      chave: 'quando',
      titulo: 'Data',
      largura: '92px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Valor tamanho={11.5} peso={400}>
            {l.ocorridoEm.split('-').reverse().join('/')}
          </Valor>
          <span className="font-mono" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
            {l.origem}
          </span>
        </span>
      ),
    },
    {
      chave: 'descricao',
      titulo: 'Movimento',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: 1.3,
              color: 'rgba(242,237,227,.85)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {l.descricao}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 9.5,
              color: 'rgba(242,237,227,.32)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[l.contaNome, l.contraparte, l.pedidoId].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '112px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} tom={l.tipo === 'entrada' ? 'ok' : 'erro'}>
          {`${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}`}
        </Valor>
      ),
    },
    {
      chave: 'categoria',
      titulo: 'Categoria',
      largura: '190px',
      render: (l) =>
        resolvida(l) ? (
          <Badge tom={l.interno ? 'info' : l.ignorado ? 'neutro' : 'ok'}>
            {l.interno
              ? 'movimento da conta'
              : l.ignorado
                ? l.motivoIgnorado || 'dispensado'
                : 'classificado'}
          </Badge>
        ) : (
          // Entrada só vê categoria de receita; saída, tudo menos receita.
          // Oferecer "Marketing e ADS" para dinheiro entrando é oferecer um
          // erro de digitação como se fosse opção.
          //
          // A receita do DRE continua vindo dos pedidos pagos. Estas linhas
          // são as que NÃO têm pedido — venda de balcão, aporte —, e é só por
          // isso que classificá-las não conta a mesma venda duas vezes.
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <select
              value={categoriaDe(l)}
              onChange={(e) => setEscolhas((v) => ({ ...v, [chaveDe(l)]: e.target.value }))}
              style={{ ...campo, height: 28, width: '100%', fontSize: 11.5 }}
            >
              <option value="">
                {l.tipo === 'entrada' ? 'Sem categoria' : 'Escolha a categoria'}
              </option>
              {categorias
                .filter((c) =>
                  l.tipo === 'entrada' ? c.natureza === 'Receita' : c.natureza !== 'Receita',
                )
                .map((c) => (
                  <option key={c.nome} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
            </select>
            {l.tipo === 'entrada' && l.documento && (
              // O id do pagamento é o que permite achar a venda no painel do
              // Mercado Pago quando a origem do crédito não é óbvia.
              <span
                className="font-mono"
                style={{
                  fontSize: 9,
                  color: 'rgba(242,237,227,.3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {`pagamento ${l.documento}`}
              </span>
            )}
          </span>
        ),
    },
    {
      chave: 'acao',
      titulo: '',
      largura: '188px',
      alinhamento: 'right',
      render: (l) =>
        resolvida(l) ? null : (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <BotaoSecundario
            altura={28}
            onClick={() =>
              rodar(async () => {
                const r = await classificarLinha(l.origem, l.chave, categoriaDe(l), '')
                if (!r.ok) throw new Error(r.erro)
                return [`Lançamento ${r.lancamentoId} criado a partir de "${l.descricao}".`]
              })
            }
          >
            {l.tipo === 'entrada' ? 'Aceitar' : 'Classificar'}
          </BotaoSecundario>
          <BotaoSecundario
            altura={28}
            onClick={() =>
              rodar(async () => {
                const motivo = window.prompt(
                  'Por que esta linha não vira lançamento?\n(transferência entre contas próprias, aporte, estorno que se anula…)',
                )
                if (!motivo) return null
                const r = await ignorarLinha(l.origem, l.chave, motivo)
                if (!r.ok) throw new Error(r.erro)
                return [`"${l.descricao}" saiu da fila: ${motivo}`]
              })
            }
          >
            Dispensar
          </BotaoSecundario>
        </span>
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── De onde vêm os fatos ─────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <TituloSecao tamanho={14}>Trazer o movimento</TituloSecao>

        {/* Um botão. Ele pede o extrato ao Mercado Pago, espera ficar pronto,
            importa, lê a tarifa de cada venda e liga tudo aos pedidos — nessa
            ordem, que é a ordem certa e não precisa estar na cabeça de quem
            usa. As ferramentas de diagnóstico ficam guardadas abaixo. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <BotaoOuro
            altura={36}
            desabilitado={atualizando || espera > 0 || !gatewayLigado}
            onClick={() => void atualizar(true)}
          >
            {espera > 0
              ? `Aguardando o Mercado Pago… (${espera}/${MAX_ESPERAS})`
              : atualizando
                ? 'Atualizando…'
                : 'Atualizar extrato'}
          </BotaoOuro>

          <span
            className="font-sans"
            style={{ fontSize: 11, color: 'var(--color-terciario)', lineHeight: 1.5 }}
          >
            {`lido ${desdeQuando(atualizadoEm)}`}
            {' · '}
            {`${dataBr(de)} até ${dataBr(ate)}`}
            {' · '}
            <button
              type="button"
              onClick={() => setEditandoPeriodo((v) => !v)}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                font: 'inherit',
                color: 'var(--color-ouro)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              {editandoPeriodo ? 'fechar' : 'alterar período'}
            </button>
          </span>

          {!gatewayLigado && (
            <span className="font-sans" style={{ fontSize: 10.5, color: COR.atencao }}>
              Falta MERCADOPAGO_ACCESS_TOKEN no ambiente.
            </span>
          )}
        </div>

        {espera > 0 && (
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.55, color: COR.atencao, textWrap: 'pretty' }}
          >
            O Mercado Pago está montando o extrato — costuma levar menos de um minuto. Pode deixar
            esta tela aberta: ela importa sozinha assim que ficar pronto.
          </span>
        )}

        {editandoPeriodo && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>de</Rotulo>
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campo} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>até</Rotulo>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campo} />
            </span>
          </div>
        )}

        <span
          className="font-sans"
          style={{
            fontSize: 10.5,
            lineHeight: 1.55,
            color: de < INICIO_DA_OPERACAO ? COR.atencao : 'var(--color-terciario)',
            textWrap: 'pretty',
          }}
        >
          {de < INICIO_DA_OPERACAO
            ? `Esta conta do Mercado Pago só passou a receber as vendas da Yampi em ${dataBr(INICIO_DA_OPERACAO)}. O que vier antes é movimento de outra operação e vai poluir o caixa desta loja.`
            : `O extrato começa em ${dataBr(INICIO_DA_OPERACAO)}, quando esta conta passou a receber as vendas da Yampi. A conta é mais antiga, mas o movimento anterior é de outra operação — o que vier fora dessa janela é descartado na importação.`}
        </span>

        {/* ── Ferramentas ────────────────────────────────────────────────
            Cada uma existe por um problema real que já aconteceu, e todas
            somem do caminho de quem só quer o extrato atualizado. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setFerramentas((v) => !v)}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 0,
              padding: 0,
              fontFamily: 'inherit',
              fontSize: 10.5,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'rgba(242,237,227,.4)',
              cursor: 'pointer',
            }}
          >
            {ferramentas ? '− Ferramentas' : '+ Ferramentas'}
          </button>

          {ferramentas && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente || !gatewayLigado}
                onClick={() =>
                  rodar(async () => {
                    const r = await sincronizarGateway(de, ate)
                    if (!r.ok) throw new Error(r.erro)
                    const x = r.resultado
                    return [
                      `${x.lidos} pagamento(s) lidos de ${x.periodo.de} a ${x.periodo.ate}.`,
                      `Repasses: ${x.repassesConciliados} conciliado(s) agora, ${x.repassesJaConciliados} já estavam.`,
                      ...(Object.keys(x.criterios).length
                        ? [
                            `Casamento com pedidos: ${Object.entries(x.criterios)
                              .map(([k, v]) => `${v} por ${k}`)
                              .join(', ')}.`,
                          ]
                        : []),
                      ...(x.semPedido.length
                        ? [
                            `${x.semPedido.length} pagamento(s) aprovados sem pedido correspondente:`,
                            ...x.semPedido
                              .slice(0, 10)
                              .map(
                                (p) =>
                                  `  · ${p.id} · ${brl(p.valor)} · ${p.quando} · ref "${p.referencia || '—'}"`,
                              ),
                          ]
                        : []),
                      ...x.avisos.map((a) => `Atenção: ${a}`),
                    ]
                  })
                }
              >
                Só as tarifas
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente}
                onClick={() =>
                  rodar(async () => {
                    const r = await recasarExtrato()
                    if (!r.ok) throw new Error(r.erro)
                    return [
                      `${r.porTransacao} ligada(s) pelo id da transação da Yampi — ligação exata.`,
                      `${r.religadas} ligada(s) por valor e data.`,
                      r.restantes
                        ? `${r.restantes} continuam sem pedido. Importe os pedidos da Yampi: é de lá que vem o id da transação.`
                        : 'Nenhuma linha ficou órfã.',
                    ]
                  })
                }
              >
                Recasar com pedidos
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente || !gatewayLigado}
                onClick={() =>
                  rodar(async () => {
                    const r = await listarRelatoriosProntos()
                    if (!r.ok) throw new Error(r.erro)
                    setProntos(r.relatorios)
                    return r.relatorios.length
                      ? [`${r.relatorios.length} relatório(s) no Mercado Pago.`]
                      : ['Nenhum relatório montado nesta conta ainda.']
                  })
                }
              >
                Relatórios do Mercado Pago
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente}
                onClick={() =>
                  rodar(async () => {
                    const r = await diagnosticarGateway(de, ate)
                    if (!r.ok) throw new Error(r.erro)
                    return [...r.passos, ...(r.amostra.length ? ['', 'Amostra:', ...r.amostra] : [])]
                  })
                }
              >
                Diagnosticar
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente || !gatewayLigado}
                onClick={() =>
                  rodar(async () => {
                    const r = await sondarExtratoCompleto()
                    if (!r.ok) throw new Error(r.erro)
                    return r.linhas
                  })
                }
              >
                Sondar a conta
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente || !gatewayLigado}
                onClick={() =>
                  rodar(async () => {
                    // Reler existe porque a importação é idempotente: quando a
                    // LEITURA estava errada, ressincronizar não conserta nada.
                    if (
                      !window.confirm(
                        'Apagar as linhas do Mercado Pago que ainda não viraram lançamento e ler o período de novo?\n\nO que já foi classificado ou dispensado é preservado.',
                      )
                    ) {
                      return null
                    }
                    const r = await relerGateway(de, ate)
                    if (!r.ok) throw new Error(r.erro)
                    const x = r.resultado
                    return [
                      `${r.apagadas} linha(s) antigas apagadas.`,
                      `${x.lidos} pagamento(s) relidos · ${x.repassesConciliados} repasse(s) atualizados.`,
                      ...x.avisos.map((a) => `Atenção: ${a}`),
                    ]
                  })
                }
              >
                Reler do zero
              </BotaoSecundario>
              <BotaoSecundario
                altura={30}
                desabilitado={pendente}
                onClick={() =>
                  rodar(async () => {
                    if (
                      !window.confirm(
                        'Apagar TODO o extrato, os lançamentos que vieram dele e a conciliação dos repasses?\n\nPedidos e lançamentos digitados à mão não são tocados.',
                      )
                    ) {
                      return null
                    }
                    const r = await zerarFinanceiro()
                    if (!r.ok) throw new Error(r.erro)
                    return r.linhas
                  })
                }
              >
                Zerar financeiro
              </BotaoSecundario>
            </div>
          )}
        </div>
      </section>

      {erro && <FaixaAlerta tom="erro" texto={erro} />}

      {relatorio && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <TituloSecao tamanho={13}>O que aconteceu</TituloSecao>
          <pre className="font-mono" style={mono}>
            {relatorio.join('\n')}
          </pre>
        </section>
      )}

      {prontos.length > 0 && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda-ouro)',
            borderRadius: 'var(--radius-card)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <TituloSecao tamanho={13}>Relatórios montados nesta conta</TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}
          >
            {`O botão Atualizar extrato já escolhe e importa sozinho. Esta lista é para quando você quiser importar um arquivo específico — o que estiver fora de ${dataBr(de)}–${dataBr(ate)} é descartado do mesmo jeito.`}
          </span>
          {prontos.map((r) => (
            <div
              key={r.arquivo}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 190px 140px',
                alignItems: 'center',
                gap: 12,
                padding: '9px 11px',
                borderRadius: 9,
                background: 'rgba(255,255,255,.02)',
                border: '1px solid rgba(255,255,255,.05)',
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 10.5,
                  color: 'var(--color-ouro)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.arquivo}
              </span>
              <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.45)' }}>
                {[r.de && r.ate ? `${r.de} a ${r.ate}` : '', r.criadoEm].filter(Boolean).join(' · ')}
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {r.jaImportado && <Badge tom="ok">já importado</Badge>}
                <BotaoSecundario
                  altura={26}
                  desabilitado={pendente}
                  onClick={() =>
                    rodar(async () => {
                      const resposta = await importarExtratoCompleto(r.arquivo, de, ate)
                      if (!resposta.ok) throw new Error(resposta.erro)
                      return resposta.linhas
                    })
                  }
                >
                  Importar
                </BotaoSecundario>
              </span>
            </div>
          ))}
        </section>
      )}

      {/* ── Conferência ──────────────────────────────────────────────── */}
      {contas.length > 0 && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <TituloSecao tamanho={14}>Saldo das contas</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              O saldo vem do próprio gateway. A nossa leitura de pagamentos não vê saque nem
              transferência, então ela explica as vendas — não fecha o caixa.
            </span>
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contas.map((c) => {
              // A diferença entre o saldo real e o que conseguimos ler é,
              // literalmente, o que saiu da conta sem passar por um pagamento
              // recebido: saque, transferência, Pix enviado, conta paga.
              const naoLido = c.saldoInformado === null
                ? null
                : Math.round((c.movimentoLido - c.saldoInformado) * 100) / 100
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 140px 140px minmax(190px,auto)',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.02)',
                    border: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Valor tamanho={12}>{c.nome}</Valor>
                    <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.32)' }}>
                      {`${c.banco || '—'} · ${c.linhasLidas} linha(s) lida(s)`}
                    </span>
                  </span>

                  {/* Sem saldo informado, mostrar o movimento com rótulo de
                      saldo seria repetir o mesmo número com dois nomes — e foi
                      assim que R$ 83 mil passaram por saldo de uma conta com
                      R$ 10 mil. Melhor dizer que não sabemos. */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <Valor tamanho={13} tom={c.saldoInformado === null ? 'atencao' : 'ok'}>
                      {c.saldoInformado === null ? '—' : brl(c.saldoInformado)}
                    </Valor>
                    <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.35)' }}>
                      {c.saldoInformado === null ? 'saldo não lido ainda' : 'saldo do gateway'}
                    </span>
                  </span>

                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                    <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
                      {brl(c.movimentoLido)}
                    </Valor>
                    <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.35)' }}>
                      movimento que lemos
                    </span>
                  </span>

                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Conta sem nenhuma linha lida não tem diferença a
                        explicar: o saldo foi digitado e não há leitura para
                        comparar. Dizer "R$ 986,93 saíram sem virar linha" ali
                        inventa um movimento que nunca existiu. */}
                    {c.linhasLidas === 0 ? (
                      <Badge tom="neutro">saldo digitado · sem extrato ligado</Badge>
                    ) : naoLido !== null && Math.abs(naoLido) > 1 ? (
                      <Badge tom="info">{`${brl(naoLido)} saíram sem virar linha`}</Badge>
                    ) : c.aClassificar > 0 ? (
                      <Badge tom="atencao">{`${c.aClassificar} precisam de você`}</Badge>
                    ) : (
                      <Badge tom="ok">Em dia</Badge>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Fila ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>
          {filtro.situacao === 'todas' ? 'Movimento da conta' : 'Precisam de você'}
        </TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {filtro.situacao === 'todas'
            ? `Tudo que o extrato trouxe: ${brl(entradas)} entrando, ${brl(saidas)} saindo nas linhas listadas.`
            : `Despesas a categorizar (${brl(saidas)}) e entradas sem pedido correspondente (${brl(entradas)}). Venda casada com pedido e movimento da própria conta — saque, reserva — não aparecem aqui: não há o que decidir neles.`}
        </span>
      </div>

      {entradas > 0 && filtro.situacao !== 'todas' && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          As vendas desta fila não pedem categoria: a receita do DRE sai dos pedidos pagos, e dar
          categoria de receita ao crédito contaria a mesma venda duas vezes. Elas estão aqui por
          outro motivo — o ERP não achou a qual pedido pertencem. A ligação certa vem do id da
          transação que a Yampi guarda em cada pedido; se muitas estiverem aqui, importe os pedidos
          em <strong style={{ fontWeight: 600 }}>Pedidos → Importar da Yampi</strong> e elas somem
          sozinhas na próxima atualização.
        </span>
      )}

      <Filtros filtro={filtro} total={total} mostrando={pendentes.length} />

      {pendentes.length === 0 ? (
        <EstadoVazio
          titulo={filtro.situacao === 'todas' ? 'Nenhum movimento' : 'Nada na fila'}
          instrucao={
            filtro.situacao === 'todas'
              ? 'Nenhuma linha bate com os filtros. Amplie o período ou limpe a busca.'
              : 'As vendas conciliam sozinhas. Só despesa sem categoria e entrada sem pedido aparecem aqui.'
          }
        />
      ) : (
        <Tabela
          colunas={colunas}
          itens={pendentes}
          chaveDe={chaveDe}
          bandeiraDe={(l) => (l.tipo === 'saida' && !categoriaDe(l) ? 'atencao' : null)}
          densidade="confortavel"
        />
      )}
    </div>
  )
}
