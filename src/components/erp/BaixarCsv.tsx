'use client'

import { useState } from 'react'

import { Ico, TINTA } from '@/components/erp/ui'
import { rotuloDaFerramenta } from '@/domain'

/**
 * Baixar como planilha o que o Gerente mostrou — §4.5.
 *
 * O botão só existe para consulta que VIROU tabela: o servidor marcou quantas
 * linhas tinha, e sem essa marca nada é renderizado aqui. É o que impede o
 * clássico botão que aparece sempre, falha às vezes e ensina a pessoa a não
 * confiar nele.
 *
 * O arquivo vem pronto do servidor — nome, separador e BOM decididos lá. O
 * navegador só o salva.
 */
export interface FerramentaExportavel {
  nome: string
  argumentos?: Record<string, unknown>
  linhas?: number
}

export function BaixarCsv({ ferramentas }: { ferramentas: FerramentaExportavel[] }) {
  const exportaveis = ferramentas.filter((f) => typeof f.linhas === 'number' && f.linhas > 0)
  if (exportaveis.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {exportaveis.map((f, i) => (
        <Botao key={i} f={f} />
      ))}
    </div>
  )
}

function Botao({ f }: { f: FerramentaExportavel }) {
  const [estado, setEstado] = useState<'pronto' | 'baixando' | string>('pronto')

  async function baixar() {
    setEstado('baixando')
    try {
      const r = await fetch('/api/assessor/relatorio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ferramenta: f.nome, argumentos: f.argumentos ?? {} }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string }
        setEstado(d.erro ?? 'Não consegui gerar a planilha.')
        return
      }
      const nome =
        /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'relatorio.csv'
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.click()
      URL.revokeObjectURL(url)
      setEstado('pronto')
    } catch (e) {
      setEstado(e instanceof Error ? e.message : 'Não consegui gerar a planilha.')
    }
  }

  const falhou = estado !== 'pronto' && estado !== 'baixando'

  return (
    <button
      type="button"
      onClick={() => void baixar()}
      disabled={estado === 'baixando'}
      // O dado é relido no clique, e dizer isso aqui evita a suspeita legítima
      // de que a planilha traz o número de meia hora atrás.
      title={
        falhou
          ? estado
          : `Baixar ${f.linhas} linha${f.linhas === 1 ? '' : 's'} em CSV — os dados são relidos no momento do download`
      }
      className="font-sans hover:border-ouro/40"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        borderRadius: 7,
        border: `1px solid ${falhou ? 'rgba(231,111,111,.35)' : 'rgba(255,255,255,.1)'}`,
        background: 'rgba(255,255,255,.025)',
        color: falhou ? TINTA.erro : 'rgba(242,237,227,.58)',
        fontSize: 10.5,
        cursor: estado === 'baixando' ? 'wait' : 'pointer',
      }}
    >
      <Ico n="exportar" tamanho={11} />
      {falhou ? estado : `${rotuloDaFerramenta(f.nome)} · ${f.linhas} linhas`}
    </button>
  )
}
