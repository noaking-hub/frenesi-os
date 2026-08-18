import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { EstadoVazio, TituloSecao } from '@/components/erp/primitivos'
import { acharRelatorio, rodarRelatorio, ufsCadastradas } from '@/data/relatorios'
import {
  LINHAS_NA_TELA,
  brl,
  hojeEmSaoPaulo,
  janelaDoAtalho,
  janelaEmPalavras,
  num,
  ordenarLinhas,
  pct,
} from '@/domain'
import type { CelulaRelatorio, ColunaRelatorio } from '@/domain'

import { BaixarRelatorio } from './BaixarRelatorio'
import { FiltrosDoRelatorio } from './FiltrosDoRelatorio'

export const dynamic = 'force-dynamic'

/**
 * A tela ÚNICA dos relatórios.
 *
 * Dezenove perguntas, uma tela. Filtro, ordenação, exportação, corte e estado
 * vazio moram aqui e valem para todos — o que muda de relatório para
 * relatório é a consulta, que mora no catálogo. Foi isso que permitiu sair de
 * uma tela de vendas para um módulo, sem dezenove telas para manter.
 */

const dataPt = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}`

function formatar(valor: CelulaRelatorio, coluna: ColunaRelatorio): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (coluna.tipo) {
    case 'dinheiro':
      return brl(Number(valor))
    case 'percentual':
      return pct(Number(valor))
    case 'ml':
      return `${num(Math.round(Number(valor) * 10) / 10)} ml`
    case 'numero':
      return num(Number(valor))
    case 'data':
      return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? dataPt(String(valor)) : String(valor)
    default:
      return String(valor)
  }
}

export default async function TelaDeRelatorio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    atalho?: string
    de?: string
    ate?: string
    uf?: string
    q?: string
    ordem?: string
    dir?: string
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const definicao = acharRelatorio(id)
  if (!definicao) notFound()

  const hoje = hojeEmSaoPaulo()
  // Data à mão vence o atalho; sem nenhuma das duas, o padrão é 30 dias —
  // relatório que abre varrendo dois anos demora, e a pergunta é sobre o mês.
  const manual = Boolean(sp.de || sp.ate)
  const janela = manual
    ? { de: sp.de ?? null, ate: sp.ate ?? null }
    : janelaDoAtalho(sp.atalho ?? '30', hoje)

  const filtros = {
    de: definicao.usaData ? janela.de : null,
    ate: definicao.usaData ? janela.ate : null,
    uf: definicao.usaUf ? (sp.uf ?? null) : null,
    q: definicao.usaBusca ? (sp.q ?? null) : null,
  }

  const [resultado, ufs] = await Promise.all([
    rodarRelatorio(id, { ...filtros, limite: LINHAS_NA_TELA }),
    definicao.usaUf ? ufsCadastradas() : Promise.resolve([]),
  ])

  const ordem = sp.ordem ?? null
  const desc = sp.dir !== 'asc'
  const linhas = ordenarLinhas(resultado.linhas, resultado.colunas, ordem, desc)

  const kpis: Kpi[] = resultado.kpis.map((k) => ({
    label: k.rotulo,
    valor: k.valor,
    // O hint nunca é decorativo: sem nota própria, ele diz a janela — que é
    // o que qualifica todo número desta tela.
    hint: k.nota ?? janelaEmPalavras(filtros.de, filtros.ate),
  }))

  const linkDaColuna = (chave: string) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, String(v))
    p.set('ordem', chave)
    // Clicar de novo na mesma coluna inverte; clicar em outra começa
    // decrescente, que é o que se quer em coluna de dinheiro.
    p.set('dir', ordem === chave && desc ? 'asc' : 'desc')
    return `/relatorios/${id}?${p.toString()}`
  }

  const cortou =
    typeof resultado.totalAntesDoCorte === 'number' && resultado.totalAntesDoCorte > linhas.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/relatorios"
          className="font-sans hover:text-ouro"
          style={{ fontSize: 11.5, color: 'var(--color-terciario)', textDecoration: 'none' }}
        >
          ← Relatórios
        </Link>
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          · {definicao.grupo}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <TituloSecao tamanho={19}>{definicao.titulo}</TituloSecao>
        <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-secundario)' }}>
          {definicao.responde} · {janelaEmPalavras(filtros.de, filtros.ate)}
        </span>
      </div>

      <FiltrosDoRelatorio
        usaData={definicao.usaData}
        usaUf={Boolean(definicao.usaUf)}
        usaBusca={Boolean(definicao.usaBusca)}
        notaDaData={definicao.notaDaData}
        ufs={ufs}
      />

      {kpis.length > 0 ? <FaixaKpis kpis={kpis} /> : null}

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem linhas para este recorte"
          instrucao={resultado.vazioPorque ?? 'Ajuste o período ou os filtros.'}
        />
      ) : (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div className="tabela-grade">
          <div style={{ overflowX: 'auto' }}>
            <table
              className="font-sans"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}
            >
              <thead>
                <tr>
                  {resultado.colunas.map((c) => {
                    const numerica = c.tipo !== 'texto' && c.tipo !== 'data'
                    const ativa = ordem === c.chave
                    return (
                      <th
                        key={c.chave}
                        style={{
                          textAlign: numerica ? 'right' : 'left',
                          padding: '11px 14px',
                          borderBottom: '1px solid var(--color-borda)',
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: ativa ? 'var(--color-ouro)' : 'var(--color-terciario)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Link
                          href={linkDaColuna(c.chave)}
                          className="hover:text-ouro"
                          style={{ color: 'inherit', textDecoration: 'none' }}
                          scroll={false}
                        >
                          {c.rotulo}
                          {ativa ? (desc ? ' ↓' : ' ↑') : ''}
                        </Link>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    {resultado.colunas.map((c) => {
                      const numerica = c.tipo !== 'texto' && c.tipo !== 'data'
                      const negativo = numerica && Number(linha[c.chave]) < 0
                      return (
                        <td
                          key={c.chave}
                          className={numerica ? 'font-mono' : undefined}
                          style={{
                            textAlign: numerica ? 'right' : 'left',
                            padding: '10px 14px',
                            color: negativo ? 'var(--color-erro)' : 'var(--color-corrente)',
                            whiteSpace: c.tipo === 'texto' ? 'normal' : 'nowrap',
                          }}
                        >
                          {formatar(linha[c.chave], c)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          {/* ── Cartões do celular ─────────────────────────────────────────
              O relatório é genérico, então o cartão também é: a primeira
              coluna vira o topo e as demais viram pares rótulo → valor. */}
          <div className="tabela-cartoes">
            {linhas.map((linha, i) => {
              const [primeira, ...demais] = resultado.colunas
              return (
                <div
                  key={i}
                  style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,.04)' }}
                >
                  <div
                    className="font-sans"
                    style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-corrente)', paddingBottom: 7 }}
                  >
                    {formatar(linha[primeira.chave], primeira)}
                  </div>
                  {demais.map((c) => {
                    const numerica = c.tipo !== 'texto' && c.tipo !== 'data'
                    const negativo = numerica && Number(linha[c.chave]) < 0
                    return (
                      <div
                        key={c.chave}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '2px 0',
                        }}
                      >
                        <span
                          className="font-sans"
                          style={{
                            flexShrink: 0,
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '.1em',
                            textTransform: 'uppercase',
                            color: 'var(--color-terciario)',
                          }}
                        >
                          {c.rotulo}
                        </span>
                        <span
                          className={numerica ? 'font-mono' : 'font-sans'}
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textAlign: 'right',
                            fontSize: 12,
                            color: negativo ? 'var(--color-erro)' : 'var(--color-corrente)',
                          }}
                        >
                          {formatar(linha[c.chave], c)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 14px',
              borderTop: '1px solid var(--color-borda)',
            }}
          >
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              {cortou
                ? `Mostrando ${num(linhas.length)} de ${num(resultado.totalAntesDoCorte!)} linhas — a planilha leva todas`
                : `${num(linhas.length)} ${linhas.length === 1 ? 'linha' : 'linhas'}`}
            </span>
            <BaixarRelatorio id={id} titulo={definicao.titulo} filtros={filtros} />
          </div>
        </section>
      )}
    </div>
  )
}
