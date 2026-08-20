'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import {
  INTERVALO_PADRAO_DIAS,
  MAX_PARCELAS,
  MIN_PARCELAS,
  brl,
  diaPt,
  hojeEmSaoPaulo,
  parseNum,
  planejarParcelamento,
  plural,
  volume,
} from '@/domain'

import {
  registrarVendaManual,
  type ItemVendaManual,
  type ParcelaGravada,
} from '../pedidos/actions'
import { carregarCatalogoDaVendaManual } from './acoes-da-venda-manual'

/**
 * Venda manual — a venda de balcão, WhatsApp ou Instagram lançada à mão.
 *
 * Mora no Financeiro, e não em Pedidos, porque é lá que ela é lembrada: quem
 * fecha uma venda no WhatsApp vai ao Financeiro registrar o dinheiro, não à
 * lista de pedidos da loja. Ela também substitui o lançamento manual solto na
 * categoria "Vendas fora da loja" — eram dois jeitos de anotar o mesmo fato, e
 * o jeito solto não baixava estoque nem entrava na conciliação.
 *
 * Sem esta tela, a venda que não passa pelo checkout some duas vezes: o
 * perfume sai do frasco sem sair do saldo (e a reposição chega tarde) e o
 * dinheiro entra sem aparecer no caixa. Um clique aqui faz as duas coisas na
 * MESMA transação do banco — a função `registrar_venda_manual` cria o pedido,
 * baixa a base com a perda de envase, consome frasco/válvula/tampa e grava a
 * entrada já baixada na conta escolhida.
 *
 * O diálogo mostra o total ao vivo antes do clique e, depois dele, o que
 * REALMENTE aconteceu: o número do pedido, o valor lançado e os ml que saíram
 * — nenhum desses três é estimado aqui, todos vêm do retorno do banco.
 */

export interface BaseParaVenda {
  id: string
  nome: string
  marca: string
  /** Físico menos reservado: é o que se pode vender sem pisar em pedido pago. */
  disponivelMl: number
  /** Preço já praticado por tamanho, quando a variante existe no catálogo. */
  precos: Record<string, number>
}

export interface ContaParaVenda {
  id: string
  nome: string
  principal: boolean
}

const CANAIS = [
  { valor: 'manual', rotulo: 'Balcão / pessoalmente' },
  { valor: 'whatsapp', rotulo: 'WhatsApp' },
  { valor: 'instagram', rotulo: 'Instagram' },
]

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

const hoje = () => hojeEmSaoPaulo()

/**
 * Como o dinheiro desta venda entra — em DOIS números, não em um modo.
 *
 * A versão anterior desta tela tinha um seletor "à vista / parcelado" que
 * desabilitava as parcelas quando a venda era marcada como recebida. A premissa
 * era que parcelamento só faz sentido para venda a receber, e é o contrário do
 * que esta operação faz: fecha-se em 2× e a primeira parcela é paga no ato — foi
 * exatamente assim que a venda do Icaro nasceu, e foi por não caber nesse
 * seletor que ela acabou gravada como R$ 216,00 recebidos de uma vez.
 *
 * O que restou são duas perguntas independentes, que é como o fato realmente é:
 * em quantas parcelas a venda foi dividida, e quantas dessas já entraram na
 * conta. Nenhuma combinação sobra sem sentido:
 *
 *   1 parcela,  1 recebida  → a venda à vista de sempre (o padrão da tela)
 *   1 parcela,  0 recebidas → venda fiada: o total a receber, vencendo hoje
 *   N parcelas, 0 recebidas → carnê inteiro em aberto
 *   N parcelas, K recebidas → o caso de todo dia; com K = N, pagou adiantado
 */


interface Linha {
  /** Chave estável: remover a linha do meio não pode remontar as de baixo. */
  chave: number
  baseId: string
  ml: string
  quantidade: string
  preco: string
  /** Preço digitado à mão não é mais substituído pelo do catálogo. */
  precoTocado: boolean
}

let proximaChave = 1
const linhaVazia = (): Linha => ({
  chave: proximaChave++,
  baseId: '',
  ml: '',
  quantidade: '1',
  preco: '',
  precoTocado: false,
})

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

/**
 * Prévia do que vai ser gravado — o número antes do clique.
 *
 * `rolagem` existe por causa do cronograma: 48 parcelas empurrariam o botão
 * Registrar para fora da tela, e prévia que esconde o botão de confirmar não
 * é prévia, é obstáculo. Nenhuma linha é omitida — só se rola.
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

function Rodape({
  rotulo,
  aoConfirmar,
  aoCancelar,
  pendente,
}: {
  rotulo: string
  aoConfirmar: () => void
  aoCancelar: () => void
  pendente: boolean
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
        className="botao-ouro font-sans hover:brightness-[1.07]"
        style={{
          height: 36,
          padding: '0 16px',
          fontWeight: 700,
          fontSize: 11.5,
          lineHeight: 1,
          borderRadius: 8,
          border: 0,
          boxShadow: 'var(--shadow-ouro)',
          cursor: pendente ? 'wait' : 'pointer',
          opacity: pendente ? 0.55 : 1,
        }}
      >
        {pendente ? 'Gravando…' : rotulo}
      </button>
    </div>
  )
}

/**
 * O catálogo chega no CLIQUE, não por propriedade.
 *
 * Medido: as 412 bases com os mapas de preço são 95 KB de JSON. Como este
 * componente é 'use client', receber `bases` por propriedade fazia esses 95 KB
 * serem serializados no payload RSC de TODA navegação da tela de Lançamentos —
 * com o modal fechado, e a cada mudança de filtro. Era o único custo daquela
 * tela que não encolhia quando o filtro devolvia uma linha, e é ele que
 * explica o congelamento com "1 de 1268" no rodapé.
 *
 * O mesmo erro já tinha sido cometido um nível abaixo: o comentário em
 * Compromissos.tsx conta que repetir contas/categorias/centros por linha
 * "estourava o payload e derrubava a tela". As 412 bases eram a versão maior
 * disso.
 *
 * O botão nunca fica inerte: o clique abre o diálogo no ato, e o diálogo diz
 * que está buscando. `contas` continua por propriedade porque são 5 linhas
 * (2,3 KB) que a tela já carregou para a barra de filtros — buscá-las de novo
 * custaria uma ida ao banco para economizar nada.
 */
export function VendaManual({
  contas,
  abrirAoMontar = false,
}: {
  contas: ContaParaVenda[]
  /**
   * Abre o formulário assim que a tela monta. É a porta de entrada de quem
   * veio de Pedidos (`?venda=nova`): o formulário continua morando só aqui,
   * mas o caminho até ele deixa de exigir saber onde ele mora.
   */
  abrirAoMontar?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [catalogo, setCatalogo] = useState<{ bases: BaseParaVenda[]; tamanhos: number[] } | null>(
    null,
  )
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null)
  const [buscando, buscar] = useTransition()

  function abrir() {
    setAberto(true)
    // Uma vez por sessão da tela: reabrir o modal não paga o catálogo de novo,
    // e fechar sem gravar é o caso mais comum.
    if (catalogo || buscando) return
    setErroCatalogo(null)
    buscar(async () => {
      const r = await carregarCatalogoDaVendaManual()
      if (!r.ok) {
        setErroCatalogo(r.erro)
        return
      }
      setCatalogo({ bases: r.bases, tamanhos: r.tamanhos })
    })
  }

  useEffect(() => {
    if (abrirAoMontar) abrir()
    // Só na montagem: o parâmetro da URL não muda sem remontar a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="font-sans hover:brightness-110"
        style={{
          height: 30,
          padding: '0 13px',
          fontWeight: 600,
          fontSize: 11,
          lineHeight: 1,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,.14)',
          background: 'transparent',
          color: 'var(--color-corrente)',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        + Nova venda manual
      </button>

      {aberto && !catalogo && (
        <Modal titulo="Nova venda manual" largura={520} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '18px 0' }}>
            <TituloSecao tamanho={16}>
              {erroCatalogo ? 'Não deu para abrir o formulário' : 'Buscando o catálogo…'}
            </TituloSecao>
            <span
              className="font-sans"
              style={{
                fontSize: 11.5,
                lineHeight: 1.55,
                color: erroCatalogo ? COR.erro : 'var(--color-secundario)',
                textWrap: 'pretty',
              }}
            >
              {erroCatalogo ??
                'O disponível de cada base e o preço praticado são lidos agora, para que o formulário não ofereça um perfume que acabou nem um preço antigo.'}
            </span>
            {erroCatalogo && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <BotaoSecundario altura={36} onClick={abrir}>
                  Tentar de novo
                </BotaoSecundario>
              </div>
            )}
          </div>
        </Modal>
      )}

      {aberto && catalogo && (
        <DialogoVendaManual
          bases={catalogo.bases}
          contas={contas}
          tamanhos={catalogo.tamanhos}
          aoFechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function DialogoVendaManual({
  bases,
  contas,
  tamanhos,
  aoFechar,
}: {
  bases: BaseParaVenda[]
  contas: ContaParaVenda[]
  tamanhos: number[]
  aoFechar: () => void
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => [linhaVazia()])
  const [ocorridoEm, setOcorridoEm] = useState(hoje())
  const [canal, setCanal] = useState('manual')
  const [contaId, setContaId] = useState(
    contas.find((c) => c.principal)?.id ?? contas[0]?.id ?? '',
  )
  const [clienteNome, setClienteNome] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [observacao, setObservacao] = useState('')
  // Uma parcela, já recebida: a venda de balcão de sempre. O padrão é o caso
  // mais comum, não o mais completo — quem vende à vista não digita nada aqui.
  const [parcelas, setParcelas] = useState('1')
  const [intervalo, setIntervalo] = useState(String(INTERVALO_PADRAO_DIAS))
  const [jaRecebidas, setJaRecebidas] = useState('1')
  // Vazio significa "no dia da venda", e não uma data congelada: enquanto o
  // operador não escolher outra, mudar a data da venda leva o recebimento
  // junto. Guardar `hoje()` aqui deixaria a venda de ontem com recebimento
  // hoje, sem ninguém perceber.
  const [recebidasEm, setRecebidasEm] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{
    pedidoId: string
    total: number
    recebido: number
    mlBaixado: number
    parcelas: ParcelaGravada[]
  } | null>(null)
  const [pendente, iniciar] = useTransition()

  const porId = useMemo(() => new Map(bases.map((b) => [b.id, b])), [bases])

  const total = linhas.reduce((a, l) => a + parseNum(l.preco) * parseNum(l.quantidade), 0)
  // Inteiro, como a quantidade que a ação envia: "2,5 decants" não existe.
  const unidades = linhas.reduce(
    (a, l) => a + (l.baseId ? Math.round(parseNum(l.quantidade)) : 0),
    0,
  )
  const mlNominal = linhas.reduce(
    (a, l) => a + (l.baseId ? parseNum(l.ml) * parseNum(l.quantidade) : 0),
    0,
  )

  /**
   * Bases em que o pedido passa do que há no frasco.
   *
   * Duas linhas do mesmo perfume competem pelo MESMO saldo, por isso a conta é
   * somada por base e não por linha. O aviso não bloqueia: quem está no balcão
   * tem o frasco na mão e sabe mais que o ERP — o que ele precisa saber é que
   * o saldo vai ficar zerado, para conferir o inventário depois.
   */
  const faltas = useMemo(() => {
    const pedidoPorBase = new Map<string, number>()
    for (const l of linhas) {
      if (!l.baseId) continue
      const ml = parseNum(l.ml) * parseNum(l.quantidade)
      if (ml > 0) pedidoPorBase.set(l.baseId, (pedidoPorBase.get(l.baseId) ?? 0) + ml)
    }
    return [...pedidoPorBase.entries()]
      .map(([baseId, pedido]) => {
        const base = porId.get(baseId)
        return base && pedido > base.disponivelMl
          ? { nome: base.nome, pedido, disponivel: base.disponivelMl }
          : null
      })
      .filter((f): f is { nome: string; pedido: number; disponivel: number } => f !== null)
  }, [linhas, porId])

  const alterar = (chave: number, mudanca: Partial<Linha>) =>
    setLinhas((atuais) =>
      atuais.map((l) => {
        if (l.chave !== chave) return l
        const nova = { ...l, ...mudanca }
        // Preço praticado no catálogo entra sozinho quando o operador escolhe
        // perfume e tamanho — é o número que ele digitaria de qualquer jeito.
        // Depois de digitado à mão, nunca mais é sobrescrito; e trocar para uma
        // combinação sem preço no catálogo LIMPA o campo, porque carregar o
        // preço do item anterior seria oferecer um valor que não é daquele
        // decant.
        if (!nova.precoTocado && (mudanca.baseId !== undefined || mudanca.ml !== undefined)) {
          const praticado = porId.get(nova.baseId)?.precos[nova.ml]
          nova.preco = praticado ? praticado.toFixed(2).replace('.', ',') : ''
        }
        return nova
      }),
    )

  // Nada é grampeado no `onChange`: apagar o campo para digitar "12" faria o
  // cursor pular para "1" no meio da digitação. Fora da faixa, quem explica é a
  // prévia, com a mesma frase que o banco levantaria.
  const n = Math.max(1, Math.round(parseNum(parcelas)) || 1)
  const dias = Math.round(parseNum(intervalo)) || INTERVALO_PADRAO_DIAS
  const k = Math.max(0, Math.round(parseNum(jaRecebidas)))
  const reparte = n >= MIN_PARCELAS
  // A data do recebimento acompanha a da venda até alguém escolher outra.
  const recebidoEm = recebidasEm || ocorridoEm

  /**
   * O cronograma que a tela promete.
   *
   * Sai de `planejarParcelamento`, que compõe a mesma divisão em centavos de
   * `gravar_parcelas_do_lancamento` e acrescenta o que a versão anterior desta
   * tela não sabia dizer: quais parcelas já entraram. A prévia só serve para
   * alguma coisa se bater com o banco no centavo E no dia — inclusive a âncora,
   * que com K > 0 é a data do recebimento e não a da venda, exatamente como o
   * `case` do plpgsql. Sem isso a tela prometeria a 2ª parcela para 30 dias
   * depois da venda e o banco gravaria 30 dias depois do pagamento.
   */
  const plano = useMemo(
    () =>
      reparte && total > 0
        ? planejarParcelamento({
            valor: total,
            parcelas: n,
            primeiroVencimento: k > 0 ? recebidoEm : ocorridoEm,
            intervaloDias: dias,
            jaRecebidas: k,
            recebidasEm: recebidoEm,
          })
        : null,
    [reparte, total, n, dias, k, recebidoEm, ocorridoEm],
  )

  /**
   * O que não dá para gravar, dito em uma linha antes do clique.
   *
   * A venda sem parcelamento não passa por `planejarParcelamento` (que exige 2
   * ou mais), e por isso a checagem de K precisa existir aqui também: "2 já
   * recebidas" numa venda de uma parcela marcaria como recebido o dobro do que
   * a venda vale, e o erro só apareceria como exceção de plpgsql.
   */
  const impedimento =
    k > n
      ? reparte
        ? `Não dá para marcar ${k} parcelas já recebidas em uma venda de ${n}.`
        : 'Sem parcelamento a venda foi recebida (1) ou não foi (0) — não existe uma terceira.'
      : plano && !plano.ok
        ? plano.erro
        : null

  // Quanto entra na conta AGORA e quanto fica devendo. Com uma parcela só, é
  // tudo ou nada; repartida, é a soma das que nasceram baixadas.
  const entraNoCaixa = reparte ? (plano?.ok ? plano.recebido : 0) : k >= 1 ? total : 0
  const ficaAReceber = Math.round((total - entraNoCaixa) * 100) / 100

  const confirmar = () =>
    iniciar(async () => {
      // A recusa já está escrita na tela; repeti-la aqui evita a viagem ao
      // servidor só para voltar com a mesma frase.
      if (impedimento) {
        setErro(impedimento)
        return
      }
      setErro(null)
      const itens: ItemVendaManual[] = linhas
        .filter((l) => l.baseId)
        .map((l) => {
          const base = porId.get(l.baseId)
          return {
            baseId: l.baseId,
            ml: Math.round(parseNum(l.ml)),
            quantidade: Math.round(parseNum(l.quantidade)),
            preco: parseNum(l.preco),
            // Mesmo formato do item que vem da loja, para as duas vendas
            // ficarem legíveis lado a lado na ficha do pedido.
            descricao: `${base?.nome ?? 'Item'} (Decant) · ${l.ml} ml`,
          }
        })
      const r = await registrarVendaManual({
        itens,
        contaId,
        canal,
        ocorridoEm,
        clienteNome,
        clienteEmail,
        observacao,
        parcelas: n,
        intervaloDias: dias,
        jaRecebidas: k,
        // Sem nada recebido não há baixa para datar, e o banco recusa data de
        // recebimento sem recebimento.
        recebidasEm: k > 0 ? recebidoEm : null,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setFeito({
        pedidoId: r.pedidoId,
        total: r.total,
        recebido: r.recebido,
        mlBaixado: r.mlBaixado,
        parcelas: r.parcelas,
      })
    })

  const contaEscolhida = contas.find((c) => c.id === contaId)

  if (feito) {
    return (
      <Modal titulo="Venda registrada" largura={520} aoFechar={aoFechar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <TituloSecao tamanho={16}>Venda registrada</TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
          >
            {feito.parcelas.length > 0
              ? 'Tudo abaixo é o que o banco gravou nesta transação — o estoque já saiu, e o dinheiro entra parcela a parcela.'
              : 'Tudo abaixo é o que o banco gravou nesta transação — estoque e caixa já estão em dia.'}
          </span>
          <Previa
            linhas={[
              { rotulo: 'Pedido criado', valor: feito.pedidoId },
              // Os dois números vêm do banco, não de dedução da tela: quanto já
              // está na conta e quanto ainda vai entrar. Verde só no que entrou
              // de verdade — pintar de "ok" um total que ficou a receber seria a
              // tela dizendo que o caixa subiu quando ele não subiu.
              {
                rotulo: `Entrou em ${contaEscolhida?.nome ?? 'caixa'}`,
                valor: brl(feito.recebido),
                tom: feito.recebido > 0 ? COR.ok : COR.ouro,
              },
              ...(feito.total - feito.recebido > 0.004
                ? [
                    {
                      rotulo: `A receber em ${contaEscolhida?.nome ?? 'caixa'}`,
                      valor: brl(feito.total - feito.recebido),
                      tom: COR.ouro,
                    },
                  ]
                : []),
              {
                rotulo: 'Saiu do estoque de base',
                valor: volume(feito.mlBaixado),
                tom: COR.ouro,
              },
            ]}
          />

          {feito.parcelas.length > 0 && (
            <>
              <Rotulo>{`${feito.parcelas.length} parcelas gravadas`}</Rotulo>
              <Previa
                rolagem
                linhas={feito.parcelas.map((p) => ({
                  // O estado de cada parcela é o que o banco escreveu em
                  // `baixado_em` — a mesma linha que o dono vai reencontrar na
                  // tela de Lançamentos.
                  rotulo: p.recebidaEm
                    ? `${p.numero}/${feito.parcelas.length} · RECEBIDA em ${diaPt(p.recebidaEm)}`
                    : `${p.numero}/${feito.parcelas.length} · vence ${diaPt(p.venceEm)}`,
                  valor: brl(p.valor),
                  tom: p.recebidaEm ? COR.ok : undefined,
                }))}
              />
            </>
          )}
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            Os ml incluem a perda de envase, por isso passam da soma dos decants. Frasco, válvula e
            tampa também foram baixados.
          </span>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <BotaoSecundario
              altura={36}
              onClick={() => {
                setFeito(null)
                setLinhas([linhaVazia()])
                setClienteNome('')
                setClienteEmail('')
                setObservacao('')
              }}
            >
              Registrar outra
            </BotaoSecundario>
            <button
              type="button"
              onClick={aoFechar}
              className="botao-ouro font-sans hover:brightness-[1.07]"
              style={{
                height: 36,
                padding: '0 16px',
                fontWeight: 700,
                fontSize: 11.5,
                lineHeight: 1,
                borderRadius: 8,
                border: 0,
                boxShadow: 'var(--shadow-ouro)',
                cursor: 'pointer',
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Nova venda manual" largura={760} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>Nova venda manual</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {/* O estoque não depende do dinheiro: o perfume sai do frasco hoje,
              tenha o cliente pagado tudo, metade ou nada. Só a segunda metade
              da frase muda com o parcelamento. */}
          {reparte
            ? 'A venda que não passou pelo checkout. Ao confirmar, o ERP baixa o perfume e os insumos do estoque e grava as parcelas — tudo na mesma transação. O estoque sai hoje; o caixa entra no que já foi recebido e nos vencimentos das demais.'
            : k >= 1
              ? 'A venda que não passou pelo checkout. Ao confirmar, o ERP baixa o perfume e os insumos do estoque e lança o valor recebido no caixa — as duas coisas juntas, na mesma transação.'
              : 'A venda que não passou pelo checkout. Ao confirmar, o ERP baixa o perfume e os insumos do estoque e deixa o valor a receber — o estoque sai hoje, o caixa espera o cliente pagar.'}
        </span>

        {bases.length === 0 ? (
          <span
            className="font-sans"
            style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
          >
            Nenhum perfume base ativo cadastrado — sem catálogo não há o que vender. Importe os
            produtos antes de lançar a venda.
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Rotulo>Itens vendidos</Rotulo>

            {linhas.map((l, i) => {
              const base = porId.get(l.baseId)
              const subtotal = parseNum(l.preco) * parseNum(l.quantidade)
              return (
                <div
                  key={l.chave}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,3fr) 84px 66px 96px 88px 30px',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <select
                    value={l.baseId}
                    onChange={(e) => alterar(l.chave, { baseId: e.target.value })}
                    aria-label={`Perfume do item ${i + 1}`}
                    style={CAMPO}
                  >
                    <option value="">Escolha o perfume…</option>
                    {bases.map((b) => (
                      <option key={b.id} value={b.id}>
                        {`${b.nome} · ${b.marca} — ${volume(b.disponivelMl)} disponíveis`}
                      </option>
                    ))}
                  </select>
                  <select
                    value={l.ml}
                    onChange={(e) => alterar(l.chave, { ml: e.target.value })}
                    aria-label={`Tamanho do item ${i + 1}`}
                    style={CAMPO}
                  >
                    <option value="">ml</option>
                    {tamanhos.map((t) => (
                      <option key={t} value={String(t)}>
                        {`${t} ml`}
                      </option>
                    ))}
                  </select>
                  <input
                    value={l.quantidade}
                    onChange={(e) => alterar(l.chave, { quantidade: e.target.value })}
                    inputMode="numeric"
                    aria-label={`Quantidade do item ${i + 1}`}
                    placeholder="Qtd"
                    style={CAMPO}
                  />
                  <input
                    value={l.preco}
                    onChange={(e) => alterar(l.chave, { preco: e.target.value, precoTocado: true })}
                    inputMode="decimal"
                    aria-label={`Preço unitário do item ${i + 1}`}
                    placeholder="0,00"
                    style={CAMPO}
                  />
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11.5,
                      textAlign: 'right',
                      color: subtotal > 0 ? 'var(--color-tinta)' : 'var(--color-terciario)',
                    }}
                  >
                    {brl(subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLinhas((atuais) =>
                        // A última linha é esvaziada em vez de sumir: um
                        // diálogo de venda sem nenhuma linha não tem por onde
                        // recomeçar.
                        atuais.length > 1
                          ? atuais.filter((x) => x.chave !== l.chave)
                          : [linhaVazia()],
                      )
                    }
                    title="Remover item"
                    aria-label={`Remover item ${i + 1}`}
                    className="hover:border-ouro/45 hover:text-ouro"
                    style={{
                      width: 30,
                      height: 30,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid rgba(255,255,255,.1)',
                      background: 'transparent',
                      color: 'rgba(242,237,227,.55)',
                      borderRadius: 8,
                      fontSize: 14,
                      lineHeight: 1,
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                  {base && l.ml !== '' && (
                    <span
                      className="font-sans"
                      style={{
                        gridColumn: '1 / -1',
                        fontSize: 10,
                        marginTop: -4,
                        color: 'var(--color-terciario)',
                      }}
                    >
                      {`${base.nome}: ${volume(base.disponivelMl)} disponíveis · este item pede ${volume(parseNum(l.ml) * parseNum(l.quantidade))} de base`}
                    </span>
                  )}
                </div>
              )
            })}

            <div>
              <BotaoSecundario
                altura={30}
                onClick={() => setLinhas((atuais) => [...atuais, linhaVazia()])}
              >
                + Adicionar item
              </BotaoSecundario>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <Campo
            rotulo="Data da venda"
            dica="O dia do fato: define a competência e o vencimento da 1ª parcela. Quando o dinheiro entrou é outra data, ao lado."
          >
            <input
              type="date"
              value={ocorridoEm}
              onChange={(e) => setOcorridoEm(e.target.value)}
              style={CAMPO}
            />
          </Campo>
          <Campo rotulo="Canal">
            <select value={canal} onChange={(e) => setCanal(e.target.value)} style={CAMPO}>
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            rotulo={entraNoCaixa > 0 ? 'Conta que recebeu' : 'Conta que vai receber'}
            dica={
              ficaAReceber > 0
                ? 'O que já entrou é baixado aqui; o resto é baixado nesta mesma conta a cada vencimento'
                : 'O valor entra aqui já baixado, como recebido'
            }
          >
            <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={CAMPO}>
              {contas.length === 0 && <option value="">Nenhuma conta ativa</option>}
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/*
          Em quantas parcelas a venda foi dividida, e quantas dessas já entraram
          — duas perguntas independentes, porque é assim que o fato é. A venda em
          2× com a primeira paga no ato é o caso NORMAL desta operação, e o
          seletor "à vista OU parcelado" que existia aqui não tinha como
          representá-la: ele desabilitava o parcelamento justamente quando a
          venda tinha sido recebida.

          Os dois campos que continuam podendo ficar indisponíveis dizem o
          motivo embaixo, porque combinação impossível explicada é diferente de
          campo que não responde ao clique.
        */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
          <Campo
            rotulo="Parcelas"
            dica={`1 não reparte a venda; de ${MIN_PARCELAS} a ${MAX_PARCELAS} vira carnê`}
          >
            <input
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value)}
              inputMode="numeric"
              aria-label="Número de parcelas"
              style={CAMPO}
            />
          </Campo>
          <Campo
            rotulo="Intervalo (dias)"
            dica={
              reparte
                ? 'Dias corridos entre um vencimento e o próximo — 30 é o padrão do carnê'
                : 'Indisponível com uma parcela só: não existe segundo vencimento para espaçar'
            }
          >
            <input
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              disabled={!reparte}
              inputMode="numeric"
              aria-label="Intervalo em dias entre as parcelas"
              style={{ ...CAMPO, opacity: reparte ? 1 : 0.4 }}
            />
          </Campo>
          <Campo
            rotulo="Já recebidas"
            dica={
              reparte
                ? 'Quantas das PRIMEIRAS já entraram na conta. 1 é o comum: fechou em parcelas e recebeu a primeira no ato. Com todas, o cliente pagou adiantado.'
                : '1 = a venda entrou no caixa; 0 = ficou fiado, a receber'
            }
          >
            <input
              value={jaRecebidas}
              onChange={(e) => setJaRecebidas(e.target.value)}
              inputMode="numeric"
              aria-label="Quantas parcelas já foram recebidas"
              style={CAMPO}
            />
          </Campo>
          <Campo
            rotulo="Recebidas em"
            dica={
              k > 0
                ? 'O dia em que o dinheiro caiu na conta — pode ser retroativo, e é esta data que o fluxo de caixa usa. Em branco, segue a data da venda.'
                : 'Indisponível com nada recebido: não há baixa para datar'
            }
          >
            <input
              type="date"
              value={recebidoEm}
              onChange={(e) => setRecebidasEm(e.target.value)}
              disabled={k === 0}
              aria-label="Data em que as parcelas já recebidas entraram"
              style={{ ...CAMPO, opacity: k === 0 ? 0.4 : 1 }}
            />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Cliente (opcional)" dica="Fica no pedido mesmo sem cadastro">
            <input
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Nome de quem comprou"
              style={CAMPO}
            />
          </Campo>
          <Campo
            rotulo="E-mail do cliente (opcional)"
            dica="Sem e-mail o cliente NÃO entra no CRM: o nome fica só no pedido e a venda não conta para recorrência. Com e-mail, ele é criado ou reconhecido pelo cadastro."
          >
            <input
              value={clienteEmail}
              onChange={(e) => setClienteEmail(e.target.value)}
              inputMode="email"
              placeholder="cliente@email.com"
              style={CAMPO}
            />
          </Campo>
        </div>

        <Campo rotulo="Observação">
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Contexto que ajuda a conferir depois"
            style={CAMPO}
          />
        </Campo>

        {faltas.length > 0 && (
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
            <span
              className="font-sans"
              style={{ fontSize: 11.5, fontWeight: 600, color: COR.atencao }}
            >
              O estoque não cobre esta venda
            </span>
            {faltas.map((f) => (
              <span
                key={f.nome}
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
              >
                {`${f.nome}: a venda pede ${volume(f.pedido)} e o ERP só conhece ${volume(f.disponivel)}.`}
              </span>
            ))}
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              Dá para confirmar assim mesmo — quem está no balcão vê o frasco. Só saiba que o saldo
              destas bases vai ficar zerado ou negativo até alguém conferir o inventário.
            </span>
          </div>
        )}

        {total > 0 && (
          <Previa
            linhas={[
              {
                rotulo: `Total de ${plural(unidades, 'decant', 'decants')}`,
                valor: brl(total),
                tom: COR.ok,
              },
              { rotulo: 'Base a sair do estoque', valor: volume(mlNominal) },
              // Os dois números que separam esta venda da de sempre: o que sobe
              // no caixa AGORA e o que fica devendo. Zero em qualquer um dos
              // dois é informação, não ausência dela — por isso a linha aparece
              // mesmo valendo R$ 0,00.
              {
                // Sem nada recebido não há data de entrada para mostrar: pôr a
                // data da venda ao lado de R$ 0,00 sugeriria que algo entrou.
                rotulo:
                  entraNoCaixa > 0
                    ? `Entra no caixa em ${diaPt(recebidoEm)} · ${contaEscolhida?.nome ?? '—'}`
                    : `Entra no caixa agora · ${contaEscolhida?.nome ?? '—'}`,
                valor: brl(entraNoCaixa),
                tom: entraNoCaixa > 0 ? COR.ok : COR.ouro,
              },
              {
                rotulo: 'Fica a receber',
                valor: brl(ficaAReceber),
                tom: ficaAReceber > 0 ? COR.ouro : COR.ok,
              },
            ]}
          />
        )}

        {plano?.ok && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* O rótulo diz o total, não "N× de X": quando a divisão não fecha
                redonda não existe um "de X" único, e a lista abaixo é que tem
                o valor de cada parcela. */}
            <Rotulo>{`Cronograma — ${plano.parcelas.length}× · ${brl(total)}`}</Rotulo>
            <Previa
              rolagem
              linhas={[
                ...plano.parcelas.map((p) => ({
                  // Estado por parcela, e não só vencimento: a lista precisa
                  // mostrar de cara qual dinheiro já está na conta.
                  rotulo: p.recebidaEm
                    ? `${p.numero}/${plano.parcelas.length} · RECEBIDA em ${diaPt(p.recebidaEm)}`
                    : `${p.numero}/${plano.parcelas.length} · vence ${diaPt(p.venceEm)}`,
                  valor: brl(p.valor),
                  tom: p.recebidaEm ? COR.ok : undefined,
                })),
                // A soma fecha exata com o total da venda — está aqui para ser
                // conferida a olho, porque é justamente o que uma divisão que
                // não fecha redonda faz o operador duvidar.
                { rotulo: 'Soma das parcelas', valor: brl(total), tom: COR.ok },
              ]}
            />
            {plano.parcelas[0].valor !== plano.parcelas[plano.parcelas.length - 1].valor && (
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {`A divisão não fecha redonda: a diferença de ${brl(plano.parcelas[0].valor - plano.parcelas[1].valor)} vai na PRIMEIRA parcela, para quem confere o boleto de hoje encontrá-la agora e não daqui a ${plano.parcelas.length - 1} vencimentos.`}
              </span>
            )}
            {k > 0 && (
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {`${k === 1 ? 'A primeira parcela nasce baixada' : `As ${k} primeiras parcelas nascem baixadas`} em ${diaPt(recebidoEm)}${
                  k >= n
                    ? ' — a venda inteira já está paga, e o parcelamento fica registrado como o cliente combinou.'
                    : `, e as demais vencem a cada ${dias} dias contados dessa data — não da data da venda, para o prazo bater com o que o cliente combinou ao pagar.`
                }`}
              </span>
            )}
          </div>
        )}

        {impedimento && <Erro texto={impedimento} />}

        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          A baixa real acrescenta a perda de envase aos ml acima, e o número exato aparece depois de
          confirmar.
        </span>

        <Erro texto={erro} />
        <Rodape
          rotulo={reparte ? `Registrar venda em ${n}×` : 'Registrar venda'}
          aoConfirmar={confirmar}
          aoCancelar={aoFechar}
          pendente={pendente}
        />
      </div>
    </Modal>
  )
}
