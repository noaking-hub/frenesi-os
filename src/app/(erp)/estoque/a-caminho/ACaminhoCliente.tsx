'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import {
  Badge,
  BotaoOuro,
  BotaoSecundario,
  EstadoVazio,
  Rotulo,
  TituloSecao,
} from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import {
  ROTULO_DA_COMPRA,
  brl,
  estadoDaChegada,
  custoPorMlPrevisto,
  estadoDaCompra,
  faltamDoItem,
  investidoAguardando,
  mlAguardando,
  parseNum,
  pendenciaDoItem,
  resumoDaCompra,
  type CompraACaminho,
  type EstadoDaCompra,
  type ItemDaCompra,
  type Lote,
  type PerfumeBase,
} from '@/domain'

import { cancelarCompra, marcarRecebido, salvarCompra, vincularLote } from './actions'

/**
 * Compras a caminho: o que já foi comprado e ainda não chegou.
 *
 * A tela responde DUAS perguntas por item, e não uma:
 *
 *   chegou?              — o checklist, que aceita chegada parcial
 *   existe no catálogo?  — o vínculo com o perfume-base
 *
 * Elas são independentes porque a operação é assim: parte dos perfumes
 * comprados ainda não existe na Shopify, e precisa ser criada lá antes de
 * virar lote. Marcar "recebido" NÃO dá entrada no estoque — isso é decisão
 * deliberada, não limitação. O módulo aponta o que está pronto para virar
 * lote; quem cria o lote é a compra de frasco, no momento em que o cadastro
 * do perfume já existe.
 */

const TOM_DA_COMPRA: Record<EstadoDaCompra, 'ok' | 'atencao' | 'erro' | 'info' | 'neutro'> = {
  recebida: 'ok',
  parcial: 'info',
  aguardando: 'neutro',
  atrasada: 'atencao',
  cancelada: 'erro',
}

const dataBr = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—'

interface Rascunho {
  id?: string
  baseId: string
  descricao: string
  volumeMl: string
  quantidade: string
  custoUnitario: string
}

const rascunhoVazio = (): Rascunho => ({
  baseId: '',
  descricao: '',
  volumeMl: '',
  quantidade: '1',
  custoUnitario: '',
})

export function ACaminhoCliente({
  compras,
  bases,
  lotes,
  hoje,
}: {
  compras: CompraACaminho[]
  bases: PerfumeBase[]
  lotes: Lote[]
  hoje: string
}) {
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<CompraACaminho | null>(null)
  const [soPendentes, setSoPendentes] = useState(true)

  const comEstado = useMemo(
    () => compras.map((c) => ({ compra: c, estado: estadoDaCompra(c, hoje), resumo: resumoDaCompra(c) })),
    [compras, hoje],
  )

  const visiveis = soPendentes
    ? comEstado.filter((x) => x.estado !== 'recebida' && x.estado !== 'cancelada')
    : comEstado

  const totais = useMemo(() => {
    const abertas = comEstado.filter((x) => x.estado !== 'recebida' && x.estado !== 'cancelada')
    const itensAbertos = abertas.flatMap((x) => x.compra.itens)
    return {
      compras: abertas.length,
      atrasadas: comEstado.filter((x) => x.estado === 'atrasada').length,
      frascos: abertas.reduce((a, x) => a + x.resumo.frascosFaltando, 0),
      investido: abertas.reduce((a, x) => a + investidoAguardando(x.compra), 0),
      ml: abertas.reduce((a, x) => a + mlAguardando(x.compra), 0),
      semCadastro: comEstado.reduce((a, x) => a + x.resumo.semCadastro, 0),
      prontos: comEstado.reduce((a, x) => a + x.resumo.prontosParaLote, 0),
      // O total em dinheiro é honesto sobre a própria cobertura: item sem
      // preço não vira zero silencioso, ele é contado e dito.
      semPreco: itensAbertos.filter((i) => i.custoUnitario === null && faltamDoItem(i) > 0).length,
      fornecedores: new Set(abertas.map((x) => x.compra.fornecedor)).size,
    }
  }, [comEstado])

  const custoMedioMl = totais.ml > 0 ? totais.investido / totais.ml : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao>Compras a caminho</TituloSecao>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <BotaoSecundario onClick={() => setSoPendentes((v) => !v)} altura={34}>
            {soPendentes ? 'Mostrar todas' : 'Só as pendentes'}
          </BotaoSecundario>
          <BotaoOuro
            onClick={() => {
              setEditando(null)
              setFormAberto(true)
            }}
            altura={34}
          >
            Nova compra
          </BotaoOuro>
        </div>
      </div>

      {/* O dinheiro primeiro, e em destaque: é a pergunta que se faz ao abrir
          esta tela. Os contadores de trabalho pendente vêm depois, e só
          aparecem quando há trabalho — cartão zerado ocupa o mesmo espaço de
          um cartão urgente e ensina a não olhar para nenhum. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Cartao
          rotulo="Investido a caminho"
          valor={brl(totais.investido)}
          tom="ouro"
          destaque
          dica={
            totais.semPreco > 0
              ? `${totais.semPreco} ${totais.semPreco === 1 ? 'item sem preço fora' : 'itens sem preço fora'} desta conta`
              : 'custo dos frascos que ainda não chegaram'
          }
        />
        <Cartao
          rotulo="Volume a caminho"
          valor={`${totais.ml.toLocaleString('pt-BR')} ml`}
          destaque
          dica={custoMedioMl !== null ? `${brl(custoMedioMl)} por ml em média` : undefined}
        />
        <Cartao
          rotulo="Frascos que faltam"
          valor={String(totais.frascos)}
          dica={`em ${totais.compras} ${totais.compras === 1 ? 'compra' : 'compras'} de ${totais.fornecedores} ${totais.fornecedores === 1 ? 'fornecedor' : 'fornecedores'}`}
        />
        {totais.atrasadas > 0 && (
          <Cartao rotulo="Atrasadas" valor={String(totais.atrasadas)} tom="atencao" />
        )}
        {totais.semCadastro > 0 && (
          <Cartao
            rotulo="Chegaram, falta cadastrar"
            valor={String(totais.semCadastro)}
            tom="info"
            dica="perfume que ainda não existe no catálogo"
          />
        )}
        {totais.prontos > 0 && (
          <Cartao
            rotulo="Prontos para virar lote"
            valor={String(totais.prontos)}
            tom="ok"
            dica="registre a compra do frasco"
          />
        )}
      </div>

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo={soPendentes ? 'Nada a caminho' : 'Nenhuma compra registrada'}
          instrucao={
            soPendentes
              ? 'Tudo o que foi comprado já chegou. Use “Mostrar todas” para ver o histórico.'
              : 'Use “Nova compra” para registrar o que você comprou e ainda vai chegar.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visiveis.map(({ compra, estado, resumo }) => (
            <CartaoDaCompra
              key={compra.id}
              compra={compra}
              estado={estado}
              resumo={resumo}
              lotes={lotes}
              aberta={abertaId === compra.id}
              aoAbrir={() => setAbertaId(abertaId === compra.id ? null : compra.id)}
              aoEditar={() => {
                setEditando(compra)
                setFormAberto(true)
              }}
            />
          ))}
        </div>
      )}

      {formAberto && (
        <FormularioDaCompra
          bases={bases}
          compra={editando}
          hoje={hoje}
          aoFechar={() => setFormAberto(false)}
        />
      )}
    </div>
  )
}

function Cartao({
  rotulo,
  valor,
  tom = 'neutro',
  dica,
  destaque = false,
}: {
  rotulo: string
  valor: string
  tom?: 'ok' | 'atencao' | 'info' | 'neutro' | 'ouro'
  dica?: string
  destaque?: boolean
}) {
  return (
    <div
      style={{
        flex: destaque ? '1 1 230px' : '1 1 168px',
        border: `1px solid ${destaque ? 'rgba(239,209,140,.22)' : 'rgba(255,255,255,.08)'}`,
        borderRadius: 10,
        padding: '13px 15px',
        background: destaque ? 'rgba(239,209,140,.05)' : 'rgba(255,255,255,.02)',
      }}
    >
      <Rotulo>{rotulo}</Rotulo>
      <div
        className="font-mono"
        style={{
          fontSize: destaque ? 27 : 23,
          lineHeight: destaque ? '34px' : '29px',
          color: COR[tom],
          paddingTop: 5,
        }}
      >
        {valor}
      </div>
      {dica && (
        <div style={{ fontSize: 10.5, lineHeight: '15px', color: 'var(--color-terciario)', paddingTop: 3 }}>
          {dica}
        </div>
      )}
    </div>
  )
}

function CartaoDaCompra({
  compra,
  estado,
  resumo,
  lotes,
  aberta,
  aoAbrir,
  aoEditar,
}: {
  compra: CompraACaminho
  estado: EstadoDaCompra
  resumo: ReturnType<typeof resumoDaCompra>
  lotes: Lote[]
  aberta: boolean
  aoAbrir: () => void
  aoEditar: () => void
}) {
  const [pendente, iniciar] = useTransition()
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 12,
        background: 'rgba(255,255,255,.02)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={aoAbrir}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: 14.5, color: 'var(--color-corrente)' }}>{compra.fornecedor}</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-terciario)', paddingTop: 3 }}>
            comprada em {dataBr(compra.compradaEm)}
            {compra.previstaPara ? ` · prevista para ${dataBr(compra.previstaPara)}` : ' · sem previsão'}
            {compra.referencia ? ` · ${compra.referencia}` : ''}
          </div>
        </div>

        <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-secundario)' }}>
          {resumo.frascosRecebidos}/{resumo.frascosEsperados} frascos
        </div>
        {resumo.custoEstimado !== null && (
          <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-secundario)' }}>
            {brl(resumo.custoEstimado)}
          </div>
        )}
        <Badge tom={TOM_DA_COMPRA[estado]}>{ROTULO_DA_COMPRA[estado]}</Badge>
      </button>

      {aberta && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '14px 16px' }}>
          {compra.rastreio ? (
            <div style={{ fontSize: 12, color: 'var(--color-secundario)', paddingBottom: 12 }}>
              Rastreio <span className="font-mono">{compra.rastreio}</span>
              {compra.transportadora ? ` · ${compra.transportadora}` : ''}
            </div>
          ) : (
            // Compra de fornecedor muitas vezes não tem código, e dizer isso é
            // melhor que deixar um espaço vazio que parece defeito.
            <div style={{ fontSize: 12, color: 'var(--color-terciario)', paddingBottom: 12 }}>
              Sem código de rastreio — nem toda compra de fornecedor tem.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {compra.itens.map((i) => (
              <LinhaDoItem key={i.id} item={i} lotes={lotes} />
            ))}
          </div>

          {compra.observacao && (
            <div style={{ fontSize: 12, color: 'var(--color-secundario)', paddingTop: 12 }}>
              {compra.observacao}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 14, flexWrap: 'wrap' }}>
            <BotaoSecundario onClick={aoEditar} altura={32}>
              Editar compra
            </BotaoSecundario>
            {!compra.canceladaEm && (
              <BotaoSecundario onClick={() => setCancelando((v) => !v)} altura={32}>
                Cancelar compra
              </BotaoSecundario>
            )}
          </div>

          {cancelando && (
            <div style={{ display: 'flex', gap: 8, paddingTop: 10, alignItems: 'center' }}>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por que a compra foi cancelada?"
                style={campo}
              />
              <BotaoOuro
                altura={32}
                desabilitado={pendente || !motivo.trim()}
                onClick={() =>
                  iniciar(async () => {
                    const r = await cancelarCompra(compra.id, motivo)
                    if (!r.ok) setErro(r.erro)
                    else setCancelando(false)
                  })
                }
              >
                Confirmar
              </BotaoOuro>
            </div>
          )}
          {erro && <div style={{ fontSize: 12, color: COR.erro, paddingTop: 8 }}>{erro}</div>}
        </div>
      )}
    </div>
  )
}

function LinhaDoItem({ item, lotes }: { item: ItemDaCompra; lotes: Lote[] }) {
  const [quantidade, setQuantidade] = useState(String(item.quantidadeRecebida))
  const [ocorrencia, setOcorrencia] = useState(item.ocorrencia ?? '')
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  /**
   * Os lotes que este item pode ter virado.
   *
   * Só os do MESMO perfume, e só os que entraram a partir do dia em que o
   * frasco chegou: lote anterior à chegada é de outra compra, e oferecê-lo
   * convidaria a amarrar o item ao lote errado — o que estragaria o custo por
   * ml das duas compras de uma vez.
   */
  const candidatos = lotes.filter(
    (l) => l.baseId === item.baseId && (!item.recebidoEm || l.entrada >= item.recebidoEm),
  )

  const chegada = estadoDaChegada(item)
  const pendencia = pendenciaDoItem(item)
  const faltam = faltamDoItem(item)
  const mudou = Number(quantidade) !== item.quantidadeRecebida || ocorrencia !== (item.ocorrencia ?? '')

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 12px',
        border: '1px solid rgba(255,255,255,.06)',
        borderRadius: 8,
        background: chegada === 'recebido' ? 'rgba(92,158,112,.06)' : 'transparent',
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--color-corrente)' }}>
          {item.descricao}
          {item.volumeMl ? (
            <span style={{ color: 'var(--color-terciario)' }}> · {item.volumeMl} ml</span>
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-terciario)', paddingTop: 3 }}>
          {item.quantidade} comprado{item.quantidade > 1 ? 's' : ''}
          {faltam > 0 ? ` · faltam ${faltam}` : ''}
          {item.custoUnitario !== null ? ` · ${brl(item.custoUnitario)} cada` : ''}
          {custoPorMlPrevisto(item) !== null ? ` · ${brl(custoPorMlPrevisto(item)!)}/ml` : ''}
          {item.recebidoEm ? ` · recebido em ${dataBr(item.recebidoEm)}` : ''}
        </div>
        {pendencia && (
          <div style={{ fontSize: 11.5, color: COR.atencao, paddingTop: 4 }}>
            {pendencia}
            {pendencia === 'o perfume ainda não existe no catálogo' && (
              <>
                {' — '}
                <Link href="/produtos" style={{ color: COR.ouro, textDecoration: 'underline' }}>
                  cadastrar no catálogo
                </Link>
              </>
            )}
            {pendencia === 'falta registrar a compra do frasco para criar o lote' && (
              <>
                {' — '}
                <Link href="/estoque/lotes" style={{ color: COR.ouro, textDecoration: 'underline' }}>
                  registrar compra do frasco
                </Link>
              </>
            )}
          </div>
        )}

        {/* Registrado o lote lá, o item precisa poder dizer QUAL foi. Sem isto
            a pendência ficaria na tela para sempre, mesmo com o trabalho
            feito — e uma pendência que não sai ensina a ignorar a lista. */}
        {pendencia === 'falta registrar a compra do frasco para criar o lote' && candidatos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>virou o lote</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                iniciar(async () => {
                  setErro(null)
                  const r = await vincularLote(item.id, e.target.value)
                  if (!r.ok) setErro(r.erro)
                })
              }}
              style={{ ...campo, width: 260 }}
            >
              <option value="">escolher o lote…</option>
              {candidatos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} · {l.volumeMl} ml · entrada {dataBr(l.entrada)}
                </option>
              ))}
            </select>
          </div>
        )}

        {item.loteId && (
          <div style={{ fontSize: 11.5, color: COR.ok, paddingTop: 4 }}>
            virou o lote <span className="font-mono">{item.loteId}</span>
            {' · '}
            <button
              type="button"
              onClick={() =>
                iniciar(async () => {
                  const r = await vincularLote(item.id, null)
                  if (!r.ok) setErro(r.erro)
                })
              }
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'var(--color-terciario)',
                fontSize: 11.5,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              desfazer
            </button>
          </div>
        )}
        {erro && <div style={{ fontSize: 11.5, color: COR.erro, paddingTop: 4 }}>{erro}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9.5, color: 'var(--color-terciario)', letterSpacing: 1 }}>
            RECEBIDOS
          </span>
          <input
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="font-mono"
            style={{ ...campo, width: 64, textAlign: 'center' }}
          />
        </label>
        <input
          value={ocorrencia}
          onChange={(e) => setOcorrencia(e.target.value)}
          placeholder="faltou, quebrou, veio trocado…"
          style={{ ...campo, width: 190 }}
        />
        <BotaoOuro
          altura={32}
          desabilitado={pendente || !mudou}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              const r = await marcarRecebido(item.id, Number(quantidade) || 0, ocorrencia)
              if (!r.ok) setErro(r.erro)
            })
          }
        >
          Salvar
        </BotaoOuro>
      </div>
    </div>
  )
}

function FormularioDaCompra({
  bases,
  compra,
  hoje,
  aoFechar,
}: {
  bases: PerfumeBase[]
  compra: CompraACaminho | null
  hoje: string
  aoFechar: () => void
}) {
  const [fornecedor, setFornecedor] = useState(compra?.fornecedor ?? '')
  const [referencia, setReferencia] = useState(compra?.referencia ?? '')
  const [compradaEm, setCompradaEm] = useState(compra?.compradaEm ?? hoje)
  const [previstaPara, setPrevistaPara] = useState(compra?.previstaPara ?? '')
  const [rastreio, setRastreio] = useState(compra?.rastreio ?? '')
  const [transportadora, setTransportadora] = useState(compra?.transportadora ?? '')
  const [frete, setFrete] = useState(compra?.frete ? String(compra.frete) : '')
  const [valorTotal, setValorTotal] = useState(compra?.valorTotal ? String(compra.valorTotal) : '')
  const [observacao, setObservacao] = useState(compra?.observacao ?? '')
  const [itens, setItens] = useState<Rascunho[]>(
    compra?.itens.length
      ? compra.itens.map((i) => ({
          id: i.id,
          baseId: i.baseId ?? '',
          descricao: i.descricao,
          volumeMl: i.volumeMl ? String(i.volumeMl) : '',
          quantidade: String(i.quantidade),
          custoUnitario: i.custoUnitario !== null ? String(i.custoUnitario) : '',
        }))
      : [rascunhoVazio()],
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const mudarItem = (indice: number, campo: keyof Rascunho, valor: string) =>
    setItens((atual) => atual.map((i, n) => (n === indice ? { ...i, [campo]: valor } : i)))

  return (
    <Modal titulo={compra ? 'Editar compra' : 'Nova compra a caminho'} largura={860} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Campo rotulo="Fornecedor" largura={220}>
            <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} style={campo} />
          </Campo>
          <Campo rotulo="Nota / pedido" largura={160}>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} style={campo} />
          </Campo>
          <Campo rotulo="Comprada em" largura={140}>
            <input
              type="date"
              value={compradaEm}
              onChange={(e) => setCompradaEm(e.target.value)}
              style={campo}
            />
          </Campo>
          <Campo rotulo="Previsão de chegada" largura={150} dica="opcional">
            <input
              type="date"
              value={previstaPara}
              onChange={(e) => setPrevistaPara(e.target.value)}
              style={campo}
            />
          </Campo>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Campo rotulo="Rastreio" largura={200} dica="nem toda compra tem">
            <input value={rastreio} onChange={(e) => setRastreio(e.target.value)} style={campo} />
          </Campo>
          <Campo rotulo="Transportadora" largura={160}>
            <input
              value={transportadora}
              onChange={(e) => setTransportadora(e.target.value)}
              style={campo}
            />
          </Campo>
          <Campo rotulo="Frete (R$)" largura={110}>
            <input value={frete} onChange={(e) => setFrete(e.target.value)} inputMode="decimal" style={campo} />
          </Campo>
          <Campo rotulo="Valor da nota (R$)" largura={140} dica="se o item não tem preço">
            <input
              value={valorTotal}
              onChange={(e) => setValorTotal(e.target.value)}
              inputMode="decimal"
              style={campo}
            />
          </Campo>
        </div>

        <div>
          <Rotulo>Perfumes desta compra</Rotulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {itens.map((i, n) => (
              <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Campo rotulo="Perfume no catálogo" largura={240} dica="deixe vazio se ainda não existe">
                  <select
                    value={i.baseId}
                    onChange={(e) => {
                      const b = bases.find((x) => x.id === e.target.value)
                      mudarItem(n, 'baseId', e.target.value)
                      // O nome escrito à mão acompanha a escolha, mas continua
                      // editável: é ele que a tela mostra, e o item sem
                      // catálogo depende só dele.
                      if (b && !i.descricao.trim()) mudarItem(n, 'descricao', `${b.marca} ${b.nome}`)
                    }}
                    style={campo}
                  >
                    <option value="">— ainda não cadastrado —</option>
                    {bases.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.marca} {b.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Nome" largura={210}>
                  <input
                    value={i.descricao}
                    onChange={(e) => mudarItem(n, 'descricao', e.target.value)}
                    style={campo}
                  />
                </Campo>
                <Campo rotulo="Volume (ml)" largura={96}>
                  <input
                    value={i.volumeMl}
                    onChange={(e) => mudarItem(n, 'volumeMl', e.target.value)}
                    inputMode="decimal"
                    style={campo}
                  />
                </Campo>
                <Campo rotulo="Qtd" largura={70}>
                  <input
                    value={i.quantidade}
                    onChange={(e) => mudarItem(n, 'quantidade', e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    style={{ ...campo, textAlign: 'center' }}
                  />
                </Campo>
                <Campo rotulo="Custo un. (R$)" largura={110}>
                  <input
                    value={i.custoUnitario}
                    onChange={(e) => mudarItem(n, 'custoUnitario', e.target.value)}
                    inputMode="decimal"
                    style={campo}
                  />
                </Campo>
                {itens.length > 1 && (
                  <BotaoSecundario
                    altura={32}
                    onClick={() => setItens((a) => a.filter((_, x) => x !== n))}
                  >
                    Remover
                  </BotaoSecundario>
                )}
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 10 }}>
            <BotaoSecundario altura={32} onClick={() => setItens((a) => [...a, rascunhoVazio()])}>
              Adicionar perfume
            </BotaoSecundario>
          </div>
        </div>

        <Campo rotulo="Observação" largura="100%">
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} style={campo} />
        </Campo>

        {erro && <div style={{ fontSize: 12.5, color: COR.erro }}>{erro}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <BotaoSecundario onClick={aoFechar} altura={34}>
            Cancelar
          </BotaoSecundario>
          <BotaoOuro
            altura={34}
            desabilitado={pendente}
            onClick={() =>
              iniciar(async () => {
                setErro(null)
                const r = await salvarCompra({
                  id: compra?.id,
                  fornecedor,
                  referencia: referencia || null,
                  compradaEm,
                  previstaPara: previstaPara || null,
                  rastreio: rastreio || null,
                  transportadora: transportadora || null,
                  valorTotal: valorTotal ? parseNum(valorTotal) : null,
                  frete: frete ? parseNum(frete) : 0,
                  observacao: observacao || null,
                  itens: itens.map((i) => ({
                    id: i.id,
                    baseId: i.baseId || null,
                    descricao: i.descricao,
                    volumeMl: i.volumeMl ? parseNum(i.volumeMl) : null,
                    quantidade: Number(i.quantidade) || 0,
                    custoUnitario: i.custoUnitario ? parseNum(i.custoUnitario) : null,
                  })),
                })
                if (!r.ok) setErro(r.erro)
                else aoFechar()
              })
            }
          >
            {compra ? 'Salvar alterações' : 'Registrar compra'}
          </BotaoOuro>
        </div>
      </div>
    </Modal>
  )
}

function Campo({
  rotulo,
  largura,
  dica,
  children,
}: {
  rotulo: string
  largura: number | string
  dica?: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: largura }}>
      <span style={{ fontSize: 9.5, color: 'var(--color-terciario)', letterSpacing: 1 }}>
        {rotulo.toUpperCase()}
      </span>
      {children}
      {dica && <span style={{ fontSize: 10, color: 'var(--color-terciario)' }}>{dica}</span>}
    </label>
  )
}

const campo = {
  height: 34,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  outline: 0,
  width: '100%',
} as const
