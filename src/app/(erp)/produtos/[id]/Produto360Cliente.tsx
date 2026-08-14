'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useMemo, useState, type ReactNode } from 'react'

import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_ESTOQUE,
  ROTULO_INTEGRACAO,
  brl,
  pct,
  plural,
  volume,
} from '@/domain'
import type { Produto360Dados } from '@/data/consultas'
import type { ProdutoAvaliado } from '@/domain'

import { Aba, Faixa, Pilula } from '../../pedidos/PedidosCliente'
import { EditorPerfume } from '../EditorPerfume'

/**
 * Produto 360º — o dossiê do perfume em abas, como no mockup: quem abre
 * precisa entender cadastro, variantes, saldo, custo, preço, margem, giro,
 * integrações e histórico em segundos. Nada aqui MOVIMENTA estoque: os
 * atalhos levam para Estoque, Precificação e Shopify, cada um no seu lugar.
 */

type NomeAba =
  | 'Resumo'
  | 'Variantes'
  | 'Estoque'
  | 'Custos e preços'
  | 'Vendas'
  | 'Integrações'
  | 'Histórico'

const TOM_ESTOQUE: Record<ProdutoAvaliado['estadoEstoque'], Tom> = {
  disponivel: 'ok',
  baixo: 'atencao',
  'sem-estoque': 'erro',
  'sem-giro': 'info',
  'sem-carga': 'neutro',
}

/** Data curta de um ISO — '13/08 23:04'. Sem data, um traço honesto. */
function quando(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function Produto360Cliente({
  avaliacao,
  dados,
}: {
  avaliacao: ProdutoAvaliado
  dados: Produto360Dados
}) {
  const router = useRouter()
  const [aba, setAba] = useState<NomeAba>('Resumo')
  const [editando, setEditando] = useState(false)
  const [recado, setRecado] = useState<{ tom: Tom; texto: string } | null>(null)

  const { base } = avaliacao
  const v30 = dados.vendas.d30

  // Classificação de giro do escopo: quem decide é a cobertura calculada
  // sobre o consumo REAL das vendas — não um número digitado.
  const classificacaoGiro =
    base.consumoDiarioMl === 0
      ? { rotulo: 'Sem giro', tom: 'info' as Tom }
      : avaliacao.coberturaDias < 7
        ? { rotulo: 'Reposição urgente', tom: 'erro' as Tom }
        : avaliacao.coberturaDias < 20
          ? { rotulo: 'Repor em breve', tom: 'atencao' as Tom }
          : { rotulo: 'Normal', tom: 'ok' as Tom }

  const maisVendida = useMemo(() => {
    const pares = Object.entries(dados.porVariante) as unknown as [string, number][]
    if (!pares.length) return null
    pares.sort((a, b) => b[1] - a[1])
    return { variante: pares[0][0], unidades: pares[0][1] }
  }, [dados.porVariante])

  const ultimoLoteComCusto = dados.lotes.find((l) => l.custoPorMl !== null)
  const pendencias = avaliacao.alertas
  const linkLoja = base.shopifyHandle
    ? `https://frenesiperfumes.com.br/products/${base.shopifyHandle}`
    : null

  const abas: { nome: NomeAba; contagem: number }[] = [
    { nome: 'Resumo', contagem: pendencias.length },
    { nome: 'Variantes', contagem: avaliacao.variantes.filter((v) => v.preco > 0).length },
    { nome: 'Estoque', contagem: dados.lotes.filter((l) => !l.encerradoEm).length },
    { nome: 'Custos e preços', contagem: dados.lotes.filter((l) => l.custoPorMl !== null).length },
    { nome: 'Vendas', contagem: v30.pedidos },
    { nome: 'Integrações', contagem: avaliacao.integracao === 'sincronizado' ? 0 : 1 },
    { nome: 'Histórico', contagem: dados.movimentacoes.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'flex-start',
          padding: '18px 20px',
          border: '1px solid var(--color-borda)',
          borderRadius: 14,
          background: 'var(--color-mesa)',
          flexWrap: 'wrap',
        }}
      >
        {base.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={base.imagemUrl}
            alt=""
            style={{
              width: 84,
              height: 108,
              borderRadius: 9,
              objectFit: 'cover',
              border: '1px solid var(--color-borda)',
              background: '#131214',
              flex: 'none',
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 84,
              height: 108,
              borderRadius: 9,
              border: '1px solid var(--color-borda)',
              background:
                'repeating-linear-gradient(135deg,rgba(239,209,140,.14) 0 4px,rgba(239,209,140,.05) 4px 8px)',
              flex: 'none',
            }}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 320px', minWidth: 0 }}>
          <Link
            href="/produtos"
            className="font-sans hover:text-ouro"
            style={{ fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--color-terciario)', textDecoration: 'none', width: 'fit-content' }}
          >
            ← Catálogo
          </Link>
          <TituloSecao tamanho={20}>{base.nome}</TituloSecao>
          <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-secundario)' }}>
            {base.marca}
            {base.genero ? ` · ${base.genero}` : ''}
          </span>
          <span style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <Pilula tom={base.ativo === false ? 'neutro' : 'ok'}>
              {base.ativo === false ? 'Inativo' : 'Ativo'}
            </Pilula>
            <Pilula tom={TOM_ESTOQUE[avaliacao.estadoEstoque]}>
              {ROTULO_ESTOQUE[avaliacao.estadoEstoque]}
            </Pilula>
            <Pilula tom={avaliacao.integracao === 'sincronizado' ? 'ok' : 'atencao'}>
              {`Shopify · ${ROTULO_INTEGRACAO[avaliacao.integracao]}`}
            </Pilula>
            <Pilula tom={classificacaoGiro.tom}>{classificacaoGiro.rotulo}</Pilula>
          </span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <BotaoOuro altura={33} onClick={() => setEditando(true)}>
              Editar cadastro
            </BotaoOuro>
            <BotaoSecundario
              altura={33}
              onClick={() => router.push(`/produtos/precificacao?base=${encodeURIComponent(base.id)}`)}
            >
              Abrir Precificação
            </BotaoSecundario>
            {linkLoja && (
              <BotaoSecundario altura={33} onClick={() => window.open(linkLoja, '_blank', 'noopener')}>
                Ver na Shopify ↗
              </BotaoSecundario>
            )}
          </span>
        </div>

        {/* Identificadores, como no mockup: os IDs que amarram as pontas. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '13px 15px',
            border: '1px solid var(--color-borda-sutil)',
            borderRadius: 11,
            background: 'rgba(255,255,255,.02)',
            minWidth: 250,
          }}
        >
          <Rotulo>Identificadores</Rotulo>
          <Par rotulo="ID interno" valor={base.id} mono />
          <Par rotulo="ID Shopify" valor={base.shopifyProductId ?? 'sem vínculo'} mono tom={base.shopifyProductId ? undefined : 'atencao'} />
          <Par rotulo="Handle" valor={base.shopifyHandle ?? '—'} mono />
        </div>
      </div>

      {/* ── Indicadores-chave ─────────────────────────────────────────── */}
      <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>
        <Quadro rotulo="Estoque disponível" valor={volume(avaliacao.disponivelMl)} tomValor={avaliacao.disponivelMl === 0 ? COR.erro : COR.ok}>
          {`físico ${volume(avaliacao.fisicoMl)} · reservado ${volume(avaliacao.reservadoMl)}`}
        </Quadro>
        <Quadro rotulo="Cobertura estimada" valor={base.consumoDiarioMl > 0 ? `${avaliacao.coberturaDias} dias` : '—'}>
          {base.consumoDiarioMl > 0
            ? `média de ${base.consumoDiarioMl.toFixed(1).replace('.', ',')} ml/dia sobre o disponível`
            : 'sem consumo medido nas vendas'}
        </Quadro>
        <Quadro rotulo="Custo por ml" valor={base.custoPorMl > 0 ? brl(base.custoPorMl) : '—'} tomValor={base.custoPorMl === 0 ? COR.erro : undefined}>
          {ultimoLoteComCusto
            ? `último lote ${brl(ultimoLoteComCusto.custoPorMl ?? 0)}/ml em ${dataCurta(ultimoLoteComCusto.entrada)}`
            : 'nenhum lote com custo lançado'}
        </Quadro>
        <Quadro
          rotulo="Faixa de preço"
          valor={
            avaliacao.faixaPreco
              ? avaliacao.faixaPreco.min === avaliacao.faixaPreco.max
                ? brl(avaliacao.faixaPreco.min)
                : `${brl(avaliacao.faixaPreco.min)} – ${brl(avaliacao.faixaPreco.max)}`
              : '—'
          }
        >
          {`${plural(avaliacao.variantes.filter((v) => v.preco > 0).length, 'variante ativa', 'variantes ativas')}`}
        </Quadro>
        <Quadro
          rotulo="Margem"
          valor={
            avaliacao.faixaMargem
              ? avaliacao.faixaMargem.min === avaliacao.faixaMargem.max
                ? pct(avaliacao.faixaMargem.min, 1)
                : `${pct(avaliacao.faixaMargem.min, 0)}–${pct(avaliacao.faixaMargem.max, 0)}`
              : '—'
          }
          tomValor={avaliacao.faixaMargem && avaliacao.faixaMargem.min < 15 ? COR.atencao : COR.ok}
        >
          por variante, sobre o preço praticado
        </Quadro>
      </div>

      {recado && <Faixa tom={recado.tom} texto={recado.texto} aoFechar={() => setRecado(null)} />}

      {/* ── Abas ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {abas.map((a) => (
          <Aba key={a.nome} ativo={aba === a.nome} contagem={a.contagem} aoClicar={() => setAba(a.nome)}>
            {a.nome}
          </Aba>
        ))}
      </div>

      {aba === 'Resumo' && (
        <Grade2>
          <Cartao titulo="Vendas · últimos 30 dias">
            <LinhaPar rotulo="Volume vendido" valor={volume(v30.ml)} />
            <LinhaPar rotulo="Unidades" valor={`${v30.unidades} un`} />
            <LinhaPar rotulo="Faturamento" valor={brl(v30.faturamento)} ouro />
            <LinhaPar rotulo="Pedidos" valor={String(v30.pedidos)} />
            <LinhaPar rotulo="Ticket médio" valor={v30.pedidos ? brl(v30.faturamento / v30.pedidos) : '—'} />
            <LinhaPar rotulo="Volumetria mais vendida" valor={maisVendida ? `${maisVendida.variante} ml` : '—'} />
          </Cartao>
          <Cartao titulo="Alertas do produto">
            {pendencias.length === 0 ? (
              <Nota>Nenhuma pendência: custo, estoque, margem e integração em ordem.</Nota>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {pendencias.map((a) => (
                  <span key={a.texto} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: a.grau === 'erro' ? COR.erro : COR.atencao, flex: 'none', transform: 'translateY(-1px)' }} />
                    <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-corrente)', textWrap: 'pretty' }}>
                      {a.texto}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Cartao>
          <Cartao titulo="Capacidade teórica do saldo disponível">
            <Nota>
              Cenários sobre os MESMOS {volume(avaliacao.disponivelMl)} — escolher um exclui os
              outros; nunca se somam.
            </Nota>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {avaliacao.variantes.map((v) => (
                <span
                  key={v.variante}
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    padding: '7px 11px',
                    borderRadius: 8,
                    border: '1px solid var(--color-borda)',
                    background: 'rgba(255,255,255,.02)',
                    color: 'var(--color-corrente)',
                  }}
                >
                  {`${v.capacidade} un de ${v.variante} ml`}
                </span>
              ))}
            </div>
          </Cartao>
          <Cartao titulo="Integração">
            <LinhaPar rotulo="Shopify" valor={ROTULO_INTEGRACAO[avaliacao.integracao]} tom={avaliacao.integracao === 'sincronizado' ? 'ok' : 'atencao'} />
            <LinhaPar
              rotulo="Publicado na loja"
              valor={
                dados.publicado.length
                  ? `${dados.publicado.reduce((a, p) => a + p.unidades, 0)} un · lido ${quando(dados.publicado[0]?.lidoEm)}`
                  : 'sem leitura'
              }
            />
            <Nota>
              O estoque publicado é escrito pela Sincronia (Estoque → Sincronia); a leitura acima é
              o espelho mais recente.
            </Nota>
          </Cartao>
        </Grade2>
      )}

      {aba === 'Variantes' && (
        <TabelaSimples
          grade="70px 90px minmax(120px,1fr) 120px 96px 96px 96px 110px 120px"
          colunas={['Variante', 'Frasco', 'SKU', 'ID Shopify', 'Preço', 'Margem', 'Piso', 'Dá para', 'Publicado (lido)']}
          linhas={avaliacao.variantes.map((v) => {
            const pub = dados.publicado.find((p) => p.variante === v.variante)
            return [
              <span key="v" className="font-mono" style={{ color: v.preco > 0 ? COR.ouro : 'rgba(242,237,227,.35)' }}>{`${v.variante} ml`}</span>,
              `${v.frasco} ml`,
              v.sku ?? '— sem SKU',
              v.shopifyVariantId ? `…${v.shopifyVariantId.slice(-10)}` : '— sem vínculo',
              v.preco > 0 ? brl(v.preco) : '—',
              <span key="m" style={{ color: v.margem === null ? 'rgba(242,237,227,.35)' : v.margem < 15 ? COR.atencao : COR.ok }}>
                {v.margem === null ? '—' : pct(v.margem, 1)}
              </span>,
              v.piso > 0 ? brl(v.piso) : '—',
              `${v.capacidade} un`,
              pub ? `${pub.unidades} un · ${quando(pub.lidoEm)}` : '—',
            ]
          })}
        />
      )}

      {aba === 'Estoque' && (
        <Grade2>
          <Cartao titulo="Saldo em ml — leitura do módulo de Estoque">
            <LinhaPar rotulo="Físico" valor={volume(avaliacao.fisicoMl)} />
            <LinhaPar rotulo="Reservado em pedidos" valor={volume(avaliacao.reservadoMl)} />
            <LinhaPar rotulo="Disponível" valor={volume(avaliacao.disponivelMl)} ouro />
            <LinhaPar rotulo="Cobertura" valor={base.consumoDiarioMl > 0 ? `${avaliacao.coberturaDias} dias` : 'sem giro medido'} />
            <Nota>
              Compra, ajuste, perda e inventário não se lançam aqui — este painel só lê. Os
              lançamentos moram em <Link href="/estoque/lotes" className="hover:text-ouro" style={{ color: COR.ouro }}>Estoque → Lotes</Link> e{' '}
              <Link href="/estoque/movimentacoes" className="hover:text-ouro" style={{ color: COR.ouro }}>Movimentações</Link>.
            </Nota>
          </Cartao>
          <Cartao titulo={`Lotes (${dados.lotes.length})`}>
            {dados.lotes.length === 0 ? (
              <Nota>Nenhum lote lançado — o volume e o custo nascem na primeira compra do frasco.</Nota>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dados.lotes.slice(0, 8).map((l) => (
                  <span key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)', flex: 'none' }}>{dataCurta(l.entrada)}</span>
                    <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-corrente)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.fornecedor}
                    </span>
                    <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-secundario)', flex: 'none' }}>{volume(l.volumeMl)}</span>
                    <span className="font-mono" style={{ fontSize: 11, color: l.custoPorMl ? COR.ouro : 'rgba(242,237,227,.35)', flex: 'none' }}>
                      {l.custoPorMl ? `${brl(l.custoPorMl)}/ml` : 'sem custo'}
                    </span>
                    {l.encerradoEm && <Pilula tom="neutro">encerrado</Pilula>}
                  </span>
                ))}
              </div>
            )}
          </Cartao>
        </Grade2>
      )}

      {aba === 'Custos e preços' && (
        <Grade2>
          <Cartao titulo="Custo vigente">
            <LinhaPar rotulo="Custo por ml (usado na Precificação)" valor={base.custoPorMl > 0 ? brl(base.custoPorMl) : 'sem custo'} ouro tom={base.custoPorMl === 0 ? 'erro' : undefined} />
            <LinhaPar rotulo="Último custo de compra" valor={ultimoLoteComCusto?.custoPorMl ? `${brl(ultimoLoteComCusto.custoPorMl)}/ml` : '—'} />
            <Nota>
              O custo vigente vem das compras (média dos lotes) e pode ser corrigido no cadastro.
              A origem fica rastreável no histórico de lotes ao lado.
            </Nota>
            <div style={{ marginTop: 6 }}>
              <BotaoSecundario altura={32} onClick={() => router.push(`/produtos/precificacao?base=${encodeURIComponent(base.id)}`)}>
                Abrir Precificação →
              </BotaoSecundario>
            </div>
          </Cartao>
          <Cartao titulo="Histórico de custo por lote">
            {dados.lotes.filter((l) => l.custoPorMl !== null).length === 0 ? (
              <Nota>Nenhuma compra com custo lançado ainda.</Nota>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dados.lotes
                  .filter((l) => l.custoPorMl !== null)
                  .map((l) => (
                    <span key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)', flex: 'none' }}>{dataCurta(l.entrada)}</span>
                      <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-corrente)', flex: 1 }}>{l.fornecedor}</span>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>{`${volume(l.volumeMl)} · ${brl(l.custoTotal ?? 0)}`}</span>
                      <span className="font-mono" style={{ fontSize: 11.5, color: COR.ouro }}>{`${brl(l.custoPorMl ?? 0)}/ml`}</span>
                    </span>
                  ))}
              </div>
            )}
          </Cartao>
          <Cartao titulo="Preços praticados por variante">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {avaliacao.variantes.map((v) => (
                <span key={v.variante} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className="font-mono" style={{ fontSize: 11, color: v.preco > 0 ? COR.ouro : 'rgba(242,237,227,.35)', width: 44, flex: 'none' }}>{`${v.variante} ml`}</span>
                  <span className="font-mono" style={{ fontSize: 11.5, color: 'var(--color-corrente)', width: 84, flex: 'none' }}>{v.preco > 0 ? brl(v.preco) : '—'}</span>
                  <span className="font-sans" style={{ fontSize: 10.5, color: v.margem === null ? 'rgba(242,237,227,.35)' : v.margem < 15 ? COR.atencao : COR.ok }}>
                    {v.margem === null ? 'sem margem calculável' : `margem ${pct(v.margem, 1)}`}
                  </span>
                  {v.abaixoDoPiso && <Pilula tom="erro">abaixo do piso</Pilula>}
                </span>
              ))}
            </div>
            <Nota>Preço se altera na Precificação — aqui é leitura do praticado.</Nota>
          </Cartao>
        </Grade2>
      )}

      {aba === 'Vendas' && (
        <>
          <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
            {([['7 dias', dados.vendas.d7], ['30 dias', dados.vendas.d30], ['90 dias', dados.vendas.d90]] as const).map(([nome, j]) => (
              <Cartao key={nome} titulo={`Últimos ${nome}`}>
                <LinhaPar rotulo="Volume vendido" valor={volume(j.ml)} />
                <LinhaPar rotulo="Unidades" valor={`${j.unidades} un`} />
                <LinhaPar rotulo="Faturamento" valor={brl(j.faturamento)} ouro />
                <LinhaPar rotulo="Pedidos" valor={String(j.pedidos)} />
                <LinhaPar rotulo="Ticket médio" valor={j.pedidos ? brl(j.faturamento / j.pedidos) : '—'} />
              </Cartao>
            ))}
          </div>
          <Grade2>
            <Cartao titulo="Giro e cobertura">
              <LinhaPar rotulo="Velocidade de consumo" valor={base.consumoDiarioMl > 0 ? `${base.consumoDiarioMl.toFixed(1).replace('.', ',')} ml/dia` : 'sem giro medido'} />
              <LinhaPar rotulo="Cobertura do disponível" valor={base.consumoDiarioMl > 0 ? `${avaliacao.coberturaDias} dias` : '—'} />
              <LinhaPar rotulo="Classificação" valor={classificacaoGiro.rotulo} tom={classificacaoGiro.tom} />
              <Nota>O consumo diário é recalculado a cada importação de pedidos, sobre 30 dias de vendas pagas.</Nota>
            </Cartao>
            <Cartao titulo="Unidades por volumetria · 90 dias">
              {maisVendida === null ? (
                <Nota>Nenhuma venda paga no período.</Nota>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {avaliacao.variantes.map((v) => {
                    const un = dados.porVariante[v.variante] ?? 0
                    const max = Math.max(...Object.values(dados.porVariante).map(Number), 1)
                    return (
                      <span key={v.variante} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span className="font-mono" style={{ fontSize: 11, width: 44, flex: 'none', color: 'var(--color-secundario)' }}>{`${v.variante} ml`}</span>
                        <span aria-hidden style={{ height: 7, width: `${Math.max(2, (un / max) * 100)}%`, maxWidth: '70%', borderRadius: 99, background: un === Number(maisVendida.unidades) && un > 0 ? COR.ouro : 'rgba(239,209,140,.28)' }} />
                        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>{`${un} un`}</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </Cartao>
          </Grade2>
        </>
      )}

      {aba === 'Integrações' && (
        <Grade2>
          <Cartao titulo="Shopify">
            <LinhaPar rotulo="Estado" valor={ROTULO_INTEGRACAO[avaliacao.integracao]} tom={avaliacao.integracao === 'sincronizado' ? 'ok' : 'atencao'} />
            <LinhaPar rotulo="ID do produto" valor={base.shopifyProductId ?? 'sem vínculo'} mono />
            <LinhaPar rotulo="Handle" valor={base.shopifyHandle ?? '—'} mono />
            <LinhaPar rotulo="Leitura mais recente da loja" valor={dados.publicado.length ? quando(dados.publicado[0]?.lidoEm) : 'sem leitura'} />
            {linkLoja && (
              <div style={{ marginTop: 4 }}>
                <BotaoSecundario altura={32} onClick={() => window.open(linkLoja, '_blank', 'noopener')}>
                  Abrir na loja ↗
                </BotaoSecundario>
              </div>
            )}
            <Nota>
              O vínculo nasce na importação do catálogo (Estoque → Sincronia). A Yampi espelha o
              catálogo da Shopify — o ERP não publica nas duas para não criar duas verdades.
            </Nota>
          </Cartao>
          <Cartao titulo="Vínculo por variante">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {avaliacao.variantes.map((v) => (
                <span key={v.variante} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className="font-mono" style={{ fontSize: 11, width: 44, flex: 'none', color: v.preco > 0 ? COR.ouro : 'rgba(242,237,227,.35)' }}>{`${v.variante} ml`}</span>
                  <span className="font-mono" style={{ fontSize: 10.5, flex: 1, color: v.shopifyVariantId ? 'var(--color-secundario)' : COR.atencao }}>
                    {v.shopifyVariantId ? `…${v.shopifyVariantId.slice(-14)}` : v.preco > 0 ? 'sem ID — não sincroniza' : 'variante sem venda'}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10.5, color: v.sku ? 'var(--color-terciario)' : COR.atencao }}>
                    {v.sku ?? 'sem SKU'}
                  </span>
                </span>
              ))}
            </div>
          </Cartao>
        </Grade2>
      )}

      {aba === 'Histórico' && (
        <Cartao titulo={`Livro de movimentações — ${plural(dados.movimentacoes.length, 'lançamento recente', 'lançamentos recentes')}`}>
          {dados.movimentacoes.length === 0 ? (
            <Nota>Nenhuma movimentação registrada — a base ainda não entrou no controle de estoque.</Nota>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dados.movimentacoes.map((m, i) => (
                <span key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--color-borda-sutil)' }}>
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)', width: 84, flex: 'none' }}>{quando(m.ocorridaEm)}</span>
                  <span className="font-sans" style={{ fontSize: 11, fontWeight: 600, width: 92, flex: 'none', textTransform: 'capitalize', color: 'var(--color-corrente)' }}>
                    {m.tipo.replaceAll('_', ' ')}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11.5, width: 90, flex: 'none', color: m.volumeMl >= 0 ? COR.ok : COR.erro }}>
                    {`${m.volumeMl >= 0 ? '+' : ''}${m.volumeMl.toFixed(1).replace('.', ',')} ml`}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[m.descricao, m.ref, m.responsavel].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-secundario)', flex: 'none' }}>
                    {m.saldoMl === null ? '' : `saldo ${volume(m.saldoMl)}`}
                  </span>
                </span>
              ))}
            </div>
          )}
        </Cartao>
      )}

      {editando && <EditorPerfume base={base} aoFechar={() => setEditando(false)} />}
    </div>
  )
}

/* ── Peças locais da tela ─────────────────────────────────────────────── */

function Quadro({
  rotulo,
  valor,
  tomValor,
  children,
}: {
  rotulo: string
  valor: string
  tomValor?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '12px 13px',
        border: '1px solid var(--color-borda)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-mesa)',
        minWidth: 0,
      }}
    >
      <Rotulo>{rotulo}</Rotulo>
      <span className="font-mono" style={{ fontSize: 19, lineHeight: 1, color: tomValor ?? 'var(--color-tinta)' }}>
        {valor}
      </span>
      <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
        {children}
      </span>
    </div>
  )
}

function Grade2({ children }: { children: ReactNode }) {
  return (
    <div className="empilha-900" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
      {children}
    </div>
  )
}

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 17px',
        border: '1px solid var(--color-borda)',
        borderRadius: 14,
        background: 'var(--color-mesa)',
        minWidth: 0,
      }}
    >
      <TituloSecao tamanho={13}>{titulo}</TituloSecao>
      {children}
    </section>
  )
}

function LinhaPar({
  rotulo,
  valor,
  ouro,
  mono,
  tom,
}: {
  rotulo: string
  valor: string
  ouro?: boolean
  mono?: boolean
  tom?: Tom | 'erro'
}) {
  return (
    <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>{rotulo}</span>
      <span
        className={mono ? 'font-mono' : 'font-mono'}
        style={{
          fontSize: 12,
          color: tom ? COR[tom as Tom] : ouro ? COR.ouro : 'var(--color-corrente)',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '60%',
        }}
      >
        {valor}
      </span>
    </span>
  )
}

function Par({ rotulo, valor, mono, tom }: { rotulo: string; valor: string; mono?: boolean; tom?: Tom }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="font-sans" style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-terciario)' }}>
        {rotulo}
      </span>
      <span className={mono ? 'font-mono' : 'font-sans'} style={{ fontSize: 11, color: tom ? COR[tom] : 'var(--color-corrente)', wordBreak: 'break-all' }}>
        {valor}
      </span>
    </span>
  )
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty', margin: 0 }}>
      {children}
    </p>
  )
}

function TabelaSimples({
  grade,
  colunas,
  linhas,
}: {
  grade: string
  colunas: string[]
  linhas: ReactNode[][]
}) {
  return (
    <div style={{ border: '1px solid var(--color-borda)', borderRadius: 14, background: 'var(--color-mesa)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 940 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: grade,
              gap: 10,
              padding: '9px 14px',
              background: '#161617',
              borderBottom: '1px solid var(--color-borda)',
            }}
          >
            {colunas.map((c) => (
              <span key={c} className="font-sans" style={{ fontWeight: 600, fontSize: 8.5, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--color-terciario)' }}>
                {c}
              </span>
            ))}
          </div>
          {linhas.map((cells, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: grade,
                gap: 10,
                alignItems: 'center',
                padding: '8px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--color-borda-sutil)',
              }}
            >
              {cells.map((c, j) => (
                <span key={j} className="font-mono" style={{ fontSize: 11, color: 'var(--color-corrente)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
