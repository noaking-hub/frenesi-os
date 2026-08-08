'use client'

import { useState } from 'react'

import { CardKpi, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, FaixaAlerta, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import {
  PARAMETROS_PADRAO,
  custosFixos,
  brl,
  num,
  parseNum,
  sobraParaProduto,
  taxasPct,
} from '@/domain'
import type { ParametrosPrecificacao } from '@/domain'

import { CAMPOS_PARAMETROS, SECOES_PARAMETROS, type CampoParametro } from '../campos'

interface Props {
  parametros: ParametrosPrecificacao
  /** Perda real média dos lotes encerrados, para confrontar com o parâmetro. */
  perdaRealMedia: number
}

export function ParametrosCliente({ parametros, perdaRealMedia }: Props) {
  const [valores, setValores] = useState<ParametrosPrecificacao>(parametros)
  // Texto cru durante a digitação; o número só entra no cálculo no blur.
  const [textos, setTextos] = useState<Partial<Record<keyof ParametrosPrecificacao, string>>>({})

  const taxas = taxasPct(valores)
  const fixos = custosFixos(valores)
  const sobra = sobraParaProduto(valores)

  const editar = (chave: keyof ParametrosPrecificacao, texto: string) =>
    setTextos((t) => ({ ...t, [chave]: texto.replace(/[^0-9.,]/g, '') }))

  const confirmar = (chave: keyof ParametrosPrecificacao) => {
    const texto = textos[chave]
    setTextos((t) => {
      const { [chave]: _descartado, ...resto } = t
      return resto
    })
    if (texto === undefined || texto.trim() === '') return
    setValores((v) => ({ ...v, [chave]: parseNum(texto) }))
  }

  const restaurar = () => {
    setValores(PARAMETROS_PADRAO)
    setTextos({})
  }

  const valorExibido = (c: CampoParametro): string => {
    const texto = textos[c.chave]
    if (texto !== undefined) return texto
    const v = valores[c.chave]
    return c.unidade === 'R$' ? v.toFixed(2).replace('.', ',') : num(v)
  }

  // O campo de perda ganha o aviso quando os lotes encerrados medem mais do
  // que o parâmetro declara — o mesmo critério da pendência do Dashboard.
  const perdaSubestimada = perdaRealMedia > valores.perdaPct + 0.2

  const resumo: Kpi[] = [
    {
      label: 'Total de taxas variáveis',
      valor: `${num(Math.round(taxas * 100) / 100)}%`,
      hint: 'Intermediador, checkout, imposto e ADS',
      tom: 'atencao',
    },
    {
      label: 'Custos fixos por pedido',
      valor: brl(fixos),
      hint: 'Somados a cada pedido aprovado',
      tom: 'atencao',
    },
    {
      label: 'Margem líquida alvo',
      valor: `${num(valores.margemAlvo)}%`,
      hint: 'Meta de lucro sobre o preço',
      tom: 'ouro',
    },
    {
      label: 'Sobra para custo do produto',
      valor: `${num(Math.round(sobra * 100) / 100)}% do preço`,
      hint: 'O que resta após taxas e margem alvo',
      tom: sobra > 0 ? 'ok' : 'erro',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1080 }}>
      {sobra <= 0 && (
        <FaixaAlerta
          tom="erro"
          texto="A soma de taxas e margem alvo passa de 100%. Reduza a margem ou as taxas para o cálculo fazer sentido."
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13 }}>
        {resumo.map((k) => (
          <CardKpi key={k.label} kpi={k} />
        ))}
      </div>

      {SECOES_PARAMETROS.map((secao) => (
        <section
          key={secao}
          style={{
            background: 'linear-gradient(170deg,#141315,#101011)',
            border: '1px solid var(--color-borda)',
            borderRadius: 16,
            padding: '19px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 15,
          }}
        >
          <TituloSecao>{secao}</TituloSecao>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '14px 18px' }}>
            {CAMPOS_PARAMETROS.filter((c) => c.secao === secao).map((c) => {
              const avisaPerda = c.chave === 'perdaPct' && perdaSubestimada
              return (
                <label key={c.chave} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}
                    >
                      {c.label}
                    </span>
                    <span
                      className="font-sans"
                      style={{
                        fontSize: 10.5,
                        lineHeight: 1.35,
                        color: avisaPerda ? COR.atencao : 'rgba(242,237,227,.4)',
                        textWrap: 'pretty',
                      }}
                    >
                      {avisaPerda
                        ? `${c.hint} · medida ${num(Math.round(perdaRealMedia * 10) / 10)}% nos lotes encerrados`
                        : c.hint}
                    </span>
                  </span>
                  <span
                    className="focus-within:border-ouro/45"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      width: 124,
                      height: 38,
                      padding: '0 12px',
                      border: '1px solid rgba(255,255,255,.11)',
                      background: 'rgba(255,255,255,.03)',
                      borderRadius: 9,
                      flex: 'none',
                    }}
                  >
                    <input
                      value={valorExibido(c)}
                      onChange={(e) => editar(c.chave, e.target.value)}
                      onBlur={() => confirmar(c.chave)}
                      inputMode="decimal"
                      aria-label={c.label}
                      className="font-mono"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 0,
                        outline: 0,
                        background: 'transparent',
                        color: 'var(--color-corrente)',
                        fontWeight: 500,
                        fontSize: 13,
                        lineHeight: 1,
                        textAlign: 'right',
                      }}
                    />
                    <span
                      className="font-sans"
                      style={{ fontSize: 10.5, lineHeight: 1, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}
                    >
                      {c.unidade}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </section>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="font-sans"
          style={{ flex: 1, fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
        >
          Estes parâmetros alimentam o preço ideal em Produtos → Precificação e o comparativo com
          concorrentes.
        </span>
        <BotaoSecundario altura={36} onClick={restaurar}>
          Restaurar padrões
        </BotaoSecundario>
        <BotaoOuro altura={36}>Salvar parâmetros</BotaoOuro>
      </div>
    </div>
  )
}
