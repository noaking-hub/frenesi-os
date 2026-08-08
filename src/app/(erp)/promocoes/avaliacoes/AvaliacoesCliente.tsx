'use client'

import { useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, BotaoSecundario, FaixaAlerta, Ponto, Switch } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { AvaliacaoCupom } from '@/data/fixtures'

const TOM_YAMPI: Record<AvaliacaoCupom['yampi'], Tom> = {
  Criado: 'ok',
  Pendente: 'atencao',
  Erro: 'erro',
}

export function AvaliacoesCliente({ avaliacoes }: { avaliacoes: AvaliacaoCupom[] }) {
  const [automatico, setAutomatico] = useState(true)

  const importadosHoje = avaliacoes.filter((a) => a.emitido.startsWith('hoje'))
  const criados = avaliacoes.filter((a) => a.yampi === 'Criado')
  const pendentes = avaliacoes.filter((a) => a.yampi === 'Pendente')
  const erros = avaliacoes.filter((a) => a.yampi === 'Erro')
  const usados = avaliacoes.filter((a) => a.usado)

  const kpis: Kpi[] = [
    {
      label: 'Importados hoje',
      valor: String(importadosHoje.length),
      hint: 'Gerados pelo Judge.me na Shopify',
    },
    {
      label: 'Criados na Yampi',
      valor: String(criados.length),
      hint: 'Prontos para uso no checkout',
      tom: 'ok',
    },
    {
      label: 'Na fila',
      valor: String(pendentes.length),
      hint: 'Aguardando criação automática',
      tom: pendentes.length ? 'atencao' : 'ok',
    },
    {
      label: 'Com erro',
      valor: String(erros.length),
      hint: erros.length ? 'Cliente recebeu cupom que não funciona' : 'Nenhuma falha de criação',
      tom: erros.length ? 'erro' : 'ok',
    },
    {
      label: 'Resgatados',
      valor: String(usados.length),
      hint: `Taxa de uso de ${Math.round((usados.length / avaliacoes.length) * 100)}%`,
      tom: 'ouro',
    },
  ]

  const colunas: Coluna<AvaliacaoCupom>[] = [
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '146px',
      render: (a) => (
        <span className="font-mono" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: 'var(--color-ouro)' }}>
          {a.codigo}
        </span>
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente e avaliação',
      largura: 'minmax(0,1fr)',
      render: (a) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1.25,
                color: 'var(--color-corrente)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.cliente}
            </span>
            <span
              aria-label={`${a.estrelas} de 5 estrelas`}
              className="font-mono"
              style={{ fontSize: 11, lineHeight: 1, color: 'var(--color-ouro)', letterSpacing: '.08em', flex: 'none' }}
            >
              {'★'.repeat(a.estrelas) + '☆'.repeat(5 - a.estrelas)}
            </span>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9,
                lineHeight: 1,
                letterSpacing: '.07em',
                textTransform: 'uppercase',
                color: a.midia === 'Vídeo' ? COR.ouro : COR.info,
                border: `1px solid ${a.midia === 'Vídeo' ? COR.ouro : COR.info}`,
                borderRadius: 'var(--radius-pill)',
                padding: '3px 7px',
                flex: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {a.midia}
            </span>
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.42)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {a.produto}
          </span>
        </span>
      ),
    },
    {
      chave: 'recompensa',
      titulo: 'Recompensa',
      largura: '132px',
      render: (a) => (
        <span className="font-sans" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.3, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
          {`${a.valorPct}% de desconto`}
        </span>
      ),
    },
    {
      chave: 'shopify',
      titulo: 'Shopify',
      largura: '110px',
      render: () => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ponto tom="ok" />
          <span className="font-sans" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: COR.ok, whiteSpace: 'nowrap' }}>
            Importado
          </span>
        </span>
      ),
    },
    {
      chave: 'yampi',
      titulo: 'Yampi',
      largura: '104px',
      render: (a) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Ponto tom={TOM_YAMPI[a.yampi]} />
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.3, color: COR[TOM_YAMPI[a.yampi]], whiteSpace: 'nowrap' }}
          >
            {a.yampi}
          </span>
        </span>
      ),
    },
    {
      chave: 'emitido',
      titulo: 'Emitido',
      largura: '120px',
      render: (a) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.55)', whiteSpace: 'nowrap' }}>
            {a.emitido}
          </span>
          <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}>
            {`vale ${a.validade}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'uso',
      titulo: 'Uso',
      largura: '104px',
      render: (a) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11,
            lineHeight: 1.3,
            color: a.usado ? COR.ouro : 'rgba(242,237,227,.45)',
            whiteSpace: 'nowrap',
          }}
        >
          {a.usado ? 'Resgatado' : 'Disponível'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'linear-gradient(150deg,#16151A,#101011)',
          border: '1px solid rgba(239,209,140,.16)',
          borderRadius: 'var(--radius-card)',
          padding: '17px 19px',
        }}
      >
        <span
          aria-hidden
          className="font-display"
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: 'rgba(239,209,140,.08)',
            border: '1px solid rgba(239,209,140,.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 12,
            lineHeight: 1,
            color: 'var(--color-ouro)',
            flex: 'none',
          }}
        >
          JM
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.25, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
              Judge.me · Shopify
            </span>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 9,
                lineHeight: 1,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: automatico ? COR.ok : COR.atencao,
                border: `1px solid ${automatico ? COR.ok : COR.atencao}`,
                borderRadius: 'var(--radius-pill)',
                padding: '3px 7px',
                whiteSpace: 'nowrap',
              }}
            >
              {automatico ? 'Criação automática na Yampi' : 'Criação manual'}
            </span>
          </span>
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
            {automatico
              ? 'Todo cupom importado do Judge.me é recriado na Yampi com a mesma regra, valor e validade'
              : 'Os cupons importados ficam parados na fila até você criar manualmente na Yampi'}
          </span>
          <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(239,209,140,.55)' }}>
            {`Última importação hoje 07:40 · ${importadosHoje.length} cupons novos`}
          </span>
        </div>
        <BotaoSecundario altura={34}>Importar arquivo CSV</BotaoSecundario>
        <BotaoOuro altura={34}>Buscar novos cupons</BotaoOuro>
        <Switch
          ligado={automatico}
          onChange={setAutomatico}
          label={automatico ? 'Desativar criação automática na Yampi' : 'Ativar criação automática na Yampi'}
        />
      </section>

      <FaixaKpis kpis={kpis} />

      {erros.length > 0 && (
        <FaixaAlerta
          tom="erro"
          texto={
            erros.length === 1
              ? `${erros[0].codigo} foi enviado por e-mail para ${erros[0].cliente} mas não existe na Yampi. O cliente vai tentar usar e o checkout vai recusar.`
              : `${erros.length} cupons foram enviados aos clientes e não existem na Yampi. O checkout vai recusar todos.`
          }
          acao={<BotaoSecundario altura={32}>Tentar criar na Yampi</BotaoSecundario>}
        />
      )}

      <Tabela
        colunas={colunas}
        itens={avaliacoes}
        chaveDe={(a) => a.codigo}
        bandeiraDe={(a) => (a.yampi === 'Erro' ? 'erro' : a.yampi === 'Pendente' ? 'atencao' : null)}
        rodape={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span
              aria-hidden
              style={{ width: 6, height: 6, borderRadius: '50%', background: COR.ok, flex: 'none', animation: 'fr-pulse 2.4s ease-in-out infinite' }}
            />
            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.4, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}>
              O Judge.me gera o cupom na Shopify e envia por e-mail ao cliente. O ERP importa o
              código e recria na Yampi com a mesma regra, para o checkout aceitar.
            </span>
          </div>
        }
      />
    </div>
  )
}
