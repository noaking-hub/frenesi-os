'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState, useTransition } from 'react'

import { Badge, BotaoSecundario, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { CupomYampi } from '@/data/yampi-crm'
import { plural } from '@/domain'

import { excluirCuponsEmLote } from './actions'
import { AcoesCupom, LoteCupons } from './GerirCupons'
import { NovoCupom } from './NovoCupom'

export type Situacao = 'Ativo' | 'Expirado' | 'Esgotado' | 'Pausado' | 'Agendado'
export type CupomComSituacao = CupomYampi & { situacao: Situacao }

const TOM_SITUACAO: Record<Situacao, Tom> = {
  Ativo: 'ok',
  Expirado: 'neutro',
  Esgotado: 'atencao',
  Pausado: 'neutro',
  Agendado: 'info',
}

const FILTROS = ['Todos', 'Ativos', 'Esgotados', 'Expirados', 'Pausados'] as const
type Filtro = (typeof FILTROS)[number]

const ALVO_DO_FILTRO: Record<Filtro, Situacao | null> = {
  Todos: null,
  Ativos: 'Ativo',
  Esgotados: 'Esgotado',
  Expirados: 'Expirado',
  Pausados: 'Pausado',
}

const ORDENS = ['Mais usados', 'Vigência', 'Código A→Z'] as const
type Ordem = (typeof ORDENS)[number]

function dataBr(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * A lista de cupons com busca, filtro por situação e ordenação.
 *
 * Cliente porque filtrar 200 códigos precisa responder na tecla, não numa
 * viagem ao servidor — a leitura da Yampi já aconteceu na página.
 */
export function ListaCupons({ cupons }: { cupons: CupomComSituacao[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [ordem, setOrdem] = useState<Ordem>('Mais usados')
  // Seleção para excluir em lote, pelos ids da Yampi — cupom sem id não tem
  // como ser excluído e por isso não entra.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [resumo, setResumo] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [excluindo, iniciarTransicao] = useTransition()
  const router = useRouter()

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    const alvo = ALVO_DO_FILTRO[filtro]
    return cupons
      .filter((c) => (alvo ? c.situacao === alvo : true))
      .filter(
        (c) =>
          !termo ||
          [c.codigo, c.descricao ?? '', c.regra].some((v) => v.toLowerCase().includes(termo)),
      )
      .sort((a, b) => {
        if (ordem === 'Código A→Z') return a.codigo.localeCompare(b.codigo, 'pt-BR')
        if (ordem === 'Vigência') {
          // Sem prazo vai para o fim: quem expira antes precisa aparecer antes.
          const fa = a.expiraEm ? new Date(a.expiraEm).getTime() : Infinity
          const fb = b.expiraEm ? new Date(b.expiraEm).getTime() : Infinity
          return fa - fb
        }
        return b.usos - a.usos
      })
  }, [cupons, filtro, termo, ordem])

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  const visiveisComId = visiveis.filter((c) => c.id !== null)
  const todosVisiveisMarcados =
    visiveisComId.length > 0 && visiveisComId.every((c) => selecionados.has(c.id as string))

  const alternarVisiveis = () =>
    setSelecionados((s) => {
      const novo = new Set(s)
      for (const c of visiveisComId) {
        if (todosVisiveisMarcados) novo.delete(c.id as string)
        else novo.add(c.id as string)
      }
      return novo
    })

  const excluirSelecionados = () => {
    const escolhidos = cupons
      .filter((c) => c.id && selecionados.has(c.id))
      .map((c) => ({ id: c.id as string, codigo: c.codigo }))
    if (escolhidos.length === 0) return
    if (
      !window.confirm(
        `Excluir ${plural(escolhidos.length, 'cupom', 'cupons')} do checkout da Yampi? A exclusão vale na hora e não tem volta.`,
      )
    ) {
      return
    }
    iniciarTransicao(async () => {
      setResumo(null)
      const r = await excluirCuponsEmLote(escolhidos)
      if (!r.ok) {
        setResumo({ tom: 'erro', texto: r.erro })
        return
      }
      const { excluidos, falhas } = r.resultado
      // Quem falhou continua marcado — dá para tentar de novo sem reprocurar.
      const idsFalhos = new Set(
        cupons.filter((c) => c.id && falhas.some((f) => f.codigo === c.codigo)).map((c) => c.id as string),
      )
      setSelecionados(idsFalhos)
      setResumo(
        falhas.length === 0
          ? { tom: 'ok', texto: `${plural(excluidos.length, 'cupom excluído', 'cupons excluídos')} do checkout.` }
          : {
              tom: 'erro',
              texto:
                `${plural(excluidos.length, 'cupom excluído', 'cupons excluídos')}; ${plural(falhas.length, 'falhou', 'falharam')}: ` +
                falhas.slice(0, 4).map((f) => `${f.codigo} (${f.erro})`).join(' · ') +
                (falhas.length > 4 ? ` e mais ${falhas.length - 4}` : '') +
                '. Os que falharam continuam selecionados — tente de novo.',
            },
      )
      router.refresh()
    })
  }

  const colunas: Coluna<CupomComSituacao>[] = [
    {
      chave: 'selecao',
      titulo: (
        <input
          type="checkbox"
          checked={todosVisiveisMarcados}
          onChange={alternarVisiveis}
          aria-label="Selecionar todos os cupons visíveis"
          style={{ accentColor: COR.ouro, cursor: 'pointer' }}
        />
      ),
      largura: '36px',
      render: (c) =>
        c.id ? (
          <input
            type="checkbox"
            checked={selecionados.has(c.id)}
            onChange={() => alternar(c.id as string)}
            aria-label={`Selecionar ${c.codigo}`}
            style={{ accentColor: COR.ouro, cursor: 'pointer' }}
          />
        ) : null,
    },
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '170px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-ouro)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.codigo}
          </span>
          {c.descricao && (
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.descricao}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'regra',
      titulo: 'Regra',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span className="font-sans" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}>
          {c.regra}
        </span>
      ),
    },
    {
      chave: 'usos',
      titulo: 'Usos',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => {
        const pctUsos = c.limite ? Math.min(100, Math.round((c.usos / c.limite) * 100)) : null
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
              {c.limite ? `${c.usos} / ${c.limite}` : plural(c.usos, 'uso', 'usos')}
            </span>
            {pctUsos !== null && (
              <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${pctUsos}%`,
                    background: pctUsos > 80 ? COR.atencao : 'rgba(239,209,140,.55)',
                    borderRadius: 2,
                  }}
                />
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'vigencia',
      titulo: 'Vigência',
      largura: '150px',
      render: (c) => {
        const inicio = dataBr(c.comecaEm)
        const fim = dataBr(c.expiraEm)
        return (
          <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
            {inicio && fim ? `${inicio} → ${fim}` : fim ? `até ${fim}` : inicio ? `desde ${inicio}` : 'Sem prazo'}
          </span>
        )
      },
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '96px',
      render: (c) => <Badge tom={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '108px',
      render: (c) => <AcoesCupom cupom={c} />,
    },
  ]

  const chip = (ativo: boolean): React.CSSProperties => ({
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
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Cupons do checkout</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Lidos ao vivo da Yampi — o que está aqui é o que o checkout aceita agora
        </span>
        <div style={{ flex: 1 }} />
        <LoteCupons />
        <NovoCupom />
      </div>

      <label
        className="focus-within:border-ouro/45"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          maxWidth: 480,
          height: 38,
          padding: '0 14px',
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
          placeholder="Buscar por código, descrição ou regra"
          className="font-sans"
          style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }}
        />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const alvo = ALVO_DO_FILTRO[f]
          const contagem = alvo ? cupons.filter((c) => c.situacao === alvo).length : cupons.length
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="hover:border-ouro/40 font-sans"
              style={chip(filtro === f)}
            >
              {`${f} · ${contagem}`}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {ORDENS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrdem(o)}
            className="hover:border-ouro/40 font-sans"
            style={chip(ordem === o)}
          >
            {o}
          </button>
        ))}
      </div>

      {(selecionados.size > 0 || resumo) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '10px 14px',
            border: `1px solid ${selecionados.size > 0 ? 'rgba(224,122,95,.35)' : 'var(--color-borda)'}`,
            background: selecionados.size > 0 ? 'rgba(224,122,95,.05)' : 'rgba(255,255,255,.02)',
            borderRadius: 11,
          }}
        >
          {selecionados.size > 0 && (
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 11.5, color: 'var(--color-corrente)' }}>
              {plural(selecionados.size, 'cupom selecionado', 'cupons selecionados')}
            </span>
          )}
          {resumo && (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.45, color: resumo.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}
            >
              {resumo.texto}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {selecionados.size > 0 && (
            <>
              <BotaoSecundario altura={32} onClick={() => setSelecionados(new Set())} desabilitado={excluindo}>
                Limpar seleção
              </BotaoSecundario>
              <button
                type="button"
                onClick={excluirSelecionados}
                disabled={excluindo}
                className="font-sans hover:brightness-110"
                style={{
                  height: 32,
                  padding: '0 15px',
                  border: '1px solid rgba(224,122,95,.5)',
                  background: 'rgba(224,122,95,.14)',
                  color: COR.erro,
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: excluindo ? 'wait' : 'pointer',
                  opacity: excluindo ? 0.55 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {excluindo
                  ? 'Excluindo… (meio segundo por cupom, pode demorar)'
                  : `Excluir ${selecionados.size} do checkout`}
              </button>
            </>
          )}
        </div>
      )}

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(c) => c.codigo}
        bandeiraDe={(c) => (c.situacao === 'Esgotado' ? 'atencao' : null)}
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum cupom nesse recorte — troque o filtro ou limpe a busca.
            </span>
          </div>
        }
      />

      <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
        {`${visiveis.length} de ${plural(cupons.length, 'cupom', 'cupons')} · filtro ${filtro} · ordenado por ${ordem.toLowerCase()}`}
      </span>
    </div>
  )
}
