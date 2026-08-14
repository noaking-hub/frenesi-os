'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Barra, Rotulo, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { alertasDaBase, brl, plural, volume } from '@/domain'
import type { AlertaEstoque, CoberturaBase } from '@/domain'

const TOM: Record<CoberturaBase['criticidade'], Tom> = {
  sem_carga: 'neutro',
  sem_giro: 'neutro',
  zero: 'erro',
  urgente: 'erro',
  atencao: 'atencao',
  parado: 'neutro',
  ok: 'ok',
}

type Filtro = 'todos' | 'com_estoque' | 'critico' | 'esgotado' | 'excedente' | 'sem_giro' | 'sem_carga'

const FILTROS: { id: Filtro; rotulo: string; cabe: (c: CoberturaBase) => boolean }[] = [
  { id: 'todos', rotulo: 'Todos', cabe: () => true },
  { id: 'com_estoque', rotulo: 'Com estoque', cabe: (c) => c.fisicoMl > 0 },
  {
    id: 'critico',
    rotulo: 'Crítico',
    cabe: (c) => c.criticidade === 'urgente' || c.criticidade === 'atencao',
  },
  { id: 'esgotado', rotulo: 'Esgotado', cabe: (c) => c.criticidade === 'zero' },
  // Demanda acima do estoque: o pedido já foi pago e o volume não cobre.
  { id: 'excedente', rotulo: 'Reserva excedente', cabe: (c) => c.excedenteMl > 0 },
  { id: 'sem_giro', rotulo: 'Sem consumo', cabe: (c) => c.criticidade === 'sem_giro' },
  { id: 'sem_carga', rotulo: 'Fora do controle', cabe: (c) => c.criticidade === 'sem_carga' },
]

type Ordem = 'acaba' | 'nome' | 'volume' | 'consumo' | 'reservado' | 'valor'

/** Sem consumo não tem "acaba antes": vai para o fim, não para o topo. */
const SEM_PRAZO = Number.POSITIVE_INFINITY

const ORDENS: { id: Ordem; rotulo: string; compara: (a: CoberturaBase, b: CoberturaBase) => number }[] =
  [
    {
      id: 'acaba',
      rotulo: 'Acaba antes',
      compara: (a, b) => {
        // Base sem carga não tem "acaba em" — o ERP não sabe o que há nela.
        const peso = (c: CoberturaBase) => (c.criticidade === 'sem_carga' ? 1 : 0)
        return peso(a) - peso(b) || (a.dias ?? SEM_PRAZO) - (b.dias ?? SEM_PRAZO)
      },
    },
    { id: 'nome', rotulo: 'Nome', compara: (a, b) => a.base.nome.localeCompare(b.base.nome, 'pt-BR') },
    { id: 'volume', rotulo: 'Mais volume', compara: (a, b) => b.disponivelMl - a.disponivelMl },
    {
      id: 'consumo',
      rotulo: 'Mais vendido',
      compara: (a, b) => b.base.consumoDiarioMl - a.base.consumoDiarioMl,
    },
    { id: 'reservado', rotulo: 'Mais reservado', compara: (a, b) => b.reservadoMl - a.reservadoMl },
    {
      id: 'valor',
      rotulo: 'Maior valor parado',
      compara: (a, b) => b.fisicoMl * b.base.custoPorMl - a.fisicoMl * a.base.custoPorMl,
    },
  ]

/** Quantas linhas por vez. 412 de uma vez é rolagem sem fim. */
const PAGINA = 50

const TOM_ALERTA: Record<AlertaEstoque['grau'], string> = {
  erro: COR.erro,
  atencao: COR.atencao,
  info: 'rgba(242,237,227,.4)',
}

/**
 * Perfumes base: físico, reservado e disponível, lado a lado.
 *
 * Os três números são diferentes e a tela nunca os mistura. Físico é o que
 * está no frasco; reservado é o que já foi vendido e ainda não saiu;
 * disponível é o que se pode vender hoje. Mostrar só um deles foi o que
 * deixou a loja vender 355 unidades sem lastro.
 *
 * A tela é leitura: quem move estoque é a compra, a produção e o inventário.
 */
export function PerfumesBaseCliente({ coberturas }: { coberturas: CoberturaBase[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('acaba')
  const [mostrar, setMostrar] = useState(PAGINA)

  const termo = busca.trim().toLowerCase()

  const visiveis = useMemo(() => {
    const cabe = FILTROS.find((f) => f.id === filtro)!.cabe
    const compara = ORDENS.find((o) => o.id === ordem)!.compara
    return coberturas
      .filter((c) => cabe(c))
      .filter(
        (c) =>
          !termo ||
          `${c.base.nome} ${c.base.marca} ${c.base.id}`.toLowerCase().includes(termo),
      )
      .slice()
      .sort(compara)
  }, [coberturas, filtro, ordem, termo])

  const contagem = useMemo(
    () =>
      Object.fromEntries(
        FILTROS.map((f) => [f.id, coberturas.filter((c) => f.cabe(c)).length]),
      ) as Record<Filtro, number>,
    [coberturas],
  )

  const trocar = (aplicar: () => void) => {
    aplicar()
    setMostrar(PAGINA)
  }

  const colunas: Coluna<CoberturaBase>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1.4fr)',
      render: (c) => {
        const alertas = alertasDaBase(c)
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <CelulaDupla principal={c.base.nome} secundaria={c.base.marca} />
            {alertas.length > 0 && (
              <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {alertas.slice(0, 2).map((a) => (
                  <span
                    key={a.chave}
                    className="font-sans"
                    style={{
                      fontSize: 9,
                      lineHeight: 1.4,
                      color: TOM_ALERTA[a.grau],
                      border: `1px solid ${TOM_ALERTA[a.grau]}33`,
                      borderRadius: 'var(--radius-pill)',
                      padding: '1px 6px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 240,
                    }}
                    title={a.texto}
                  >
                    {a.texto}
                  </span>
                ))}
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'fisico',
      titulo: 'Físico',
      largura: '92px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.62)">
          {volume(c.fisicoMl)}
        </Valor>
      ),
    },
    {
      chave: 'reservado',
      titulo: 'Reservado',
      largura: '104px',
      alinhamento: 'right',
      render: (c) =>
        c.reservadoMl > 0 ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Valor tamanho={12} peso={400} tom={c.excedenteMl > 0 ? 'erro' : 'atencao'}>
              {volume(c.reservadoMl)}
            </Valor>
            {c.excedenteMl > 0 && (
              <span className="font-sans" style={{ fontSize: 9, color: COR.erro, whiteSpace: 'nowrap' }}>
                {`${volume(c.excedenteMl)} sem lastro`}
              </span>
            )}
          </span>
        ) : (
          <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.28)">
            —
          </Valor>
        ),
    },
    {
      chave: 'disponivel',
      titulo: 'Disponível',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12.5} tom={TOM[c.criticidade]}>
          {volume(c.disponivelMl)}
        </Valor>
      ),
    },
    {
      chave: 'consumo',
      titulo: 'Consumo 30d',
      largura: '104px',
      alinhamento: 'right',
      // Derivado do consumo diário, não um campo à parte.
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.65)">
          {c.base.consumoDiarioMl > 0 ? volume(c.base.consumoDiarioMl * 30) : '—'}
        </Valor>
      ),
    },
    {
      chave: 'acaba',
      titulo: 'Cobertura',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <Valor tamanho={11.5} tom={TOM[c.criticidade]}>
            {c.cobertura}
          </Valor>
          {/* Barra só quando há prazo real: sem consumo não há régua. */}
          {c.dias !== null && (
            <span style={{ width: '100%' }}>
              {/* 60 dias é a régua: o que passa disso enche a barra. */}
              <Barra pct={Math.min(100, (c.dias / 60) * 100)} tom={TOM[c.criticidade]} />
            </span>
          )}
          {c.dias === null && c.criticidade !== 'sem_carga' && (
            <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
              sem histórico de venda
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '104px',
      alinhamento: 'right',
      render: (c) =>
        c.base.custoPorMl > 0 ? (
          <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.62)">
            {brl(c.fisicoMl * c.base.custoPorMl)}
          </Valor>
        ) : (
          <span className="font-sans" style={{ fontSize: 9.5, color: COR.atencao }}>
            sem custo
          </span>
        ),
    },
    {
      chave: 'acao',
      titulo: 'Ação recomendada',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="font-sans"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'block',
              fontSize: 11.5,
              lineHeight: 1.3,
              color: 'var(--color-secundario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={c.acao}
          >
            {c.acao}
          </span>
          <Link
            href={c.disponivelMl === 0 ? '/estoque/lotes' : '/envase'}
            className="font-sans hover:bg-[rgba(239,209,140,.13)]"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 28,
              padding: '0 11px',
              border: '1px solid rgba(239,209,140,.22)',
              background: 'rgba(239,209,140,.05)',
              color: 'var(--color-ouro)',
              fontWeight: 600,
              fontSize: 10.5,
              borderRadius: 7,
              flex: 'none',
            }}
          >
            {c.cta}
          </Link>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={busca}
          onChange={(e) => trocar(() => setBusca(e.target.value))}
          placeholder="Buscar perfume, marca ou identificador…"
          aria-label="Buscar perfume base"
          className="font-sans focus:border-ouro/45"
          style={{
            height: 36,
            flex: 1,
            minWidth: 220,
            padding: '0 12px',
            border: '1px solid rgba(255,255,255,.11)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
            color: 'var(--color-corrente)',
            fontSize: 12.5,
            outline: 0,
          }}
        />

        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTROS.map((f) => {
            const ativo = filtro === f.id
            // Filtro que não pega nada some da barra — menos ruído, e a
            // ausência já diz que o problema não existe hoje.
            if (contagem[f.id] === 0 && f.id !== 'todos' && !ativo) return null
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => trocar(() => setFiltro(f.id))}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 36,
                  padding: '0 12px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 10.5,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${f.rotulo} · ${contagem[f.id]}`}
              </button>
            )
          })}
        </span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Rotulo>Ordem</Rotulo>
          <select
            value={ordem}
            onChange={(e) => trocar(() => setOrdem(e.target.value as Ordem))}
            className="font-sans"
            style={{
              height: 36,
              padding: '0 9px',
              border: '1px solid rgba(255,255,255,.11)',
              background: 'rgba(255,255,255,.03)',
              borderRadius: 8,
              color: 'var(--color-corrente)',
              fontSize: 11.5,
              outline: 0,
            }}
          >
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis.slice(0, mostrar)}
        chaveDe={(c) => c.base.id}
        bandeiraDe={(c) =>
          c.excedenteMl > 0 || c.criticidade === 'zero' || c.criticidade === 'urgente'
            ? 'erro'
            : c.criticidade === 'atencao'
              ? 'atencao'
              : null
        }
        vazio={
          <div style={{ padding: '26px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              {termo
                ? `Nenhum perfume com “${busca.trim()}” neste filtro.`
                : 'Nenhum perfume neste filtro.'}
            </span>
          </div>
        }
      />

      {visiveis.length > mostrar && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setMostrar((m) => m + PAGINA)}
            className="hover:border-ouro/40 font-sans"
            style={{
              height: 34,
              padding: '0 16px',
              border: '1px solid rgba(255,255,255,.1)',
              background: 'transparent',
              color: 'rgba(242,237,227,.66)',
              fontWeight: 600,
              fontSize: 11,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {`Mostrar mais ${Math.min(PAGINA, visiveis.length - mostrar)} · ${plural(visiveis.length - mostrar, 'restante', 'restantes')}`}
          </button>
        </div>
      )}
    </div>
  )
}
