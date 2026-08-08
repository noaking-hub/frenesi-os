'use client'

import Link from 'next/link'
import { useState } from 'react'

import { FaixaAlerta, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  VARIANTES,
  brl,
  calcularPreco,
  composicaoPreco,
  descreveVariante,
  frascoDe,
  parseNum,
  pct,
  pisoMargem,
} from '@/domain'
import type { ParametrosPrecificacao, PerfumeBase, VarianteMl } from '@/domain'

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
}

export function PrecificacaoCliente({ bases, parametros, precos }: Props) {
  const [baseId, setBaseId] = useState(bases[0]?.id ?? '')
  const [varianteSel, setVarianteSel] = useState<VarianteMl>(5)
  const [custoTexto, setCustoTexto] = useState<string | null>(null)
  const [margemTexto, setMargemTexto] = useState<string | null>(null)

  const base = bases.find((b) => b.id === baseId) ?? bases[0]

  // Os campos editáveis recalculam tudo na hora: preço, margem e composição
  // saem do mesmo `calcularPreco` que a tela de Configurações usa.
  const custoPorMl = custoTexto === null ? base.custoPorMl : parseNum(custoTexto)
  const margemAlvo = margemTexto === null ? parametros.margemAlvo : parseNum(margemTexto)
  const params: ParametrosPrecificacao = { ...parametros, margemAlvo }

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
      largura: '96px',
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
      largura: '104px',
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
      largura: '82px',
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
      largura: '92px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={12} peso={400} tom={tomMargem(l.margem)}>
          {brl(l.lucro)}
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
        {custoPorMl === 0 && (
          <FaixaAlerta
            tom="erro"
            texto={`${base.nome} está sem custo por ml cadastrado — os preços abaixo cobrem só taxas e custos fixos, não o perfume. Informe o custo real para o cálculo valer.`}
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
            gap: 16,
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

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {bases.map((b) => {
              const ativo = b.id === base.id
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBaseId(b.id)
                    setCustoTexto(null)
                  }}
                  className="hover:border-ouro/40"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '10px 13px',
                    border: `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'var(--color-borda)'}`,
                    background: ativo ? 'rgba(239,209,140,.09)' : 'rgba(255,255,255,.022)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 11.5,
                      lineHeight: 1.25,
                      color: ativo ? 'var(--color-ouro)' : 'var(--color-corrente)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.nome}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: 'var(--color-terciario)', whiteSpace: 'nowrap' }}
                  >
                    {`${brl(b.custoPorMl)}/ml`}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
                  border: '1px solid rgba(239,209,140,.4)',
                  background: 'rgba(255,255,255,.03)',
                  borderRadius: 9,
                }}
              >
                <span className="font-mono" style={{ fontSize: 12, color: 'rgba(242,237,227,.45)' }}>
                  R$
                </span>
                <input
                  value={custoTexto ?? base.custoPorMl.toFixed(2).replace('.', ',')}
                  onChange={(e) => setCustoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onBlur={() => setCustoTexto((t) => (t === '' ? null : t))}
                  className="font-mono"
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
      </div>

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

        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)' }}
        >
          {descreveVariante(varianteSel)} · o nível do líquido é o que o cliente vê na foto.
        </span>
      </section>
    </div>
  )
}
