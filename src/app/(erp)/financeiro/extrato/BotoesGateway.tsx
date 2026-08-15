'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import { Ico, TINTA, type NomeIcone } from '@/components/erp/ui'
import { INICIO_DA_OPERACAO, dataEmSaoPaulo } from '@/domain'

import type { atualizarExtrato } from './actions'
import { classificarRecebimentos, recasarExtrato, relerGateway } from './actions'

/**
 * Os três botões do painel de importação. Todos chamam ações que existem —
 * botão que não faz nada não entra na tela.
 *
 * "Trazer extrato" vai por rota HTTP, não por Server Action: o Next enfileira
 * actions por aba e segura toda navegação enquanto uma está no ar. Uma
 * importação leva minutos quando o relatório fica pronto, e clicar em outro
 * menu no meio dela travava o ERP inteiro.
 */

/**
 * Hoje em São Paulo, não em UTC.
 *
 * Das 21h à meia-noite, `toISOString()` já devolve o dia seguinte — e o
 * Mercado Pago recusa relatório que termina amanhã.
 */
function hoje(): string {
  return dataEmSaoPaulo(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
}

/**
 * 15 em 15 segundos por até 6 minutos. O relatório costuma ficar pronto em
 * menos de um minuto; o teto existe para a tela parar de perguntar sozinha se
 * a pessoa esquecer a aba aberta.
 */
const ESPERA_MS = 15_000
const MAX_ESPERAS = 24

export function BotoesGateway({ ligado, contaMp }: { ligado: boolean; contaMp: string }) {
  const router = useRouter()
  const [relatorio, setRelatorio] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [trazendo, setTrazendo] = useState(false)
  // Zero é "não está esperando". Acima disso, é a vez da espera — mudar o
  // número é o que agenda a próxima consulta ao Mercado Pago.
  const [espera, setEspera] = useState(0)
  const [pendente, iniciar] = useTransition()

  const trazer = useCallback(
    async (pedir: boolean) => {
      setErro(null)
      setTrazendo(true)
      try {
        const resposta = await fetch('/api/tela/extrato', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ de: INICIO_DA_OPERACAO, ate: hoje(), pedir }),
        })
        const r = (await resposta.json()) as Awaited<ReturnType<typeof atualizarExtrato>>
        if (!r.ok) {
          setErro(r.erro)
          setEspera(0)
          return
        }
        setRelatorio(r.linhas)
        if (r.estado === 'pronto') {
          setEspera(0)
          // A rota não revalida a árvore como uma action faria; o refresh traz
          // as linhas recém-importadas para a fila.
          router.refresh()
        } else {
          setEspera((n) => n + 1)
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
        setEspera(0)
      } finally {
        setTrazendo(false)
      }
    },
    [router],
  )

  // Enquanto o Mercado Pago monta o relatório, a tela pergunta sozinha se
  // ficou pronto — com `pedir` falso, para não gerar outro relatório a cada
  // consulta.
  useEffect(() => {
    if (espera === 0) return
    if (espera > MAX_ESPERAS) {
      setRelatorio([
        'O Mercado Pago está demorando mais que o comum para montar o extrato.',
        'O pedido fica registrado: a próxima atualização importa o arquivo sem pedir de novo.',
      ])
      setEspera(0)
      return
    }
    const t = setTimeout(() => void trazer(false), ESPERA_MS)
    return () => clearTimeout(t)
  }, [espera, trazer])

  function rodar(acao: () => Promise<string[] | null>) {
    setErro(null)
    setRelatorio(null)
    iniciar(async () => {
      try {
        const linhas = await acao()
        if (linhas) setRelatorio(linhas)
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const ocupado = trazendo || espera > 0 || pendente

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 196 }}>
      <Botao
        primario
        icone="importar"
        desabilitado={ocupado || !ligado}
        onClick={() => void trazer(true)}
      >
        {espera > 0
          ? `Aguardando o gateway… (${espera}/${MAX_ESPERAS})`
          : trazendo
            ? 'Trazendo extrato…'
            : 'Trazer extrato'}
      </Botao>

      <Botao
        icone="atualizar"
        desabilitado={ocupado || !ligado}
        onClick={() =>
          rodar(async () => {
            // Reler existe porque a importação é idempotente: quando a LEITURA
            // estava errada, sincronizar de novo não conserta nada.
            if (
              !window.confirm(
                'Apagar as linhas do Mercado Pago que ainda não viraram lançamento e ler o período de novo?\n\nO que já foi classificado ou dispensado é preservado.',
              )
            ) {
              return null
            }
            const r = await relerGateway(INICIO_DA_OPERACAO, hoje())
            if (!r.ok) throw new Error(r.erro)
            return [
              `${r.apagadas} linha(s) antigas apagadas.`,
              `${r.resultado.lidos} pagamento(s) relidos · ${r.resultado.repassesConciliados} repasse(s) atualizados.`,
              ...r.resultado.avisos.map((a) => `Atenção: ${a}`),
            ]
          })
        }
      >
        Reprocessar leitura
      </Botao>

      <Botao
        icone="faisca"
        desabilitado={pendente}
        onClick={() =>
          rodar(async () => {
            // Duas etapas que já existem, na ordem certa: primeiro religar as
            // linhas órfãs aos pedidos, depois classificar em lote os créditos
            // de venda que ficaram casados.
            const casou = await recasarExtrato()
            if (!casou.ok) throw new Error(casou.erro)
            const feito = await classificarRecebimentos(contaMp)
            if (!feito.ok) throw new Error(feito.erro)
            return [
              `${casou.porTransacao} linha(s) ligadas pelo id da transação da Yampi.`,
              `${casou.religadas} ligada(s) por valor e data.`,
              `${feito.feitas} crédito(s) de venda classificados em lote.`,
              casou.restantes
                ? `${casou.restantes} entrada(s) seguem sem pedido — importe os pedidos da Yampi para a ligação exata.`
                : 'Nenhuma linha ficou órfã.',
            ]
          })
        }
      >
        Reclassificar automático
      </Botao>

      {!ligado && (
        <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.45, color: TINTA.atencao }}>
          Falta MERCADOPAGO_ACCESS_TOKEN no ambiente.
        </span>
      )}

      {espera > 0 && (
        <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.5, color: TINTA.atencao, textWrap: 'pretty' }}>
          O Mercado Pago está montando o extrato — pode deixar a tela aberta: ela importa sozinha
          assim que ficar pronto.
        </span>
      )}

      {erro && (
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: TINTA.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}

      {relatorio && (
        <pre
          className="font-mono"
          style={{
            margin: 0,
            maxWidth: 320,
            maxHeight: 140,
            overflowY: 'auto',
            fontSize: 9.5,
            lineHeight: 1.6,
            color: 'rgba(242,237,227,.55)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {relatorio.join('\n')}
        </pre>
      )}
    </div>
  )
}

function Botao({
  children,
  onClick,
  primario,
  desabilitado,
  icone,
}: {
  children: React.ReactNode
  onClick: () => void
  primario?: boolean
  desabilitado?: boolean
  icone?: NomeIcone
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className={
        primario
          ? 'botao-ouro font-sans hover:brightness-[1.06]'
          : 'font-sans hover:border-ouro/40 hover:text-ouro'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 34,
        padding: '0 14px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.55 : 1,
        ...(primario
          ? { border: 0, boxShadow: 'var(--shadow-ouro)' }
          : {
              border: '1px solid rgba(255,255,255,.09)',
              background: 'rgba(255,255,255,.025)',
              color: 'var(--color-secundario)',
            }),
      }}
    >
      {icone && <Ico n={icone} tamanho={15} />}
      {children}
    </button>
  )
}
