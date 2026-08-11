'use client'

/**
 * Baixa a curva ABC exibida como CSV — ; e vírgula decimal, como o Excel
 * brasileiro espera. Componente de cliente porque o download nasce no
 * navegador; o resto da tela continua renderizada no servidor.
 */
export function ExportarAbc({
  linhas,
  periodo,
}: {
  linhas: {
    classe: string
    descricao: string
    receita: number
    unidades: number
    partPct: number
    acumulado: number
  }[]
  periodo: string
}) {
  const exportar = () => {
    const escapa = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const corpo = [
      ['Classe', 'Perfume', 'Receita', 'Unidades', 'Participação %', 'Acumulado %'],
      ...linhas.map((l) => [
        l.classe,
        l.descricao,
        l.receita.toFixed(2).replace('.', ','),
        l.unidades,
        l.partPct.toFixed(1).replace('.', ','),
        l.acumulado.toFixed(1).replace('.', ','),
      ]),
    ]
    const csv = corpo.map((l) => l.map(escapa).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `curva-abc-${periodo}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={exportar}
      className="hover:border-ouro/40 font-sans"
      style={{
        height: 28,
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,.12)',
        background: 'rgba(255,255,255,.03)',
        color: 'rgba(242,237,227,.7)',
        fontWeight: 600,
        fontSize: 10.5,
        lineHeight: 1,
        borderRadius: 7,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      Exportar CSV
    </button>
  )
}
