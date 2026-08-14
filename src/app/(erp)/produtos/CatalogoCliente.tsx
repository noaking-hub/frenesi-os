'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState, useTransition } from 'react'

import { BotaoOuro } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { ROTULO_ESTOQUE, ROTULO_INTEGRACAO, brl, pct, plural, volume } from '@/domain'
import type { EstadoIntegracao, ProdutoAvaliado } from '@/domain'

import {
  BotaoIcone,
  BotaoMassa,
  Busca,
  Caixa,
  CaixaSeletor,
  CardMetrica,
  Dupla,
  Faixa,
  IcAlerta,
  IcCheque,
  IcExportar,
  IcFrasco,
  IcKebab,
  IcRelogio,
  IcXCirculo,
  ItemMenu,
  Menu,
  Pilula,
} from '../pedidos/PedidosCliente'

import { definirAtivos } from './actions'
import { CriadorPerfume, EditorPerfume } from './EditorPerfume'

/**
 * Catálogo no padrão do módulo de Pedidos: cards que medem E filtram, busca
 * ampla, filtros combináveis e a linha respondendo variantes + saldo + custo
 * + preço + margem + alertas sem abrir nada. O clique na linha abre o
 * Produto 360º — o dossiê completo do perfume.
 */

const CARTOES = [
  'todos',
  'sem-custo',
  'sem-estoque',
  'estoque-baixo',
  'margem-baixa',
  'integracao',
  'inativos',
] as const
type Cartao = (typeof CARTOES)[number]

const GRADE =
  '26px 44px minmax(180px,1.3fr) 78px 148px 118px 84px 128px 96px 110px 128px 34px'

const COLUNAS = [
  'Perfume',
  'Gênero',
  'Variantes',
  'Estoque disponível',
  'Custo/ml',
  'Faixa de preço',
  'Margem',
  'Alertas',
  'Status',
]

const TOM_ESTOQUE: Record<ProdutoAvaliado['estadoEstoque'], Tom> = {
  disponivel: 'ok',
  baixo: 'atencao',
  'sem-estoque': 'erro',
  'sem-giro': 'info',
  'sem-carga': 'neutro',
}

export function CatalogoCliente({ linhas }: { linhas: ProdutoAvaliado[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [cartao, setCartao] = useState<Cartao>('todos')
  const [genero, setGenero] = useState('Todos')
  const [integracao, setIntegracao] = useState('Todas')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [recado, setRecado] = useState<{ tom: Tom; texto: string } | null>(null)
  const [emEdicao, setEmEdicao] = useState<ProdutoAvaliado | null>(null)
  const [criando, setCriando] = useState(false)
  const [pendente, iniciar] = useTransition()

  const ativos = useMemo(() => linhas.filter((l) => l.base.ativo !== false), [linhas])

  // Cada cartão é uma pergunta de exceção — e clicar nele filtra a lista.
  // "Margem baixa" vem dos ALERTAS que o domínio já calculou com o piso
  // vigente — repetir o limiar aqui criaria duas verdades sobre a mesma regra.
  const grupo = useMemo(() => {
    const margemBaixa = (l: ProdutoAvaliado) =>
      l.alertas.some((a) => /piso|margem/i.test(a.texto))
    return {
      todos: ativos,
      'sem-custo': ativos.filter((l) => l.base.custoPorMl === 0),
      'sem-estoque': ativos.filter((l) => l.estadoEstoque === 'sem-estoque'),
      'estoque-baixo': ativos.filter((l) => l.estadoEstoque === 'baixo'),
      'margem-baixa': ativos.filter(margemBaixa),
      integracao: ativos.filter((l) => l.integracao !== 'sincronizado'),
      inativos: linhas.filter((l) => l.base.ativo === false),
    } satisfies Record<Cartao, ProdutoAvaliado[]>
  }, [ativos, linhas])

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      grupo[cartao].filter((l) => {
        if (genero !== 'Todos' && (l.base.genero ?? '—') !== genero) return false
        if (integracao !== 'Todas' && ROTULO_INTEGRACAO[l.integracao] !== integracao) return false
        if (!termo) return true
        // Busca ampla do escopo: nome, marca, id, handle, id Shopify e SKU
        // de variante — o operador cola o que tiver na mão.
        const alvo = [
          l.base.nome,
          l.base.marca,
          l.base.id,
          l.base.shopifyHandle ?? '',
          l.base.shopifyProductId ?? '',
          ...l.variantes.map((v) => v.sku ?? ''),
          ...l.variantes.map((v) => v.shopifyVariantId ?? ''),
        ]
          .join(' ')
          .toLowerCase()
        return alvo.includes(termo)
      }),
    [grupo, cartao, genero, integracao, termo],
  )

  const todosVisiveisMarcados =
    visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.base.id))
  const marcarTodos = () =>
    setSelecionados(
      todosVisiveisMarcados
        ? new Set()
        : new Set(visiveis.map((l) => l.base.id)),
    )
  const alternar = (id: string) =>
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const avisar = (tom: Tom, texto: string) => setRecado({ tom, texto })

  const mudarAtivos = (ativo: boolean) =>
    iniciar(async () => {
      const ids = [...selecionados]
      const r = await definirAtivos(ids, ativo)
      if (!r.ok) return avisar('erro', r.erro)
      setSelecionados(new Set())
      avisar('ok', `${plural(r.alterados, 'perfume', 'perfumes')} ${ativo ? 'ativados' : 'desativados'}.`)
      router.refresh()
    })

  // Exportação client-side: o dado já está na tela, e um CSV é o formato que
  // abre no Excel sem cerimônia. Exporta a seleção — ou tudo que está visível.
  const exportar = () => {
    const alvo = selecionados.size
      ? visiveis.filter((l) => selecionados.has(l.base.id))
      : visiveis
    const cab = [
      'id', 'nome', 'marca', 'genero', 'ativo', 'estoque_fisico_ml', 'reservado_ml',
      'disponivel_ml', 'cobertura_dias', 'custo_por_ml', 'preco_min', 'preco_max',
      'margem_min_pct', 'margem_max_pct', 'integracao', 'alertas',
    ]
    const linhasCsv = alvo.map((l) =>
      [
        l.base.id, l.base.nome, l.base.marca, l.base.genero ?? '', l.base.ativo === false ? 'nao' : 'sim',
        l.fisicoMl, l.reservadoMl, l.disponivelMl, l.coberturaDias, l.base.custoPorMl,
        l.faixaPreco?.min ?? '', l.faixaPreco?.max ?? '',
        l.faixaMargem ? l.faixaMargem.min.toFixed(1) : '', l.faixaMargem ? l.faixaMargem.max.toFixed(1) : '',
        ROTULO_INTEGRACAO[l.integracao], l.alertas.map((a) => a.texto).join(' | '),
      ]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(';'),
    )
    const blob = new Blob(['﻿' + [cab.join(';'), ...linhasCsv].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'catalogo-frenesi.csv'
    a.click()
    URL.revokeObjectURL(url)
    avisar('ok', `${plural(alvo.length, 'perfume exportado', 'perfumes exportados')} em CSV.`)
  }

  const abrir360 = (id: string) => router.push(`/produtos/${encodeURIComponent(id)}`)

  const doMenu = menu ? linhas.find((l) => l.base.id === menu.id) : null

  const cards: { chave: Cartao; label: string; tom: Tom; icone: React.ReactNode; hint: string }[] = [
    { chave: 'todos', label: 'Perfumes ativos', tom: 'ouro', icone: <IcFrasco />, hint: `${grupo['inativos'].length} inativos fora da conta` },
    { chave: 'sem-custo', label: 'Sem custo', tom: 'erro', icone: <IcXCirculo />, hint: 'margem e piso sem cálculo' },
    { chave: 'sem-estoque', label: 'Sem estoque', tom: 'erro', icone: <IcAlerta />, hint: 'saldo disponível zerado' },
    { chave: 'estoque-baixo', label: 'Estoque baixo', tom: 'atencao', icone: <IcRelogio />, hint: 'cobertura abaixo de 20 dias' },
    { chave: 'margem-baixa', label: 'Margem baixa', tom: 'atencao', icone: <IcAlerta />, hint: 'variante abaixo do piso de margem' },
    { chave: 'integracao', label: 'Integração', tom: 'atencao', icone: <IcCheque />, hint: 'sem vínculo ou vínculo parcial' },
    { chave: 'inativos', label: 'Inativos', tom: 'neutro', icone: <IcXCirculo />, hint: 'fora da operação, com histórico' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Cards que medem e filtram ─────────────────────────────────── */}
      <div
        className="empilha-900"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 10 }}
      >
        {cards.map((c) => (
          <CardMetrica
            key={c.chave}
            label={c.label}
            valor={String(grupo[c.chave].length)}
            hint={c.hint}
            tom={c.tom}
            corNumero={
              c.tom === 'erro' && grupo[c.chave].length > 0
                ? COR.erro
                : c.tom === 'atencao' && grupo[c.chave].length > 0
                  ? COR.atencao
                  : undefined
            }
            icone={c.icone}
            ativo={cartao === c.chave}
            aoClicar={() => setCartao(cartao === c.chave ? 'todos' : c.chave)}
          />
        ))}
      </div>

      {/* ── Busca e filtros combináveis ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <Busca valor={busca} aoMudar={setBusca} />
        <CaixaSeletor rotulo="Gênero" valor={genero} aoMudar={setGenero}>
          {['Todos', 'Masculino', 'Feminino', 'Unissex', '—'].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </CaixaSeletor>
        <CaixaSeletor rotulo="Integração" valor={integracao} aoMudar={setIntegracao}>
          {['Todas', ...Object.values(ROTULO_INTEGRACAO)].map((i) => (
            <option key={i}>{i}</option>
          ))}
        </CaixaSeletor>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={36} onClick={() => setCriando(true)}>
          + Novo perfume base
        </BotaoOuro>
      </div>

      {/* ── Ações em massa ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
          padding: '8px 12px',
          border: '1px solid var(--color-borda)',
          borderRadius: 12,
          background: 'var(--color-mesa)',
        }}
      >
        <Caixa
          marcada={todosVisiveisMarcados}
          mista={selecionados.size > 0 && !todosVisiveisMarcados}
          aoMarcar={marcarTodos}
          rotulo="Selecionar todos os visíveis"
        />
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          {selecionados.size
            ? `${selecionados.size} selecionado(s)`
            : `Selecionar todos (${visiveis.length})`}
        </span>
        <BotaoMassa desabilitado={!selecionados.size || pendente} aoClicar={() => mudarAtivos(true)}>
          Ativar
        </BotaoMassa>
        <BotaoMassa desabilitado={!selecionados.size || pendente} aoClicar={() => mudarAtivos(false)}>
          Desativar
        </BotaoMassa>
        <BotaoMassa icone={<IcExportar />} aoClicar={exportar} titulo="Exporta a seleção, ou tudo que está visível">
          Exportar CSV
        </BotaoMassa>
      </div>

      {recado && <Faixa tom={recado.tom} texto={recado.texto} aoFechar={() => setRecado(null)} />}

      {/* ── Tabela ────────────────────────────────────────────────────── */}
      <div
        style={{
          border: '1px solid var(--color-borda)',
          borderRadius: 14,
          background: 'var(--color-mesa)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 330px)' }}>
          <div style={{ minWidth: 1180 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: GRADE,
                gap: 10,
                alignItems: 'center',
                padding: '9px 14px',
                background: '#161617',
                borderBottom: '1px solid var(--color-borda)',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}
            >
              <span aria-hidden />
              <span aria-hidden />
              {COLUNAS.map((t) => (
                <span
                  key={t}
                  className="font-sans"
                  style={{
                    fontWeight: 600,
                    fontSize: 8.5,
                    letterSpacing: '.11em',
                    textTransform: 'uppercase',
                    color: 'var(--color-terciario)',
                  }}
                >
                  {t}
                </span>
              ))}
              <span aria-hidden />
            </div>

            {visiveis.map((l) => {
              const alertaGrave = l.alertas.some((a) => a.grau === 'erro')
              return (
                <div
                  key={l.base.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => abrir360(l.base.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') abrir360(l.base.id)
                  }}
                  className="hover:bg-[rgba(255,255,255,.025)]"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: GRADE,
                    gap: 10,
                    alignItems: 'center',
                    padding: '7px 14px',
                    borderTop: '1px solid var(--color-borda-sutil)',
                    borderLeft: `2px solid ${
                      l.base.ativo === false
                        ? 'transparent'
                        : alertaGrave
                          ? COR.erro
                          : l.alertas.length
                            ? COR.atencao
                            : 'transparent'
                    }`,
                    cursor: 'pointer',
                    opacity: l.base.ativo === false ? 0.55 : 1,
                  }}
                >
                  <span onClick={(e) => e.stopPropagation()}>
                    <Caixa
                      marcada={selecionados.has(l.base.id)}
                      aoMarcar={() => alternar(l.base.id)}
                      rotulo={`Selecionar ${l.base.nome}`}
                    />
                  </span>

                  {l.base.imagemUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.base.imagemUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        width: 32,
                        height: 42,
                        borderRadius: 5,
                        objectFit: 'cover',
                        border: '1px solid var(--color-borda)',
                        background: '#131214',
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 32,
                        height: 42,
                        borderRadius: 5,
                        background:
                          'repeating-linear-gradient(135deg,rgba(239,209,140,.14) 0 3px,rgba(239,209,140,.05) 3px 6px)',
                        border: '1px solid var(--color-borda)',
                        display: 'block',
                      }}
                    />
                  )}

                  <Dupla principal={l.base.nome} secundaria={l.base.marca} />

                  <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-secundario)' }}>
                    {l.base.genero ?? '—'}
                  </span>

                  {/* Volumetrias: aceso = com preço; apagado = sem venda. */}
                  <span style={{ display: 'flex', gap: 4 }}>
                    {l.variantes.map((v) => (
                      <span
                        key={v.variante}
                        className="font-mono"
                        title={
                          v.preco > 0
                            ? `${v.variante} ml · ${brl(v.preco)}${v.sku ? ` · ${v.sku}` : ' · sem SKU'}`
                            : `${v.variante} ml sem preço`
                        }
                        style={{
                          fontSize: 9.5,
                          lineHeight: 1,
                          padding: '4px 5px',
                          borderRadius: 5,
                          border: `1px solid ${v.preco > 0 ? 'rgba(239,209,140,.35)' : 'rgba(255,255,255,.07)'}`,
                          color: v.preco > 0 ? COR.ouro : 'rgba(242,237,227,.28)',
                          background: v.preco > 0 ? 'rgba(239,209,140,.07)' : 'transparent',
                        }}
                      >
                        {v.variante}
                      </span>
                    ))}
                  </span>

                  <Dupla
                    principal={
                      <span
                        className="font-mono"
                        style={{
                          color:
                            l.disponivelMl === 0
                              ? COR.erro
                              : l.estadoEstoque === 'baixo'
                                ? COR.atencao
                                : COR.ok,
                        }}
                      >
                        {volume(l.disponivelMl)}
                      </span>
                    }
                    secundaria={
                      l.reservadoMl > 0 ? `${volume(l.reservadoMl)} reservados` : undefined
                    }
                  />

                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11.5,
                      color: l.base.custoPorMl === 0 ? 'rgba(242,237,227,.32)' : 'var(--color-corrente)',
                    }}
                  >
                    {l.base.custoPorMl === 0 ? '—' : brl(l.base.custoPorMl)}
                  </span>

                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-corrente)' }}>
                    {l.faixaPreco
                      ? l.faixaPreco.min === l.faixaPreco.max
                        ? brl(l.faixaPreco.min)
                        : `${brl(l.faixaPreco.min)} – ${brl(l.faixaPreco.max)}`
                      : '—'}
                  </span>

                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color: !l.faixaMargem
                        ? 'rgba(242,237,227,.32)'
                        : l.faixaMargem.min < 15
                          ? COR.atencao
                          : COR.ok,
                    }}
                  >
                    {l.faixaMargem
                      ? l.faixaMargem.min === l.faixaMargem.max
                        ? pct(l.faixaMargem.min, 0)
                        : `${pct(l.faixaMargem.min, 0)}–${pct(l.faixaMargem.max, 0)}`
                      : '—'}
                  </span>

                  {l.alertas.length ? (
                    <Pilula tom={alertaGrave ? 'erro' : 'atencao'}>
                      <span title={l.alertas.map((a) => a.texto).join('\n')}>
                        {plural(l.alertas.length, 'alerta', 'alertas')}
                      </span>
                    </Pilula>
                  ) : (
                    <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.3)' }}>
                      —
                    </span>
                  )}

                  {l.base.ativo === false ? (
                    <Pilula tom="neutro">Inativo</Pilula>
                  ) : (
                    <Dupla
                      principal={
                        <span style={{ color: COR[TOM_ESTOQUE[l.estadoEstoque]], fontSize: 11 }}>
                          {ROTULO_ESTOQUE[l.estadoEstoque]}
                        </span>
                      }
                      secundaria={ROTULO_INTEGRACAO[l.integracao]}
                      tomSecundaria={l.integracao === 'sincronizado' ? undefined : 'atencao'}
                    />
                  )}

                  <span onClick={(e) => e.stopPropagation()}>
                    <BotaoIcone
                      rotulo={`Ações de ${l.base.nome}`}
                      menuAberto={menu?.id === l.base.id}
                      aoClicar={(e) => {
                        const r = e.currentTarget.getBoundingClientRect()
                        setMenu(
                          menu?.id === l.base.id ? null : { id: l.base.id, x: r.right, y: r.bottom },
                        )
                      }}
                    >
                      <IcKebab />
                    </BotaoIcone>
                  </span>
                </div>
              )
            })}

            {visiveis.length === 0 && (
              <div style={{ padding: '30px 18px', textAlign: 'center' }}>
                <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                  Nenhum perfume com esse filtro.
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 14px',
            borderTop: '1px solid var(--color-borda)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
            {`${plural(visiveis.length, 'perfume', 'perfumes')} na lista · ${linhas.length} no catálogo`}
          </span>
        </div>
      </div>

      {menu && doMenu && (
        <Menu fixo={{ x: menu.x, y: menu.y }} aoFechar={() => setMenu(null)}>
          <ItemMenu
            aoClicar={() => {
              setMenu(null)
              abrir360(doMenu.base.id)
            }}
          >
            Abrir Produto 360º
          </ItemMenu>
          <ItemMenu
            aoClicar={() => {
              setMenu(null)
              setEmEdicao(doMenu)
            }}
          >
            Editar cadastro
          </ItemMenu>
          <ItemMenu
            aoClicar={() => {
              setMenu(null)
              router.push(`/produtos/precificacao?base=${encodeURIComponent(doMenu.base.id)}`)
            }}
          >
            Abrir na Precificação
          </ItemMenu>
          <ItemMenu
            desabilitado={!doMenu.base.shopifyHandle}
            aoClicar={() => {
              setMenu(null)
              window.open(
                `https://frenesiperfumes.com.br/products/${doMenu.base.shopifyHandle}`,
                '_blank',
                'noopener',
              )
            }}
          >
            Ver na Shopify
          </ItemMenu>
          <ItemMenu
            aoClicar={async () => {
              setMenu(null)
              try {
                await navigator.clipboard.writeText(doMenu.base.id)
                avisar('ok', `ID ${doMenu.base.id} copiado.`)
              } catch {
                avisar('erro', 'O navegador não liberou a área de transferência.')
              }
            }}
          >
            Copiar ID
          </ItemMenu>
        </Menu>
      )}

      {emEdicao && <EditorPerfume base={emEdicao.base} aoFechar={() => setEmEdicao(null)} />}
      {criando && <CriadorPerfume aoFechar={() => setCriando(false)} />}
    </div>
  )
}
