'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Etiqueta, TINTA } from '@/components/erp/ui'
import { competenciaAnterior, competenciaPorExtenso } from '@/domain'

/**
 * O mês que a Visão Financeira está mostrando — no topo, antes dos números.
 *
 * Estava fixo no mês corrente, e a segunda pergunta de qualquer dono depois
 * de olhar o resultado é "e o mês passado?". Ela obrigava a sair da tela.
 *
 * O estado vive na URL, como nos Lançamentos: assim o F5 mantém o mês, o
 * link colado no WhatsApp abre no mês certo, e o botão "voltar" do navegador
 * faz o que a pessoa espera.
 *
 * O aviso ao lado não é decoração. Metade desta tela é caixa (saldo de hoje,
 * projeção de 7 e 30 dias) e caixa não tem competência: o saldo é o de agora,
 * não o do dia 31 de julho. Sem dizer isso, trocar o mês e ver o mesmo saldo
 * pareceria filtro quebrado.
 */
export function FiltroDeCompetencia({
  competencia,
  atual,
}: {
  /** O mês que a tela está mostrando (YYYY-MM). */
  competencia: string
  /** O mês corrente, calculado no servidor com o relógio de São Paulo. */
  atual: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const anterior = competenciaAnterior(atual)

  function ir(mes: string) {
    const novo = new URLSearchParams(params.toString())
    // O mês corrente é o padrão: deixá-lo fora da URL mantém o endereço limpo
    // e faz o link "/financeiro" continuar significando "agora".
    if (mes && mes !== atual) novo.set('competencia', mes)
    else novo.delete('competencia')
    const qs = novo.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const botao = (mes: string, rotulo: string) => {
    const aceso = competencia === mes
    return (
      <button
        key={mes}
        type="button"
        onClick={() => ir(mes)}
        className="font-sans"
        style={{
          height: 28,
          padding: '0 12px',
          borderRadius: 8,
          border: `1px solid ${aceso ? 'rgba(239,209,140,.42)' : 'rgba(255,255,255,.08)'}`,
          background: aceso ? 'rgba(239,209,140,.10)' : 'transparent',
          color: aceso ? TINTA.ouro : 'rgba(242,237,227,.55)',
          fontSize: 11.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {rotulo}
      </button>
    )
  }

  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexWrap: 'wrap',
        padding: '13px 16px',
        border: '1px solid rgba(255,255,255,.065)',
        borderRadius: 14,
        background: 'linear-gradient(168deg, #15141608, #0E0E0F)',
      }}
    >
      <Etiqueta>Competência</Etiqueta>
      {botao(atual, 'Este mês')}
      {botao(anterior, 'Mês passado')}
      <input
        type="month"
        value={competencia}
        max={atual}
        onChange={(e) => ir(e.target.value)}
        className="font-mono"
        style={{
          height: 28,
          padding: '0 10px',
          border: '1px solid rgba(255,255,255,.08)',
          background: 'rgba(255,255,255,.025)',
          borderRadius: 8,
          color: 'rgba(242,237,227,.88)',
          fontSize: 11.5,
          lineHeight: 1,
          outline: 0,
          colorScheme: 'dark',
        }}
      />
      <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.42)' }}>
        {competencia === atual
          ? 'resultado, margem e composição de saídas deste mês'
          : `resultado, margem e composição de saídas de ${competenciaPorExtenso(competencia)} · saldo e projeção continuam sendo os de hoje`}
      </span>
    </section>
  )
}
