'use client'

import { useState, useTransition } from 'react'

import { Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, parseNum, pct, plural, ratearAds } from '@/domain'
import type { ParametrosPrecificacao, ReceitaMensal } from '@/domain'

import { ajustarAds } from './actions'

/**
 * Do valor que se gasta para o percentual que entra no preço.
 *
 * Quem compra tráfego sabe o valor do mês — "gasto R$ 7.000" —, não o
 * percentual. A precificação trabalha em percentual, porque é assim que o
 * custo se distribui entre um decant de 3 ml e um de 15 ml. A ponte é a
 * receita, e o ERP já a tem: não há por que pedir ao operador um número que
 * ele teria de calcular na mão.
 */
export function RateioMarketing({
  parametros,
  receita,
}: {
  parametros: ParametrosPrecificacao
  receita: ReceitaMensal
}) {
  const [texto, setTexto] = useState(
    parametros.adsMensal ? String(parametros.adsMensal).replace('.', ',') : '',
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciarTransicao] = useTransition()

  const gasto = parseNum(texto)
  const r = ratearAds(gasto, receita.receitaProdutos, receita.pedidos)
  const mudaOParametro = Math.abs(r.pct - parametros.adsPct) >= 0.05
  const podeAplicar = r.gastoMensal > 0 && r.receitaProdutos > 0 && r.pct < 100 && mudaOParametro

  const aplicar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setSalvo(false)
      const resposta = await ajustarAds(r.pct, r.gastoMensal)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setSalvo(true)
    })

  return (
    <section
      style={{
        background: 'linear-gradient(170deg,#141315,#101011)',
        border: '1px solid var(--color-borda-ouro)',
        borderRadius: 16,
        padding: '19px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 15,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <TituloSecao>Marketing: do gasto mensal para o percentual</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          Você sabe quanto gasta por mês; o preço trabalha em percentual, porque é assim que o
          custo se reparte entre um decant de 3 ml e um de 15 ml. O ERP faz a ponte com a receita
          que já tem: gasto ÷ receita de produto dos últimos 30 dias.
        </span>
      </span>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 240px', minWidth: 220 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 11.5, color: 'var(--color-corrente)' }}
          >
            Gasto mensal com tráfego pago
          </span>
          <span
            className="focus-within:border-ouro/45"
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
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value.replace(/[^0-9.,]/g, ''))
                setSalvo(false)
              }}
              inputMode="decimal"
              placeholder="7000,00"
              aria-label="Gasto mensal com tráfego pago"
              className="font-mono"
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
              / mês
            </span>
          </span>
        </label>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
          <Rotulo>Receita de produto · 30 dias</Rotulo>
          <Valor tamanho={15}>{brl(receita.receitaProdutos)}</Valor>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--color-terciario)' }}
          >
            {`${plural(receita.pedidos, 'pedido pago', 'pedidos pagos')} · sem frete`}
          </span>
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
          <Rotulo>Percentual a usar</Rotulo>
          <Valor tamanho={19} tom={r.ressalva ? 'atencao' : 'ouro'}>
            {r.gastoMensal > 0 && r.receitaProdutos > 0 ? pct(r.pct) : '—'}
          </Valor>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--color-terciario)' }}
          >
            {r.porPedido > 0 ? `${brl(r.porPedido)} por pedido` : 'hoje: ' + pct(parametros.adsPct)}
          </span>
        </span>
      </div>

      <span
        className="font-sans"
        style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.34)', textWrap: 'pretty' }}
      >
        O rateio é sobre a receita de produto, sem frete — frete é repassado à transportadora e
        incluí-lo diluiria o marketing num dinheiro que só passa pela conta. Entram só pedidos
        pagos: anúncio que gerou pedido cancelado custou igual, mas não há receita nele para
        ratear. Refaça esta conta todo mês: o gasto fica parado, a receita não.
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 200 }}>
          {(erro || r.ressalva || salvo) && (
            <span
              className="font-sans"
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: erro || r.ressalva ? COR.atencao : COR.ok,
                textWrap: 'pretty',
              }}
            >
              {erro ??
                r.ressalva ??
                `Marketing e ADS agora é ${pct(r.pct)}. Os preços sugeridos já saem com esse custo dentro — reveja a Precificação antes de publicar.`}
            </span>
          )}
          {!erro && !r.ressalva && !salvo && !mudaOParametro && (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: COR.ok, textWrap: 'pretty' }}
            >
              {`O parâmetro já está em ${pct(parametros.adsPct)} — é o que este gasto dá.`}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={aplicar}
          disabled={!podeAplicar || pendente}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 38,
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'wait' : podeAplicar ? 'pointer' : 'not-allowed',
            opacity: !podeAplicar || pendente ? 0.45 : 1,
          }}
        >
          {/* Só oferece o número quando ele é utilizável: um botão desligado
              dizendo "usar 257,8%" parece proposta, não recusa. */}
          {pendente ? 'Salvando…' : podeAplicar ? `Usar ${pct(r.pct)} como ADS` : 'Usar como ADS'}
        </button>
      </div>
    </section>
  )
}
