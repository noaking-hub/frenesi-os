'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, custoDeReceber, desproporcao, pct, plural } from '@/domain'
import type { CustoPorMeio, ParametrosPrecificacao } from '@/domain'

import { ajustarIntermediador } from './actions'

/**
 * Do que o gateway cobrou para o percentual que entra no preço.
 *
 * A tabela de taxas do Mercado Pago lista o pior caso de cada modalidade —
 * 14,94% para 6x sem juros. Não é isso que a operação custa: é a média
 * ponderada da mistura real de quem compra. Precificar tudo pelo pior caso
 * faz o cliente do Pix pagar por um parcelamento que ele não usou, e a conta
 * some no preço, onde ninguém a vê.
 *
 * Nada aqui é digitado: cada percentual vem da tarifa que o próprio gateway
 * informou em cada pagamento.
 */
export function CustoDeReceber({
  parametros,
  meios,
}: {
  parametros: ParametrosPrecificacao
  meios: CustoPorMeio[]
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciar] = useTransition()

  const r = custoDeReceber(meios)
  const noParametro = parametros.intermediadorPct
  const diferenca = Math.round((noParametro - r.pct) * 100) / 100
  const mudaOParametro = Math.abs(diferenca) >= 0.05

  if (meios.length === 0) {
    return (
      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 16,
          padding: '19px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <TituloSecao tamanho={14.5}>Custo real de receber</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Sincronize o Mercado Pago em Financeiro → Extrato. Com os pagamentos lidos, este bloco
          mostra o que cada meio custou de fato e a média ponderada que deveria entrar no preço —
          em vez do pior caso da tabela de taxas.
        </span>
      </section>
    )
  }

  const aplicar = () =>
    iniciar(async () => {
      setErro(null)
      setSalvo(false)
      const resposta = await ajustarIntermediador(r.pct)
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
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={14.5}>Custo real de receber</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          {`${plural(r.vendas, 'pagamento lido', 'pagamentos lidos')} nos últimos 90 dias · tarifa informada pelo gateway`}
        </span>
      </span>

      <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Rotulo>Média ponderada</Rotulo>
          <Valor tamanho={26} tom="ouro">
            {pct(r.pct, 2)}
          </Valor>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Rotulo>No parâmetro hoje</Rotulo>
          <Valor tamanho={26} tom={mudaOParametro ? COR.atencao : COR.ok}>
            {pct(noParametro, 2)}
          </Valor>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Rotulo>Tarifa paga no período</Rotulo>
          <Valor tamanho={26}>{brl(r.tarifa)}</Valor>
        </span>
      </div>

      {/* Uma linha por meio: o preço e o peso, lado a lado. É a leitura que
          decide se o parcelamento sem juros está pagando o que custa. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {r.meios.map((m) => {
          const daTarifa = desproporcao(m, r)
          const pesado = daTarifa > m.fatia * 2 && m.fatia >= 1
          return (
            <div
              key={m.meio}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 64px 74px 78px minmax(0,1.1fr)',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 9,
                background: pesado ? 'rgba(224,168,74,.06)' : 'rgba(255,255,255,.02)',
                border: `1px solid ${pesado ? 'rgba(224,168,74,.18)' : 'rgba(255,255,255,.05)'}`,
              }}
            >
              <span
                className="font-sans"
                style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--color-corrente)' }}
              >
                {m.meio}
              </span>
              <span className="font-mono" style={{ fontSize: 11, color: COR.atencao, textAlign: 'right' }}>
                {pct(m.pct, 2)}
              </span>
              <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)', textAlign: 'right' }}>
                {brl(m.tarifa)}
              </span>
              <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.5)', textAlign: 'right' }}>
                {pct(m.fatia, 1)}
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {`${pct(m.fatia, 1)} do faturamento · ${pct(daTarifa, 1)} da tarifa`}
              </span>
            </div>
          )
        })}
      </div>

      {r.maisCaro && r.maisBarato && r.maisCaro.meio !== r.maisBarato.meio && (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(242,237,227,.7)', textWrap: 'pretty' }}
        >
          {`${r.maisCaro.meio} custa ${pct(r.maisCaro.pct, 2)} e responde por ${pct(desproporcao(r.maisCaro, r), 0)} de toda a tarifa, com ${pct(r.maisCaro.fatia, 1)} do faturamento. ${r.maisBarato.meio} custa ${pct(r.maisBarato.pct, 2)}. Quem paga o parcelamento sem juros é o preço de todo mundo — inclusive de quem escolheu ${r.maisBarato.meio.toLowerCase()}.`}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <BotaoOuro altura={36} desabilitado={pendente || !mudaOParametro} onClick={aplicar}>
          {pendente ? 'Aplicando…' : `Usar ${pct(r.pct, 2)} no preço`}
        </BotaoOuro>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty', flex: 1 }}
        >
          {erro
            ? erro
            : salvo
              ? 'Parâmetro atualizado. Os preços sugeridos já usam o custo medido.'
              : mudaOParametro
                ? diferenca > 0
                  ? `O parâmetro está ${pct(diferenca, 2)} acima do medido — cada preço carrega esse custo a mais.`
                  : `O parâmetro está ${pct(Math.abs(diferenca), 2)} abaixo do medido — a margem real é menor que a calculada.`
                : 'O parâmetro já reflete o custo medido.'}
        </span>
      </div>
    </section>
  )
}
