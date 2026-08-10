'use client'

import { useMemo, useState, useTransition } from 'react'

import { BotaoSecundario, Losango, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, num, parseNum, plural, volume } from '@/domain'
import type { PerfumeBase } from '@/domain'

import { carregarEstoqueInicial } from './actions'

/** Quantas linhas aparecem por vez. Renderizar 412 pares de campo trava a digitação. */
const LOTE_VISIVEL = 60

interface Preenchida {
  ml: string
  custo: string
}

const campoEstilo = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
  width: '100%',
  textAlign: 'right',
} as const

/**
 * Carga inicial: dizer ao ERP o que já está na prateleira.
 *
 * Uma linha por base, duas colunas. O valor digitado fica guardado por id, não
 * pela posição na lista — filtrar, buscar outro perfume e voltar não apaga o
 * que já foi preenchido, e o rodapé soma tudo o que está preenchido, inclusive
 * o que o filtro atual não mostra.
 */
export function CargaCliente({ bases }: { bases: PerfumeBase[] }) {
  const [valores, setValores] = useState<Record<string, Preenchida>>({})
  const [busca, setBusca] = useState('')
  const [soZeradas, setSoZeradas] = useState(true)
  const [mostrar, setMostrar] = useState(LOTE_VISIVEL)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const termo = busca.trim().toLowerCase()
  const filtradas = useMemo(
    () =>
      bases
        .filter((b) => {
          if (soZeradas && b.volumeMl > 0) return false
          if (!termo) return true
          return `${b.nome} ${b.marca}`.toLowerCase().includes(termo)
        })
        // Mais vendido primeiro. Carregar 412 bases em ordem alfabética é
        // trabalho sem retorno até o fim: em ordem de venda, as primeiras
        // dezenas já respondem pela maior parte do faturamento, e o ERP passa
        // a funcionar de verdade para elas antes de a lista acabar.
        .slice()
        .sort((a, b) => b.consumoDiarioMl - a.consumoDiarioMl || a.nome.localeCompare(b.nome, 'pt-BR')),
    [bases, soZeradas, termo],
  )

  // Bases que vendem E estão zeradas: é o alvo real da carga. O resto da
  // lista é cauda longa — perfume que não sai não trava nada.
  const vendemEFaltam = bases.filter((b) => b.volumeMl === 0 && b.consumoDiarioMl > 0).length

  // O que será gravado. Sai daqui em vez de sair da lista filtrada, senão o
  // filtro decidiria o que entra na carga.
  const prontas = useMemo(() => {
    const nomes = new Map(bases.map((b) => [b.id, b.nome]))
    return Object.entries(valores)
      .map(([baseId, v]) => ({
        baseId,
        nome: nomes.get(baseId) ?? baseId,
        volumeMl: parseNum(v.ml),
        custoPorMl: parseNum(v.custo),
      }))
      .filter((i) => i.volumeMl > 0 || i.custoPorMl > 0)
  }, [valores, bases])

  const completas = prontas.filter((i) => i.volumeMl > 0 && i.custoPorMl > 0)
  const incompletas = prontas.filter((i) => !(i.volumeMl > 0 && i.custoPorMl > 0))
  const mlTotal = completas.reduce((a, i) => a + i.volumeMl, 0)
  const valorTotal = completas.reduce((a, i) => a + i.volumeMl * i.custoPorMl, 0)

  const definir = (id: string, campo: keyof Preenchida, valor: string) =>
    setValores((v) => ({
      ...v,
      [id]: { ...(v[id] ?? { ml: '', custo: '' }), [campo]: valor.replace(/[^0-9.,]/g, '') },
    }))

  const gravar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setAviso(null)
      if (incompletas.length) {
        setErro(
          `${plural(incompletas.length, 'perfume está', 'perfumes estão')} com só uma das duas colunas preenchida: ${incompletas
            .slice(0, 3)
            .map((i) => i.nome)
            .join(', ')}${incompletas.length > 3 ? '…' : ''}. Volume sem custo não vira preço, e custo sem volume não vira estoque.`,
        )
        return
      }
      const r = await carregarEstoqueInicial(
        completas.map(({ baseId, volumeMl, custoPorMl }) => ({ baseId, volumeMl, custoPorMl })),
      )
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setValores({})
      setAviso(
        `${plural(r.gravadas, 'perfume carregado', 'perfumes carregados')} · ${volume(mlTotal)} em estoque, ${brl(valorTotal)} em custo. Cada um virou um lote e uma entrada em Movimentações.`,
      )
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section
        style={{
          background: 'linear-gradient(160deg,#16141A,#101011)',
          border: '1px solid rgba(239,209,140,.16)',
          borderRadius: 16,
          padding: '15px 19px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <Losango />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
          <TituloSecao tamanho={14.5} tom="ouro">
            Carga inicial de estoque
          </TituloSecao>
          <span
            className="font-sans"
            style={{
              fontSize: 10.5,
              lineHeight: 1.5,
              color: 'var(--color-terciario)',
              textWrap: 'pretty',
            }}
          >
            O catálogo veio inteiro da Shopify, mas o volume não: a loja publica quantas unidades
            oferece, não quanto sobrou no frasco. Declare aqui o que está na prateleira hoje — o
            volume RESTANTE, não o tamanho original — e o custo que você pagou por ml. A partir
            daí o ERP calcula preço, quantas unidades cada base ainda dá e o que publicar na loja.
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 10,
              lineHeight: 1.45,
              color: 'rgba(242,237,227,.34)',
              textWrap: 'pretty',
            }}
          >
            Perfume que você não tem fica em branco e continua zerado — o que é a verdade, não uma
            lacuna. Repetir a carga do mesmo perfume soma ao que já existe.
            {vendemEFaltam > 0
              ? ` A lista começa pelo que mais vende: ${vendemEFaltam} das bases zeradas tiveram venda nos últimos 30 dias, e são elas que travam preço, produção e sincronia. As que nunca venderam podem esperar.`
              : ''}
          </span>
        </span>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setMostrar(LOTE_VISIVEL)
          }}
          placeholder="Buscar perfume ou marca…"
          className="font-sans"
          style={{ ...campoEstilo, textAlign: 'left', height: 36, flex: 1, minWidth: 220 }}
        />
        <BotaoSecundario
          altura={36}
          onClick={() => {
            setSoZeradas((s) => !s)
            setMostrar(LOTE_VISIVEL)
          }}
        >
          {soZeradas ? 'Mostrando só as zeradas' : 'Mostrando todas'}
        </BotaoSecundario>
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          {`${filtradas.length} de ${bases.length}`}
        </span>
      </div>

      <div
        style={{
          border: '1px solid rgba(255,255,255,.07)',
          borderRadius: 13,
          overflow: 'hidden',
          background: 'rgba(255,255,255,.015)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 104px 96px 116px 116px 110px',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,.07)',
            background: 'rgba(255,255,255,.02)',
          }}
        >
          <Rotulo>Perfume base</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Vende / 30d</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Hoje</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Volume (ml)</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Custo (R$/ml)</Rotulo>
          <Rotulo style={{ display: 'block', textAlign: 'right' }}>Custo do lote</Rotulo>
        </div>

        {filtradas.length === 0 && (
          <div style={{ padding: '26px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              {termo
                ? 'Nenhum perfume com esse nome.'
                : 'Todas as bases já têm volume — a carga inicial está feita.'}
            </span>
          </div>
        )}

        {filtradas.slice(0, mostrar).map((b) => {
          const v = valores[b.id] ?? { ml: '', custo: '' }
          const ml = parseNum(v.ml)
          const custo = parseNum(v.custo)
          const total = ml > 0 && custo > 0 ? ml * custo : null
          return (
            <div
              key={b.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 104px 96px 116px 116px 110px',
                gap: 12,
                alignItems: 'center',
                padding: '7px 16px',
                borderBottom: '1px solid rgba(255,255,255,.04)',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span
                  className="font-sans"
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: 11.5,
                    lineHeight: 1.3,
                    color: 'var(--color-corrente)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.nome}
                </span>
                <span
                  className="font-sans"
                  style={{
                    display: 'block',
                    fontSize: 10,
                    lineHeight: 1.25,
                    color: 'rgba(242,237,227,.32)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.marca}
                </span>
              </span>

              {/* Quanto esta base vendeu por mês. É o que diz por onde
                  começar: perfume que não vende pode ficar em branco. */}
              <Valor
                tamanho={11}
                peso={400}
                tom={b.consumoDiarioMl > 0 ? 'ouro' : 'var(--color-apagado)'}
                style={{ display: 'block', textAlign: 'right' }}
              >
                {b.consumoDiarioMl > 0 ? volume(b.consumoDiarioMl * 30) : 'não vendeu'}
              </Valor>

              <Valor
                tamanho={11}
                peso={400}
                tom={b.volumeMl > 0 ? 'var(--color-secundario)' : 'var(--color-apagado)'}
                style={{ display: 'block', textAlign: 'right' }}
              >
                {b.volumeMl > 0 ? volume(b.volumeMl) : 'zerado'}
              </Valor>

              <input
                value={v.ml}
                onChange={(e) => definir(b.id, 'ml', e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Volume restante de ${b.nome} em ml`}
                className="font-mono focus:border-ouro/45"
                style={campoEstilo}
              />
              <input
                value={v.custo}
                onChange={(e) => definir(b.id, 'custo', e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label={`Custo por ml de ${b.nome}`}
                className="font-mono focus:border-ouro/45"
                style={campoEstilo}
              />
              <Valor
                tamanho={11.5}
                tom={total === null ? 'var(--color-apagado)' : 'ouro'}
                style={{ display: 'block', textAlign: 'right' }}
              >
                {total === null ? '—' : brl(total)}
              </Valor>
            </div>
          )
        })}

        {filtradas.length > mostrar && (
          <div style={{ padding: '12px 16px', textAlign: 'center' }}>
            <BotaoSecundario altura={32} onClick={() => setMostrar((m) => m + LOTE_VISIVEL)}>
              {`Mostrar mais ${Math.min(LOTE_VISIVEL, filtradas.length - mostrar)} · faltam ${filtradas.length - mostrar}`}
            </BotaoSecundario>
          </div>
        )}
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '13px 17px',
          borderRadius: 13,
          background: 'linear-gradient(160deg,#16141A,#101011)',
          border: '1px solid var(--color-borda-ouro)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Rotulo>Preenchidos</Rotulo>
          <Valor tamanho={14}>{`${num(completas.length)} de ${bases.length}`}</Valor>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Rotulo>Volume declarado</Rotulo>
          <Valor tamanho={14}>{volume(mlTotal)}</Valor>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Rotulo>Custo do estoque</Rotulo>
          <Valor tamanho={14} tom="ouro">
            {brl(valorTotal)}
          </Valor>
        </span>

        <span style={{ flex: 1, minWidth: 180 }}>
          {(erro || aviso) && (
            <span
              className="font-sans"
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: erro ? COR.erro : COR.ok,
                textWrap: 'pretty',
              }}
            >
              {erro ?? aviso}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={gravar}
          disabled={pendente || completas.length === 0}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 38,
            padding: '0 20px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'wait' : completas.length ? 'pointer' : 'not-allowed',
            opacity: pendente || completas.length === 0 ? 0.45 : 1,
          }}
        >
          {pendente
            ? 'Gravando…'
            : `Gravar carga${completas.length ? ` · ${completas.length}` : ''}`}
        </button>
      </div>
    </div>
  )
}
