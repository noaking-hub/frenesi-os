'use client'

import { useState } from 'react'

import { BotaoOuro, BotaoSecundario, Losango, Rotulo, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { RODIZIO_HISTORICO } from '@/data/fixtures'
import { RODIZIO_PADRAO, brl, montarRodada, num, parseNum, pct, pisoMargem, plural } from '@/domain'
import type { ConfigRodizio, ItemVitrine, ParametrosPrecificacao, PerfumeBase } from '@/domain'

interface Props {
  vitrine: ItemVitrine[]
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
}

interface CampoConfig {
  chave: keyof Omit<ConfigRodizio, 'ativo'>
  label: string
  unidade: string
  hint: string
}

const CAMPOS: CampoConfig[] = [
  { chave: 'cicloHoras', label: 'Intervalo do rodízio', unidade: 'h', hint: 'A cada quantas horas trocar a vitrine' },
  { chave: 'quantidade', label: 'Produtos por ciclo', unidade: 'un', hint: 'Quantos entram em desconto de uma vez' },
  { chave: 'campeoes', label: 'Campeões de venda incluídos', unidade: 'un', hint: 'Puxam tráfego para a vitrine' },
  { chave: 'descontoMin', label: 'Desconto mínimo', unidade: '%', hint: 'Aplicado aos campeões de venda' },
  { chave: 'descontoMax', label: 'Desconto máximo', unidade: '%', hint: 'Teto para os itens mais parados' },
]

export function RodizioCliente({ vitrine, bases, parametros }: Props) {
  const [config, setConfig] = useState<ConfigRodizio>(RODIZIO_PADRAO)
  const [semente, setSemente] = useState(1)
  const [textos, setTextos] = useState<Partial<Record<CampoConfig['chave'], string>>>({})

  const rodada = montarRodada(vitrine, bases, parametros, config, semente)
  const piso = pisoMargem(parametros)
  const encalhados = rodada.selecao.filter((s) => s.tipo === 'encalhado')
  const campeoes = rodada.selecao.filter((s) => s.tipo === 'campeao')

  const editar = (chave: CampoConfig['chave'], texto: string) =>
    setTextos((t) => ({ ...t, [chave]: texto.replace(/[^0-9]/g, '') }))
  const confirmar = (chave: CampoConfig['chave']) => {
    const texto = textos[chave]
    setTextos((t) => {
      const { [chave]: _descartado, ...resto } = t
      return resto
    })
    if (texto === undefined || texto.trim() === '') return
    setConfig((c) => ({ ...c, [chave]: parseNum(texto) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section
        style={{
          background: 'linear-gradient(160deg,#16141A,#101011)',
          border: '1px solid rgba(239,209,140,.16)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Losango />
              <TituloSecao tamanho={15.5} tom="ouro">
                Rodízio da coleção Ofertas
              </TituloSecao>
              <span
                className="font-sans"
                style={{
                  fontWeight: 600,
                  fontSize: 9,
                  lineHeight: 1,
                  letterSpacing: '.09em',
                  textTransform: 'uppercase',
                  color: config.ativo ? COR.ok : COR.atencao,
                  border: `1px solid ${config.ativo ? COR.ok : COR.atencao}`,
                  borderRadius: 'var(--radius-pill)',
                  padding: '3px 7px',
                  whiteSpace: 'nowrap',
                }}
              >
                {config.ativo ? 'Coleção Ofertas ativa' : 'Rodízio pausado'}
              </span>
            </span>
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.6)' }}>
              {config.ativo
                ? `${config.quantidade} produtos a cada ${config.cicloHoras}h · ${config.quantidade - config.campeoes} encalhados e ${config.campeoes} campeões de venda`
                : 'A coleção Ofertas fica sem novos produtos até reativar'}
            </span>
            <span className="font-mono" style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1.4, color: 'rgba(239,209,140,.6)' }}>
              {config.ativo ? 'Próxima troca em 11h 20min · 05/08 às 09:00' : 'Sem próxima troca agendada'}
            </span>
          </div>
          <BotaoSecundario altura={34} onClick={() => setSemente((s) => s + 1)}>
            Sortear novamente
          </BotaoSecundario>
          <Switch
            ligado={config.ativo}
            onChange={(v) => setConfig((c) => ({ ...c, ativo: v }))}
            label={config.ativo ? 'Pausar rodízio' : 'Ativar rodízio'}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
            gap: '14px 18px',
            padding: '17px 20px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {CAMPOS.map((c) => (
            <label key={c.chave} style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
              <span className="font-sans" style={{ fontWeight: 600, fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-corrente)' }}>
                {c.label}
              </span>
              <span
                className="focus-within:border-ouro/45"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  height: 36,
                  padding: '0 12px',
                  border: '1px solid rgba(255,255,255,.11)',
                  background: 'rgba(255,255,255,.03)',
                  borderRadius: 9,
                }}
              >
                <input
                  value={textos[c.chave] ?? String(config[c.chave])}
                  onChange={(e) => editar(c.chave, e.target.value)}
                  onBlur={() => confirmar(c.chave)}
                  inputMode="numeric"
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
                <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                  {c.unidade}
                </span>
              </span>
              <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.35, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
                {c.hint}
              </span>
            </label>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
            gap: 13,
            padding: '17px 20px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          {(
            [
              {
                label: 'Nesta rodada',
                valor: String(rodada.selecao.length),
                hint: `${encalhados.length} encalhados · ${campeoes.length} campeões${rodada.vagasSemCandidato > 0 ? ` · ${plural(rodada.vagasSemCandidato, 'vaga sem candidato', 'vagas sem candidato')}` : ''}`,
                cor: 'var(--color-tinta)',
              },
              {
                label: 'Encalhe atacado',
                valor: `${rodada.diasParadosMedio} dias`,
                hint: 'Média sem venda dos selecionados',
                cor: COR.atencao,
              },
              {
                label: 'Desconto médio',
                valor: pct(Math.round(rodada.descontoMedio * 10) / 10),
                hint: 'Ponderado pelos itens da rodada',
                cor: COR.ouro,
              },
              {
                label: 'Menor margem da rodada',
                valor: pct(Math.round(rodada.menorMargem * 10) / 10),
                hint: rodada.limitadosPeloPiso
                  ? `${plural(rodada.limitadosPeloPiso, 'item com desconto limitado', 'itens com desconto limitado')} pelo piso de ${num(piso)}%`
                  : `Todos acima do piso de ${num(piso)}%`,
                cor: rodada.menorMargem >= parametros.margemAlvo - 0.5 ? COR.ok : COR.atencao,
              },
              {
                label: 'Receita última rodada',
                valor: brl(RODIZIO_HISTORICO[0].receita),
                hint: `${RODIZIO_HISTORICO[0].quando.split(' ')[0]} · conversão de ${RODIZIO_HISTORICO[0].conversao}`,
                cor: COR.ok,
              },
            ] as const
          ).map((k) => (
            <span key={k.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <Rotulo>{k.label}</Rotulo>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 19, lineHeight: 1, color: k.cor }}>
                {k.valor}
              </span>
              <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.35, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
                {k.hint}
              </span>
            </span>
          ))}
        </div>

        <div
          className="font-sans"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 108px 132px 96px 92px 88px minmax(0,1fr)',
            gap: 12,
            padding: '11px 20px',
            background: 'var(--color-cabecalho)',
            borderBottom: '1px solid rgba(255,255,255,.06)',
            fontWeight: 600,
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'var(--color-terciario)',
          }}
        >
          <span>Produto</span>
          <span>Motivo</span>
          <span>Giro</span>
          <span style={{ textAlign: 'right' }}>De</span>
          <span style={{ textAlign: 'right' }}>Por</span>
          <span style={{ textAlign: 'right' }}>Margem</span>
          <span>Observação</span>
        </div>
        {rodada.selecao.map((s) => {
          const cor = s.tipo === 'campeao' ? COR.ouro : COR.atencao
          return (
            <div
              key={`${s.item.baseId}-${s.item.variante}`}
              className="hover:bg-[rgba(239,209,140,.04)]"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 108px 132px 96px 92px 88px minmax(0,1fr)',
                gap: 12,
                alignItems: 'center',
                padding: '11px 20px',
                borderTop: '1px solid var(--color-borda-sutil)',
                borderLeft: `2px solid ${cor}`,
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
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
                  {s.base.nome}
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10, lineHeight: 1.25, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(239,209,140,.55)' }}
                >
                  {`${s.item.variante} ml`}
                </span>
              </span>
              <span
                className="font-sans"
                style={{
                  justifySelf: 'start',
                  fontWeight: 600,
                  fontSize: 9.5,
                  lineHeight: 1,
                  letterSpacing: '.07em',
                  textTransform: 'uppercase',
                  color: cor,
                  border: `1px solid ${cor}`,
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.tipo === 'campeao' ? 'Campeão' : 'Encalhado'}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.66)', whiteSpace: 'nowrap' }}>
                  {s.item.diasParado === 0 ? 'Vendeu hoje' : `${s.item.diasParado} dias sem venda`}
                </span>
                <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}>
                  {`${s.item.vendas30} un / 30d`}
                </span>
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.45)', textAlign: 'right', textDecoration: 'line-through', whiteSpace: 'nowrap' }}
              >
                {brl(s.item.preco)}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 13, lineHeight: 1, color: 'var(--color-ouro)', whiteSpace: 'nowrap' }}>
                  {brl(s.preco)}
                </span>
                <span className="font-sans" style={{ fontWeight: 600, fontSize: 9.5, lineHeight: 1, color: cor }}>
                  {`-${s.pct}%`}
                </span>
              </span>
              <span
                className="font-mono"
                style={{
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: 1,
                  color: s.margem >= parametros.margemAlvo - 0.5 ? COR.ok : COR.atencao,
                  textAlign: 'right',
                }}
              >
                {pct(Math.round(s.margem * 10) / 10)}
              </span>
              <span
                className="font-sans"
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.4,
                  color: s.limitado ? COR.atencao : 'rgba(242,237,227,.38)',
                  textWrap: 'pretty',
                }}
              >
                {s.limitado
                  ? `Desconto limitado a ${s.pct}% pelo piso de margem`
                  : s.tipo === 'campeao'
                    ? 'Puxa tráfego para a vitrine'
                    : 'Prioridade por tempo parado'}
              </span>
            </div>
          )
        })}

        {rodada.foraDoPiso.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 11,
              padding: '13px 20px',
              borderTop: '1px solid var(--color-borda-sutil)',
              background: 'rgba(217,140,63,.05)',
            }}
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: COR.atencao, flex: 'none', marginTop: 5 }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <span className="font-sans" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1.45, color: 'rgba(242,237,227,.72)' }}>
                {`${plural(rodada.foraDoPiso.length, 'produto ficou de fora', 'produtos ficaram de fora')}: com o desconto mínimo de ${config.descontoMin}% a margem cairia abaixo do piso de ${num(piso)}%.`}
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {rodada.foraDoPiso.map((f) => (
                  <span
                    key={`${f.item.baseId}-${f.item.variante}`}
                    className="font-sans"
                    style={{
                      fontWeight: 500,
                      fontSize: 10.5,
                      lineHeight: 1,
                      color: COR.atencao,
                      border: '1px solid rgba(217,140,63,.3)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '4px 9px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {`${f.base.nome} ${f.item.variante} ml`}
                  </span>
                ))}
              </span>
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: '50%', background: COR.ok, flex: 'none', animation: 'fr-pulse 2.4s ease-in-out infinite' }}
          />
          <span className="font-sans" style={{ flex: 1, fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
            Os produtos entram na coleção Ofertas da Shopify com preço promocional e saem dela ao
            fim do ciclo, voltando ao preço original. Esgotados ficam de fora automaticamente.
          </span>
          <BotaoOuro altura={34}>Publicar na coleção Ofertas</BotaoOuro>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 13 }}>
        {RODIZIO_HISTORICO.map((h) => (
          <div
            key={h.quando}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '14px 16px',
              border: '1px solid var(--color-borda)',
              background: 'linear-gradient(170deg,#16151A,#101011)',
              borderRadius: 13,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 11, lineHeight: 1, color: 'rgba(239,209,140,.7)' }}>
                {h.quando}
              </span>
              <span style={{ flex: 1 }} />
              <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                {`${h.itens} produtos`}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 16, lineHeight: 1, color: 'var(--color-corrente)' }}>
                {brl(h.receita)}
              </span>
              <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, color: COR.ok }}>
                {`conversão ${h.conversao}`}
              </span>
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
              {h.destaque}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
