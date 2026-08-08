'use client'

import { useMemo, useState, useTransition } from 'react'

import { Badge, BotaoOuro, BotaoSecundario, Rotulo, Switch, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Modal } from '@/components/erp/Modal'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { brl, pct, plural, volume } from '@/domain'
import type { PerfumeBase } from '@/domain'

import { salvarPerfumeBase } from './actions'

export interface LinhaCatalogo {
  base: PerfumeBase
  unidades: number
  margemMedia: number | null
  status: string
  tom: Tom
  coberturaDias: number
}

const FILTROS = ['Todos', 'Sem custo', 'Com custo', 'Com volume', 'Inativos'] as const
type Filtro = (typeof FILTROS)[number]

const GENEROS: PerfumeBase['genero'][] = ['Masculino', 'Feminino', 'Unissex']

export function CatalogoCliente({ linhas }: { linhas: LinhaCatalogo[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [emEdicao, setEmEdicao] = useState<PerfumeBase | null>(null)

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      linhas.filter((l) => {
        // Inativo só aparece no filtro dele — senão a lista de operação mente.
        if (filtro === 'Inativos' ? l.base.ativo !== false : l.base.ativo === false) return false
        if (filtro === 'Sem custo' && l.base.custoPorMl > 0) return false
        if (filtro === 'Com custo' && l.base.custoPorMl === 0) return false
        if (filtro === 'Com volume' && l.base.volumeMl <= 0) return false
        if (!termo) return true
        return (
          l.base.nome.toLowerCase().includes(termo) || l.base.marca.toLowerCase().includes(termo)
        )
      }),
    [linhas, filtro, termo],
  )

  const contagem = (f: Filtro) =>
    linhas.filter((l) => {
      if (f === 'Inativos') return l.base.ativo === false
      if (l.base.ativo === false) return false
      if (f === 'Sem custo') return l.base.custoPorMl === 0
      if (f === 'Com custo') return l.base.custoPorMl > 0
      if (f === 'Com volume') return l.base.volumeMl > 0
      return true
    }).length

  const colunas: Coluna<LinhaCatalogo>[] = [
    {
      chave: 'foto',
      titulo: '',
      largura: '46px',
      render: (l) =>
        l.base.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.base.imagemUrl}
            alt=""
            loading="lazy"
            style={{
              width: 34,
              height: 44,
              borderRadius: 5,
              objectFit: 'cover',
              border: '1px solid var(--color-borda)',
              display: 'block',
              background: '#131214',
              opacity: l.base.ativo === false ? 0.4 : 1,
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 34,
              height: 44,
              borderRadius: 5,
              background:
                'repeating-linear-gradient(135deg,rgba(239,209,140,.14) 0 3px,rgba(239,209,140,.05) 3px 6px)',
              border: '1px solid var(--color-borda)',
              display: 'block',
            }}
          />
        ),
    },
    {
      chave: 'perfume',
      titulo: 'Perfume',
      largura: 'minmax(0,1fr)',
      render: (l) => <CelulaDupla principal={l.base.nome} secundaria={l.base.marca} />,
    },
    {
      chave: 'genero',
      titulo: 'Gênero',
      largura: '92px',
      render: (l) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1, color: 'var(--color-secundario)' }}
        >
          {l.base.genero ?? '—'}
        </span>
      ),
    },
    {
      chave: 'volume',
      titulo: 'Volume',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor
          tamanho={12}
          tom={l.base.volumeMl === 0 ? 'erro' : l.tom === 'atencao' ? 'atencao' : 'var(--color-corrente)'}
        >
          {volume(l.base.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'unidades',
      titulo: 'Unidades',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.72)">
          {`${l.unidades} un`}
        </Valor>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Custo/ml',
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor
          tamanho={12}
          peso={400}
          tom={l.base.custoPorMl === 0 ? 'rgba(242,237,227,.35)' : 'rgba(242,237,227,.72)'}
        >
          {l.base.custoPorMl === 0 ? '—' : brl(l.base.custoPorMl)}
        </Valor>
      ),
    },
    {
      chave: 'margem',
      titulo: 'Margem',
      largura: '86px',
      alinhamento: 'right',
      render: (l) => (
        <Valor
          tamanho={12}
          tom={
            l.margemMedia === null
              ? 'var(--color-terciario)'
              : l.margemMedia >= 0 && l.margemMedia < 20
                ? 'atencao'
                : 'ok'
          }
        >
          {l.margemMedia === null ? '—' : pct(l.margemMedia, 0)}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '116px',
      render: (l) =>
        l.base.ativo === false ? <Badge tom="neutro">Inativo</Badge> : <Badge tom={l.tom}>{l.status}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Catálogo de perfumes base</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Clique numa linha para editar. Status derivado da cobertura e da margem dos preços.
        </span>
        <div style={{ flex: 1 }} />
        <BotaoOuro altura={34}>+ Novo perfume base</BotaoOuro>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label
          className="focus-within:border-ouro/45"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flex: 1,
            minWidth: 260,
            maxWidth: 420,
            height: 36,
            padding: '0 13px',
            border: '1px solid rgba(255,255,255,.09)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
          }}
        >
          <span
            aria-hidden
            style={{ width: 11, height: 11, border: '1.4px solid rgba(242,237,227,.4)', borderRadius: '50%', flex: 'none' }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou marca…"
            className="font-sans"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }}
          />
        </label>
        {FILTROS.map((f) => {
          const ativo = filtro === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="hover:border-ouro/40 font-sans"
              style={{
                height: 31,
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
      </div>

      <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
        {`Mostrando ${plural(visiveis.length, 'perfume', 'perfumes')} de ${linhas.length}.`}
      </span>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(l) => l.base.id}
        aoClicar={(l) => setEmEdicao(l.base)}
        bandeiraDe={(l) =>
          l.base.ativo === false ? null : l.tom === 'erro' ? 'erro' : l.tom === 'atencao' ? 'atencao' : null
        }
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum perfume com esse filtro.
            </span>
          </div>
        }
      />

      {emEdicao && <Editor base={emEdicao} aoFechar={() => setEmEdicao(null)} />}
    </div>
  )
}

function Editor({ base, aoFechar }: { base: PerfumeBase; aoFechar: () => void }) {
  const [genero, setGenero] = useState<PerfumeBase['genero'] | null>(base.genero ?? null)
  const [custoTexto, setCustoTexto] = useState(base.custoPorMl ? String(base.custoPorMl).replace('.', ',') : '')
  const [consumoTexto, setConsumoTexto] = useState(
    base.consumoDiarioMl ? String(base.consumoDiarioMl).replace('.', ',') : '',
  )
  const [ativo, setAtivo] = useState(base.ativo !== false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const numero = (t: string) => {
    const n = parseFloat(t.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await salvarPerfumeBase({
        id: base.id,
        genero,
        custoPorMl: numero(custoTexto),
        consumoDiarioMl: numero(consumoTexto),
        ativo,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const campo = {
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

  return (
    <Modal titulo={`Editar ${base.nome}`} aoFechar={aoFechar}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {base.imagemUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={base.imagemUrl}
              alt=""
              style={{ width: 52, height: 66, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-borda)', flex: 'none' }}
            />
          )}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
            <TituloSecao tamanho={15}>{base.nome}</TituloSecao>
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              {base.marca}
            </span>
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Nome, marca e imagem vêm da Shopify — para mudar, edite na loja e reimporte o
              catálogo.
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Gênero</Rotulo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[...GENEROS, null].map((g) => {
              const escolhido = genero === g
              return (
                <button
                  key={g ?? 'nenhum'}
                  type="button"
                  onClick={() => setGenero(g)}
                  className="hover:border-ouro/40 font-sans"
                  style={{
                    height: 32,
                    padding: '0 14px',
                    border: `1px solid ${escolhido ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                    background: escolhido ? 'rgba(239,209,140,.09)' : 'transparent',
                    color: escolhido ? COR.ouro : 'rgba(242,237,227,.65)',
                    fontWeight: 600,
                    fontSize: 11.5,
                    lineHeight: 1,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {g ?? 'Não informado'}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Rotulo>Custo por ml (R$)</Rotulo>
            <input
              value={custoTexto}
              onChange={(e) => setCustoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder="0,00"
              className="font-mono"
              style={campo}
            />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Normalmente vem das compras (Estoque → Lotes). Ajuste aqui só para corrigir — não
              gera lote nem movimentação.
            </span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Rotulo>Consumo diário (ml)</Rotulo>
            <input
              value={consumoTexto}
              onChange={(e) => setConsumoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className="font-mono"
              style={campo}
            />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Base do cálculo de cobertura (&ldquo;acaba em X dias&rdquo;). Será derivado das vendas
              quando os pedidos forem integrados.
            </span>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 14px',
            borderRadius: 10,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}>
              Perfume ativo
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              Desativado, sai do estoque, da produção e da sincronia — sem apagar o histórico. Use
              para os perfumes que você não fraciona.
            </span>
          </span>
          <Switch ligado={ativo} onChange={setAtivo} label={ativo ? 'Desativar perfume' : 'Ativar perfume'} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            padding: '11px 13px',
            borderRadius: 10,
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <Rotulo>Volume em estoque</Rotulo>
          <Valor tamanho={13} tom={base.volumeMl === 0 ? 'erro' : 'ouro'}>
            {volume(base.volumeMl)}
          </Valor>
          <span className="font-sans" style={{ flex: 1, fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
            Não se edita aqui: muda por compra, produção ou inventário — cada uma com seu
            lançamento na trilha.
          </span>
        </div>

        {erro && (
          <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
            {erro}
          </span>
        )}

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <BotaoSecundario altura={36} onClick={aoFechar}>
            Cancelar
          </BotaoSecundario>
          <button
            type="button"
            onClick={salvar}
            disabled={pendente}
            className="botao-ouro font-sans hover:brightness-[1.07]"
            style={{
              height: 36,
              padding: '0 18px',
              fontWeight: 700,
              fontSize: 11.5,
              lineHeight: 1,
              borderRadius: 9,
              cursor: pendente ? 'wait' : 'pointer',
              opacity: pendente ? 0.6 : 1,
            }}
          >
            {pendente ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
    </Modal>
  )
}
