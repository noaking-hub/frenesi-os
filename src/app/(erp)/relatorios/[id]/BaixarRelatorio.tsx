'use client'

import { useState, useTransition } from 'react'

import { BotaoSecundario } from '@/components/erp/primitivos'

import { csvDoRelatorio } from './acoes'

/**
 * Baixa o relatório COMPLETO, não a página exibida.
 *
 * A tela corta em 500 linhas porque rolagem infinita não é resposta; a
 * planilha não corta, porque lá o corte seria mentira — o operador que exporta
 * "clientes parados" para uma campanha precisa dos 812, não dos 500 primeiros.
 * Por isso o CSV é gerado no servidor, com os mesmos filtros, e não a partir
 * do que está na tela.
 */
export function BaixarRelatorio({
  id,
  titulo,
  filtros,
}: {
  id: string
  titulo: string
  filtros: { de: string | null; ate: string | null; uf: string | null; q: string | null }
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, iniciar] = useTransition()

  const baixar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await csvDoRelatorio(id, filtros)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      // BOM na frente: sem ele o Excel abre "Muriaé" como "MuriaÃ©".
      const blob = new Blob(['﻿', r.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.arquivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <BotaoSecundario altura={32} onClick={baixar} desabilitado={gerando}>
        {gerando ? 'Gerando…' : `Baixar ${titulo} (CSV)`}
      </BotaoSecundario>
      {erro ? (
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-erro)' }}>
          {erro}
        </span>
      ) : null}
    </div>
  )
}
