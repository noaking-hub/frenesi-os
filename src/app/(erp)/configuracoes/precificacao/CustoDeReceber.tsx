'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, custoDeReceber, descontoPixPct, pct } from '@/domain'
import type { CustoPorMeio, ParametrosPrecificacao } from '@/domain'

import { ajustarIntermediador, ajustarPix } from './actions'

/**
 * Quanto do preço de tabela não chega na conta.
 *
 * A versão anterior desta tela despejava oito linhas de percentual por meio
 * de pagamento e mandava o operador concluir sozinho. Errado: o que precisa
 * ser dito são duas parcelas e uma soma.
 *
 *   desconto de Pix  — o preço que o cliente não paga
 *   tarifa do gateway — o que o Mercado Pago retém
 *
 * O detalhamento por meio continua disponível, escondido atrás de um clique,
 * porque ele responde outra pergunta: se vale manter o parcelamento sem
 * juros. Misturar as duas perguntas na mesma tela foi o erro.
 */
export function CustoDeReceber({
  parametros,
  meios,
}: {
  parametros: ParametrosPrecificacao
  meios: CustoPorMeio[]
}) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const r = custoDeReceber(meios)
  const pesoPix = descontoPixPct(parametros)
  const tarifa = parametros.intermediadorPct
  const total = Math.round((pesoPix + tarifa) * 100) / 100

  // A fatia de Pix medida no extrato, contra a que está gravada.
  const pixMedido = meios.find((m) => m.meio.toLowerCase().startsWith('pix'))
  const fatiaMedida = pixMedido?.fatia ?? 0
  const fatiaDesatualizada = fatiaMedida > 0 && Math.abs(fatiaMedida - parametros.fatiaPixPct) >= 1
  const tarifaDesatualizada = r.pct > 0 && Math.abs(r.pct - tarifa) >= 0.05

  function rodar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, recado: string) {
    setErro(null)
    setSalvo(null)
    iniciar(async () => {
      const resposta = await acao()
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setSalvo(recado)
    })
  }

  return (
    <section
      style={{
        background: 'linear-gradient(170deg,#141315,#101011)',
        border: '1px solid var(--color-borda-ouro)',
        borderRadius: 16,
        padding: '19px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={14.5}>Quanto do preço não chega na conta</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          Entra no cálculo de todo preço sugerido
        </span>
      </span>

      {/* Duas parcelas e uma soma. Nada além disso. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <Parcela
          rotulo="Desconto de Pix"
          valor={pct(pesoPix, 2)}
          nota={
            parametros.descontoPixPct > 0
              ? `${pct(parametros.descontoPixPct, 0)} de desconto em ${pct(parametros.fatiaPixPct, 1)} das vendas`
              : 'nenhum desconto cadastrado'
          }
        />
        <span className="font-mono" style={{ fontSize: 18, color: 'rgba(242,237,227,.3)', paddingBottom: 12 }}>
          +
        </span>
        <Parcela
          rotulo="Tarifa do gateway"
          valor={pct(tarifa, 2)}
          nota={r.pct > 0 ? `medido: ${pct(r.pct, 2)} em ${r.vendas} pagamentos` : 'sem medição ainda'}
        />
        <span className="font-mono" style={{ fontSize: 18, color: 'rgba(242,237,227,.3)', paddingBottom: 12 }}>
          =
        </span>
        <Parcela rotulo="Custo de receber" valor={pct(total, 2)} nota="do preço de tabela" destaque />
      </div>

      {(fatiaDesatualizada || tarifaDesatualizada) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {tarifaDesatualizada && (
            <BotaoOuro
              altura={32}
              desabilitado={pendente}
              onClick={() =>
                rodar(() => ajustarIntermediador(r.pct), `Tarifa do gateway agora é ${pct(r.pct, 2)}.`)
              }
            >
              {`Usar a tarifa medida · ${pct(r.pct, 2)}`}
            </BotaoOuro>
          )}
          {fatiaDesatualizada && (
            <BotaoOuro
              altura={32}
              desabilitado={pendente}
              onClick={() =>
                rodar(
                  () => ajustarPix(parametros.descontoPixPct, fatiaMedida),
                  `Fatia de Pix atualizada para ${pct(fatiaMedida, 1)}.`,
                )
              }
            >
              {`Usar a fatia de Pix medida · ${pct(fatiaMedida, 1)}`}
            </BotaoOuro>
          )}
        </div>
      )}

      {(erro || salvo) && (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
        >
          {erro ?? salvo}
        </span>
      )}

      {meios.length > 0 && (
        <>
          <span style={{ display: 'flex' }}>
            <BotaoSecundario altura={28} onClick={() => setAberto((v) => !v)}>
              {aberto ? 'Esconder o detalhe por meio' : 'Ver por meio de pagamento'}
            </BotaoSecundario>
          </span>

          {aberto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                Só a tarifa do gateway — o desconto de Pix não aparece aqui porque ele sai do preço,
                não do crédito. Serve para decidir se o parcelamento sem juros se paga.
              </span>
              {r.meios.map((m) => (
                <div
                  key={`${m.meio}@${m.gateway}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 70px 84px 84px',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,.02)',
                  }}
                >
                  <span
                    className="font-sans"
                    style={{ fontSize: 11.5, color: 'var(--color-corrente)', minWidth: 0 }}
                  >
                    {m.meio}
                    {/* O gateway ao lado do meio não é detalhe: o mesmo Pix
                        custa 0,70% num intermediador e 0,99% no outro, e sem
                        o nome ao lado os dois números parecem contradição. */}
                    <span style={{ color: 'var(--color-terciario)', fontSize: 10 }}>
                      {` · ${m.gateway}`}
                    </span>
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: COR.atencao, textAlign: 'right' }}>
                    {pct(m.pct, 2)}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)', textAlign: 'right' }}>
                    {brl(m.tarifa)}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)', textAlign: 'right' }}>
                    {`${pct(m.fatia, 1)} das vendas`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {aberto && r.historico.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                Fora do cálculo — gateway encerrado. Fica visível para comparar contrato antigo com
                o novo, mas não entra no preço: precificar com a tarifa de quem não processa mais
                subestima o custo de toda venda futura.
              </span>
              {r.historico.map((m) => (
                <div
                  key={`${m.meio}@${m.gateway}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 70px 84px 84px',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,.012)',
                    opacity: 0.62,
                  }}
                >
                  <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-corrente)' }}>
                    {m.meio}
                    <span style={{ color: 'var(--color-terciario)', fontSize: 10 }}>
                      {` · ${m.gateway}`}
                    </span>
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)', textAlign: 'right' }}>
                    {pct(m.pct, 2)}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)', textAlign: 'right' }}>
                    {brl(m.tarifa)}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.4)', textAlign: 'right' }}>
                    {`${m.vendas} vendas`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Parcela({
  rotulo,
  valor,
  nota,
  destaque = false,
}: {
  rotulo: string
  valor: string
  nota: string
  destaque?: boolean
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
      <Rotulo>{rotulo}</Rotulo>
      <Valor tamanho={destaque ? 28 : 22} tom={destaque ? 'ouro' : undefined}>
        {valor}
      </Valor>
      <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
        {nota}
      </span>
    </span>
  )
}
