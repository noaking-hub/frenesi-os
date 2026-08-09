'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { Badge, BotaoSecundario, FaixaAlerta, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  VARIANTES,
  brl,
  calcularPreco,
  composicaoPreco,
  frascoDe,
  parseNum,
  pct,
  pisoMargem,
  plural,
  volume,
} from '@/domain'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from '@/domain'

import { publicarPrecos } from './actions'

interface Props {
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
  precos: Record<string, Partial<Record<VarianteMl, number>>>
}

interface Linha {
  variante: VarianteMl
  ideal: number
  sugerido: number
  margem: number
  lucro: number
  custoProduto: number
  praticado: number | null
  unidades: number
}

const FILTROS = ['Com custo', 'Sem custo', 'Todos'] as const
type Filtro = (typeof FILTROS)[number]

/** Vírgula é o separador que o usuário digita; o domínio recebe número. */
const texto = (n: number) => n.toFixed(2).replace('.', ',')

export function PrecificacaoCliente({ bases, parametros, precos }: Props) {
  // Abrir num perfume sem custo mostra uma tabela de preços que não cobre o
  // perfume — começamos por um que já tem custo, quando existe algum.
  const [baseId, setBaseId] = useState(
    () => (bases.find((b) => b.custoPorMl > 0) ?? bases[0]).id,
  )
  const [varianteSel, setVarianteSel] = useState<VarianteMl>(5)
  const [custoTexto, setCustoTexto] = useState<string | null>(null)
  const [margemTexto, setMargemTexto] = useState<string | null>(null)
  const [trocando, setTrocando] = useState(false)

  const base = bases.find((b) => b.id === baseId) ?? bases[0]

  // Os campos editáveis recalculam tudo na hora: preço, margem e composição
  // saem do mesmo `calcularPreco` que a tela de Configurações usa.
  const custoPorMl = custoTexto === null ? base.custoPorMl : parseNum(custoTexto)
  const margemAlvo = margemTexto === null ? parametros.margemAlvo : parseNum(margemTexto)
  const params: ParametrosPrecificacao = { ...parametros, margemAlvo }
  const simulando = custoPorMl !== base.custoPorMl

  const linhas: Linha[] = VARIANTES.map((v) => {
    const c = calcularPreco(custoPorMl, v, params)
    return {
      variante: v,
      ideal: c.ideal,
      sugerido: c.sugerido,
      margem: c.margem,
      lucro: c.lucro,
      custoProduto: c.custoProduto,
      praticado: precos[base.id]?.[v] ?? null,
      unidades: Math.floor(base.volumeMl / v),
    }
  })

  const calcSel = calcularPreco(custoPorMl, varianteSel, params)
  const composicao = composicaoPreco(calcSel.sugerido, calcSel.custoProduto, params)

  const tomMargem = (m: number): Tom =>
    m >= margemAlvo - 0.5 ? 'ok' : m >= margemAlvo - 3 ? 'atencao' : 'erro'

  const colunas: Coluna<Linha>[] = [
    {
      chave: 'variante',
      titulo: 'Variante',
      largura: '84px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {`${l.variante} ml`}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.38)', whiteSpace: 'nowrap' }}
          >
            {`frasco ${frascoDe(l.variante)} ml`}
          </span>
        </span>
      ),
    },
    {
      chave: 'ideal',
      titulo: 'Ideal',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom="var(--color-secundario)">
          {brl(l.ideal)}
        </Valor>
      ),
    },
    {
      chave: 'sugerido',
      titulo: 'Sugerido',
      largura: '100px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={14} tom="ouro">
          {brl(l.sugerido)}
        </Valor>
      ),
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: '80px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} tom={tomMargem(l.margem)}>
          {pct(l.margem)}
        </Valor>
      ),
    },
    {
      chave: 'lucro',
      titulo: 'Lucro',
      largura: '88px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom={tomMargem(l.margem)}>
          {brl(l.lucro)}
        </Valor>
      ),
    },
    {
      chave: 'estoque',
      titulo: 'Dá para',
      largura: '84px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom={l.unidades === 0 ? 'rgba(242,237,227,.35)' : 'rgba(242,237,227,.72)'}>
          {`${l.unidades} un`}
        </Valor>
      ),
    },
    {
      chave: 'publicado',
      titulo: 'Publicado hoje',
      largura: 'minmax(0,1fr)',
      render: (l) => {
        const dif = l.praticado === null ? null : l.praticado - l.ideal
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-mono"
              style={{ fontSize: 12, lineHeight: 1.25, color: 'rgba(242,237,227,.7)' }}
            >
              {l.praticado === null ? '—' : brl(l.praticado)}
            </span>
            <span
              className="font-sans"
              style={{
                fontSize: 10,
                lineHeight: 1.3,
                color: dif === null ? 'rgba(242,237,227,.35)' : dif >= 0 ? COR.ok : COR.erro,
                textWrap: 'pretty',
              }}
            >
              {dif === null
                ? 'Sem preço publicado'
                : dif >= 0
                  ? `${brl(dif)} acima do ideal`
                  : `${brl(Math.abs(dif))} abaixo do ideal`}
            </span>
          </span>
        )
      },
    },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 340px',
        gap: 16,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <PerfumeEscolhido
          base={base}
          total={bases.length}
          aoTrocar={() => setTrocando(true)}
        />

        {custoPorMl === 0 && (
          <FaixaAlerta
            tom="erro"
            texto={`${base.nome} está sem custo por ml — os preços abaixo cobrem só taxas e custos fixos, não o perfume. O custo entra sozinho ao registrar a compra do frasco em Estoque → Lotes, ou à mão no Catálogo.`}
          />
        )}

        <section
          style={{
            background: 'linear-gradient(170deg,#141315,#101011)',
            border: '1px solid var(--color-borda)',
            borderRadius: 16,
            padding: '19px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <TituloSecao>Custo de entrada</TituloSecao>
            <div style={{ flex: 1 }} />
            <Link
              href="/configuracoes/precificacao"
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 10.5,
                letterSpacing: '.05em',
                color: 'var(--color-ouro)',
                whiteSpace: 'nowrap',
              }}
            >
              Ajustar taxas em Configurações →
            </Link>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 220px', minWidth: 200 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Custo do perfume base · por ml
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  height: 40,
                  padding: '0 13px',
                  border: `1px solid ${simulando ? 'rgba(224,168,74,.55)' : 'rgba(239,209,140,.4)'}`,
                  background: 'rgba(255,255,255,.03)',
                  borderRadius: 9,
                }}
              >
                <span className="font-mono" style={{ fontSize: 12, color: 'rgba(242,237,227,.45)' }}>
                  R$
                </span>
                <input
                  value={custoTexto ?? texto(base.custoPorMl)}
                  onChange={(e) => setCustoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onBlur={() => setCustoTexto((t) => (t === '' ? null : t))}
                  className="font-mono"
                  inputMode="decimal"
                  aria-label="Custo por ml"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: 0,
                    outline: 0,
                    background: 'transparent',
                    color: 'var(--color-corrente)',
                    fontWeight: 500,
                    fontSize: 15,
                  }}
                />
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                  / ml
                </span>
              </span>
              {simulando ? (
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, lineHeight: 1.45, color: COR.atencao, textWrap: 'pretty' }}
                  >
                    {`Simulação — o catálogo continua com ${brl(base.custoPorMl)}/ml.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustoTexto(null)}
                    className="font-sans hover:brightness-125"
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      fontWeight: 600,
                      fontSize: 10,
                      color: 'var(--color-ouro)',
                      cursor: 'pointer',
                    }}
                  >
                    Voltar ao custo do catálogo
                  </button>
                </span>
              ) : (
                <span
                  className="font-sans"
                  style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
                >
                  {base.custoPorMl > 0
                    ? 'Veio do catálogo desta base. Mude o número para simular sem gravar nada.'
                    : 'Ainda não há custo cadastrado. Digite um valor para simular.'}
                </span>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 200px', minWidth: 180 }}>
              <span
                className="font-sans"
                style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-secundario)' }}
              >
                Margem líquida alvo
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  height: 40,
                  padding: '0 13px',
                  border: '1px solid rgba(239,209,140,.4)',
                  background: 'rgba(255,255,255,.03)',
                  borderRadius: 9,
                }}
              >
                <input
                  value={margemTexto ?? String(parametros.margemAlvo).replace('.', ',')}
                  onChange={(e) => setMargemTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onBlur={() => setMargemTexto((t) => (t === '' ? null : t))}
                  className="font-mono"
                  inputMode="decimal"
                  aria-label="Margem líquida alvo"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: 0,
                    outline: 0,
                    background: 'transparent',
                    color: 'var(--color-ouro)',
                    fontWeight: 500,
                    fontSize: 15,
                  }}
                />
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
                  %
                </span>
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}
              >
                Vale para todas as bases. Salvar o padrão é em Configurações → Precificação.
              </span>
            </label>
          </div>
        </section>

        <Tabela
          colunas={colunas}
          itens={linhas}
          chaveDe={(l) => String(l.variante)}
          aoClicar={(l) => setVarianteSel(l.variante)}
          selecionadoDe={(l) => l.variante === varianteSel}
          bandeiraDe={(l) => (l.variante === varianteSel ? 'ouro' : null)}
        />

        <PublicarPrecos base={base} linhas={linhas} simulando={simulando} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section
          className="card-ouro"
          style={{
            borderRadius: 16,
            padding: '19px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 15,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <TituloSecao tom="ouro" tamanho={14.5}>
              {`Composição · ${varianteSel} ml`}
            </TituloSecao>
            <div style={{ flex: 1 }} />
            <Valor tamanho={13} tom={tomMargem(calcSel.margem)}>
              {pct(calcSel.margem)}
            </Valor>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {composicao.map((q) => {
              const tom: Tom =
                q.tipo === 'preco'
                  ? 'ouro'
                  : q.tipo === 'lucro'
                    ? calcSel.margem >= margemAlvo
                      ? 'ok'
                      : 'atencao'
                    : q.tipo === 'taxa'
                      ? 'atencao'
                      : 'erro'
              const forte = q.tipo === 'preco' || q.tipo === 'lucro'
              return (
                <span key={q.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <span
                      className="font-sans"
                      style={{
                        fontWeight: forte ? 600 : 400,
                        fontSize: 11,
                        lineHeight: 1.4,
                        color: 'var(--color-secundario)',
                      }}
                    >
                      {q.label}
                    </span>
                    <Valor tamanho={12} peso={forte ? 600 : 400} tom={tom}>
                      {q.valor < 0 ? `- ${brl(Math.abs(q.valor))}` : brl(q.valor)}
                    </Valor>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      height: 4,
                      borderRadius: 2,
                      background: 'rgba(255,255,255,.05)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max(0, Math.min(100, q.pct))}%`,
                        background: COR[tom],
                        borderRadius: 2,
                        opacity: 0.75,
                      }}
                    />
                  </span>
                </span>
              )
            })}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '13px 14px',
              borderRadius: 11,
              background: 'rgba(255,255,255,.028)',
              border: '1px solid var(--color-borda)',
            }}
          >
            <Rotulo>Piso de negociação</Rotulo>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <Valor tamanho={17}>{brl(calcSel.piso)}</Valor>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
              >
                {`margem mínima de ${pct(pisoMargem(params), 0)}`}
              </span>
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)' }}
            >
              Abaixo disso, cupom ou frete grátis consomem o lucro do pedido.
            </span>
          </div>
        </section>

        <FrascoEEstoque base={base} variante={varianteSel} />
      </div>

      {trocando && (
        <SeletorPerfume
          bases={bases}
          atualId={base.id}
          aoEscolher={(id) => {
            setBaseId(id)
            // O custo digitado era do perfume anterior; sem isto a tabela do
            // novo perfume nasceria com o número errado.
            setCustoTexto(null)
            setTrocando(false)
          }}
          aoFechar={() => setTrocando(false)}
        />
      )}
    </div>
  )
}

/** Cabeçalho: de qual perfume são os preços da tela. */
function PerfumeEscolhido({
  base,
  total,
  aoTrocar,
}: {
  base: PerfumeBase
  total: number
  aoTrocar: () => void
}) {
  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 15,
        background: 'linear-gradient(170deg,#17161A,#101011)',
        border: '1px solid rgba(239,209,140,.22)',
        borderRadius: 16,
        padding: '15px 18px',
      }}
    >
      <Foto url={base.imagemUrl} altura={62} largura={48} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <TituloSecao tamanho={16}>{base.nome}</TituloSecao>
          <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
            {base.marca}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {base.custoPorMl > 0 ? (
            <Badge tom="ok">{`${brl(base.custoPorMl)} / ml`}</Badge>
          ) : (
            <Badge tom="erro">Sem custo por ml</Badge>
          )}
          <Badge tom={base.volumeMl > 0 ? 'neutro' : 'atencao'}>
            {`${volume(base.volumeMl)} em estoque`}
          </Badge>
          {base.genero && <Badge tom="neutro">{base.genero}</Badge>}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flex: 'none' }}>
        <BotaoSecundario altura={34} onClick={aoTrocar}>
          Trocar perfume
        </BotaoSecundario>
        <Link
          href="/produtos"
          className="font-sans"
          style={{ fontWeight: 600, fontSize: 10, color: 'var(--color-ouro)', whiteSpace: 'nowrap' }}
        >
          {`Editar no catálogo · ${total} bases →`}
        </Link>
      </div>
    </section>
  )
}

/**
 * Onde o usuário pergunta "e o vidro?": o tamanho do frasco não é um campo,
 * é uma consequência da variante. O estoque também não: é volume em ml.
 */
function FrascoEEstoque({ base, variante }: { base: PerfumeBase; variante: VarianteMl }) {
  const unidades = Math.floor(base.volumeMl / variante)
  return (
    <section
      style={{
        background: 'linear-gradient(170deg,#141315,#101011)',
        border: '1px solid var(--color-borda)',
        borderRadius: 16,
        padding: '17px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <TituloSecao tamanho={13}>Frasco e estoque</TituloSecao>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Vidro desta variante</Rotulo>
        <Valor tamanho={15} tom="ouro">{`frasco de ${frascoDe(variante)} ml`}</Valor>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Não se digita: até 8 ml o decant vai em vidro de 8 ml, 10 e 15 ml vão em vidro de 15 ml.
          O custo do vidro está em Configurações → Precificação.
        </span>
      </div>

      <div style={{ height: 1, background: 'var(--color-borda)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Estoque desta base</Rotulo>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <Valor tamanho={15} tom={base.volumeMl > 0 ? 'var(--color-corrente)' : 'erro'}>
            {volume(base.volumeMl)}
          </Valor>
          <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
            {`dá ${plural(unidades, 'unidade', 'unidades')} de ${variante} ml`}
          </span>
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          O estoque é medido em ml da base, nunca em unidades. Ele só muda por compra, produção ou
          inventário — cada uma com seu lançamento na trilha.
        </span>
        <Link
          href="/estoque/lotes"
          className="font-sans"
          style={{ fontWeight: 600, fontSize: 10.5, color: 'var(--color-ouro)', marginTop: 3 }}
        >
          Registrar compra de frasco em Estoque → Lotes →
        </Link>
      </div>
    </section>
  )
}

function Foto({ url, altura, largura }: { url?: string; altura: number; largura: number }) {
  if (!url) {
    return (
      <span
        aria-hidden
        style={{
          width: largura,
          height: altura,
          borderRadius: 6,
          flex: 'none',
          border: '1px solid var(--color-borda)',
          background:
            'repeating-linear-gradient(135deg,rgba(239,209,140,.14) 0 3px,rgba(239,209,140,.05) 3px 6px)',
        }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{
        width: largura,
        height: altura,
        borderRadius: 6,
        objectFit: 'cover',
        flex: 'none',
        border: '1px solid var(--color-borda)',
        background: '#131214',
      }}
    />
  )
}

/**
 * Escolher entre centenas de bases: busca por nome ou marca, com o custo à
 * vista para não precificar o perfume errado.
 */
function SeletorPerfume({
  bases,
  atualId,
  aoEscolher,
  aoFechar,
}: {
  bases: PerfumeBase[]
  atualId: string
  aoEscolher: (id: string) => void
  aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('Todos')

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      bases.filter((b) => {
        if (filtro === 'Com custo' && b.custoPorMl === 0) return false
        if (filtro === 'Sem custo' && b.custoPorMl > 0) return false
        if (!termo) return true
        return b.nome.toLowerCase().includes(termo) || b.marca.toLowerCase().includes(termo)
      }),
    [bases, filtro, termo],
  )

  const contagem = (f: Filtro) =>
    f === 'Todos'
      ? bases.length
      : bases.filter((b) => (f === 'Com custo' ? b.custoPorMl > 0 : b.custoPorMl === 0)).length

  return (
    <Modal titulo="Escolher perfume base" largura={620} padding={0} aoFechar={aoFechar}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--color-borda)',
        }}
      >
        <TituloSecao tamanho={14}>Escolher perfume base</TituloSecao>
        <label
          className="focus-within:border-ouro/45"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 38,
            padding: '0 13px',
            border: '1px solid rgba(255,255,255,.1)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 11,
              height: 11,
              border: '1.4px solid rgba(242,237,227,.4)',
              borderRadius: '50%',
              flex: 'none',
            }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou marca…"
            autoFocus
            className="font-sans"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'var(--color-corrente)',
              fontSize: 12.5,
              lineHeight: 1,
            }}
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {FILTROS.map((f) => {
            const ativo = filtro === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 29,
                  padding: '0 13px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 11,
                  lineHeight: 1,
                  borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${f} · ${contagem(f)}`}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {`${plural(visiveis.length, 'resultado', 'resultados')}`}
          </span>
        </div>
      </div>

      <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
        {visiveis.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum perfume com esse filtro.
            </span>
          </div>
        ) : (
          visiveis.map((b) => {
            const atual = b.id === atualId
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => aoEscolher(b.id)}
                className="hover:bg-white/[.04]"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 20px',
                  border: 0,
                  borderLeft: `2px solid ${atual ? COR.ouro : 'transparent'}`,
                  background: atual ? 'rgba(239,209,140,.07)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Foto url={b.imagemUrl} altura={42} largura={32} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 12.5,
                      lineHeight: 1.3,
                      color: atual ? COR.ouro : 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.nome}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
                  >
                    {b.marca}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flex: 'none' }}>
                  <Valor
                    tamanho={11.5}
                    peso={500}
                    tom={b.custoPorMl === 0 ? 'rgba(242,237,227,.35)' : 'ouro'}
                  >
                    {b.custoPorMl === 0 ? 'sem custo' : `${brl(b.custoPorMl)}/ml`}
                  </Valor>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: b.volumeMl > 0 ? 'rgba(242,237,227,.55)' : 'rgba(242,237,227,.3)' }}
                  >
                    {volume(b.volumeMl)}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}

/**
 * Publica o preço sugerido na Shopify.
 *
 * O caminho é indireto de propósito: a Shopify é dona do catálogo e a Yampi
 * espelha o dela. Escrever nas duas criaria duas verdades de preço, e a
 * próxima sincronia desfaria uma.
 *
 * Só sai o que MUDA. Reenviar o preço que já está lá gastaria chamada e
 * sujaria o histórico da loja sem mexer na vitrine.
 */
function PublicarPrecos({
  base,
  linhas,
  simulando,
}: {
  base: PerfumeBase
  linhas: Linha[]
  simulando: boolean
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [recusadas, setRecusadas] = useState<{ variante: string; motivo: string }[]>([])
  const [pendente, iniciarTransicao] = useTransition()

  const mudam = linhas.filter((l) => l.sugerido > 0 && l.praticado !== l.sugerido)

  const publicar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setRecusadas([])
      const r = await publicarPrecos(
        mudam.map((l) => ({ baseId: base.id, variante: l.variante, preco: l.sugerido })),
      )
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setRecusadas(r.ignoradas)
      setResumo(
        `${plural(r.aplicadas, 'preço publicado', 'preços publicados')} na Shopify` +
          (r.ignoradas.length ? ` · ${plural(r.ignoradas.length, 'recusado', 'recusados')}` : '') +
          '. A Yampi pega o novo preço na próxima sincronia do catálogo — confira lá antes de anunciar.',
      )
    })

  const travado = pendente || simulando || mudam.length === 0

  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        padding: '15px 17px',
        borderRadius: 13,
        background: 'rgba(239,209,140,.045)',
        border: '1px solid var(--color-borda-ouro)',
      }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <TituloSecao tamanho={14}>Levar estes preços para a loja</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          {simulando
            ? 'Você está simulando com um custo diferente do cadastrado. Publicar sairia de um número que não está no catálogo — ajuste o custo da base antes.'
            : mudam.length === 0
              ? 'Todas as variantes desta base já estão publicadas no preço sugerido.'
              : `${plural(mudam.length, 'variante muda', 'variantes mudam')} de preço: ${mudam
                  .map((l) => `${l.variante} ml ${l.praticado === null ? '' : `${brl(l.praticado)} → `}${brl(l.sugerido)}`)
                  .join(' · ')}.`}
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.34)', textWrap: 'pretty' }}
        >
          O preço vai para a Shopify, que é a dona do catálogo. A Yampi espelha o catálogo dela —
          por isso o ERP não escreve nas duas: duas verdades de preço se desfazem na sincronia
          seguinte.
        </span>
        {(erro || resumo) && (
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
          >
            {erro ?? resumo}
          </span>
        )}
        {recusadas.map((r) => (
          <span
            key={r.variante}
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.45, color: COR.atencao, textWrap: 'pretty' }}
          >
            {`${r.variante}: ${r.motivo}`}
          </span>
        ))}
      </span>

      <button
        type="button"
        onClick={publicar}
        disabled={travado}
        className="botao-ouro font-sans hover:brightness-[1.07]"
        style={{
          height: 38,
          padding: '0 18px',
          fontWeight: 700,
          fontSize: 11.5,
          lineHeight: 1,
          borderRadius: 9,
          whiteSpace: 'nowrap',
          flex: 'none',
          cursor: pendente ? 'wait' : travado ? 'not-allowed' : 'pointer',
          opacity: travado ? 0.45 : 1,
        }}
      >
        {pendente ? 'Publicando…' : `Publicar na Shopify${mudam.length ? ` · ${mudam.length}` : ''}`}
      </button>
    </section>
  )
}
