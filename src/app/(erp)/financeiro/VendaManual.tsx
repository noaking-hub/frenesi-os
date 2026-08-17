'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, parseNum, plural, volume, hojeEmSaoPaulo } from '@/domain'

import { registrarVendaManual, type ItemVendaManual } from '../pedidos/actions'
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
export function VendaManual({ contas }: { contas: ContaParaVenda[] }) {
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
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ pedidoId: string; total: number; mlBaixado: number } | null>(
    null,
  )
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

  const confirmar = () =>
    iniciar(async () => {
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
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setFeito({ pedidoId: r.pedidoId, total: r.total, mlBaixado: r.mlBaixado })
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
            Tudo abaixo é o que o banco gravou nesta transação — estoque e caixa já estão em dia.
          </span>
          <Previa
            linhas={[
              { rotulo: 'Pedido criado', valor: feito.pedidoId },
              {
                rotulo: `Lançado em ${contaEscolhida?.nome ?? 'caixa'}`,
                valor: brl(feito.total),
                tom: COR.ok,
              },
              {
                rotulo: 'Saiu do estoque de base',
                valor: volume(feito.mlBaixado),
                tom: COR.ouro,
              },
            ]}
          />
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
          A venda que não passou pelo checkout. Ao confirmar, o ERP baixa o perfume e os insumos do
          estoque e lança o valor recebido no caixa — as duas coisas juntas, na mesma transação.
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
          <Campo rotulo="Data da venda" dica="É esta data que entra no caixa e na competência">
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
          <Campo rotulo="Conta que recebeu" dica="O valor entra aqui já baixado, como recebido">
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
              { rotulo: 'Entra no caixa em', valor: `${ocorridoEm} · ${contaEscolhida?.nome ?? '—'}` },
            ]}
          />
        )}

        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          A baixa real acrescenta a perda de envase aos ml acima, e o número exato aparece depois de
          confirmar.
        </span>

        <Erro texto={erro} />
        <Rodape
          rotulo="Registrar venda"
          aoConfirmar={confirmar}
          aoCancelar={aoFechar}
          pendente={pendente}
        />
      </div>
    </Modal>
  )
}
