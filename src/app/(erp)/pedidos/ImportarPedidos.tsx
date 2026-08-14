'use client'

import { useRouter } from 'next/navigation'

import { useState, useTransition } from 'react'

import { COR } from '@/components/erp/tokens'
import { plural } from '@/domain'

import {
  conferirYampi,
  diagnosticarShopify,
  importarDaYampi,
  importarPedidos,
  sincronizarEnvios,
} from './actions'

/**
 * Traz as vendas da loja e recalcula o consumo diário a partir delas.
 *
 * A janela de 60 dias não é escolha de produto: sem o escopo `read_all_orders`
 * — que a Shopify concede caso a caso — a API simplesmente não devolve pedido
 * mais antigo, e volta vazio sem erro. Pedir 90 dias pareceria "loja sem
 * vendas" em vez de "permissão faltando".
 */
export function ImportarPedidos({
  configurada,
  total,
  sincronizadoEm,
}: {
  configurada: boolean
  total: number
  /** Última importação da Yampi registrada. Null = nunca. */
  sincronizadoEm: string | null
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [diagnostico, setDiagnostico] = useState<string | null>(null)
  // Quanto histórico trazer. Passou a ser escolha porque o extrato do gateway
  // alcança meses que a importação de 90 dias não cobria, e o pagamento sem
  // pedido correspondente fica órfão na conciliação.
  const [dias, setDias] = useState(90)
  const [ferramentas, setFerramentas] = useState(false)
  const [pendente, iniciarTransicao] = useTransition()

  const router = useRouter()

  /**
   * Um passo da sincronia, pela ROTA e não por Server Action: o Next enfileira
   * actions por aba e segura toda navegação enquanto uma está no ar — uma
   * importação lenta travava o clique em qualquer outro menu.
   *
   * Cada chamada leva UM passo, porque a Netlify mata a função em ~26 s sem
   * devolver nada: a requisição única que fazia tudo morria no meio e o
   * navegador mostrava página de erro. E nenhuma falha estoura daqui — uma
   * exceção solta dentro da transition derrubava a tela inteira, que é pior
   * que a sincronia falhar.
   */
  const chamarPasso = async <T,>(corpo: object): Promise<T | { falha: string }> => {
    try {
      const resposta = await fetch('/api/tela/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      if (!resposta.ok) return { falha: `o servidor respondeu ${resposta.status}` }
      return (await resposta.json()) as T
    } catch {
      return { falha: 'a conexão caiu antes da resposta' }
    }
  }
  const falhou = (r: unknown): r is { falha: string } =>
    typeof r === 'object' && r !== null && 'falha' in r

  const conferirYampiAgora = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await conferirYampi()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDiagnostico(
        `Yampi "${r.alias}" conectada · ${r.pedidos} pedidos. ` +
          `Campos do pedido: ${r.camposDoPedido.join(', ') || '—'}. ` +
          `Cliente: ${r.camposDoCliente.join(', ') || '—'}. ` +
          `Item: ${r.camposDoItem.join(', ') || '—'}. ` +
          `Transação: ${r.camposDaTransacao.join(', ') || '— (nenhuma na amostra)'}. ` +
          // Sem identificador aqui, nenhuma venda vai encontrar o crédito do
          // extrato. Melhor descobrir agora que num fechamento de mês.
          `Id do gateway que consigo ler: ${r.identificadoresDaAmostra.join(', ') || 'NENHUM — a ponte com o extrato não vai funcionar'}.`,
      )
    })

  const diagnosticar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await diagnosticarShopify()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDiagnostico(
        `Token de ${r.loja} tem: ${r.escopos.join(', ') || 'nenhum escopo'}.` +
          (r.faltando.length
            ? ` Falta ${r.faltando.join(', ')} — lançar a versão no dev dashboard não atualiza a instalação: abra o app na loja e aceite as permissões novas, ou reinstale.`
            : ' Está tudo que o ERP precisa.'),
      )
    })

  const importarYampi = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      setDiagnostico(null)
      const resposta = await chamarPasso<{
        importacao: Awaited<ReturnType<typeof importarDaYampi>> | null
      }>({ passo: 'importar', dias })
      router.refresh()
      if (falhou(resposta)) {
        setErro(`A importação não terminou: ${resposta.falha}. Tente de novo — o que já entrou não se perde.`)
        return
      }
      const r = resposta.importacao
      if (!r || !r.ok) {
        setErro(r ? r.erro : 'A importação não respondeu.')
        return
      }
      const {
        pedidos,
        itens,
        clientes,
        entregues,
        itensSemVariante,
        casadosPorSku,
        transacoes,
        pedidosSemTransacao,
        extratoLigado,
        desde,
        basesComConsumo,
        removidosShopify,
      } = r.resultado
      setResumo(
        `${plural(pedidos, 'pedido', 'pedidos')} da Yampi desde ${desde} · ${plural(itens, 'item', 'itens')} · ` +
          `${plural(clientes, 'cliente com CPF', 'clientes com CPF')} · ${plural(entregues, 'entrega marcada', 'entregas marcadas')} · ` +
          `${plural(casadosPorSku, 'item casado por SKU', 'itens casados por SKU')} · ` +
          `${plural(transacoes, 'transação de pagamento', 'transações de pagamento')} · ` +
          `consumo recalculado em ${plural(basesComConsumo, 'base', 'bases')}.` +
          (extratoLigado
            ? ` ${plural(extratoLigado, 'movimento do extrato encontrou a venda', 'movimentos do extrato encontraram a venda')} pelo id da transação.`
            : '') +
          (removidosShopify
            ? ` ${plural(removidosShopify, 'pedido espelho da Shopify removido', 'pedidos espelho da Shopify removidos')} — as mesmas vendas contariam duas vezes.`
            : ''),
      )
      if (pedidosSemTransacao) {
        // Pedido pago sem transação é uma venda que o extrato nunca vai
        // achar: ela vai ficar na fila "entrada sem pedido" para sempre, e
        // saber disso agora é o que permite investigar antes de virar rotina.
        setAviso(
          `${plural(pedidosSemTransacao, 'pedido pago veio', 'pedidos pagos vieram')} sem transação de pagamento. ` +
            'Esses créditos no extrato não vão encontrar a venda sozinhos — pode ser pagamento por fora do gateway ou uma permissão a menos na chave da Yampi.',
        )
      } else if (itensSemVariante) {
        setAviso(
          `${plural(itensSemVariante, 'item não casou', 'itens não casaram')} com nenhuma variante pelo SKU. ` +
            'Reimporte o catálogo da Shopify primeiro: é ele que grava o SKU de cada variante, e sem isso não há por onde ligar.',
        )
      }
    })

  /**
   * O botão único: importa os pedidos novos e espelha os envios, nessa ordem.
   *
   * Um clique, duas pontas — e no dia a dia nem ele é preciso: a rotina de
   * hora em hora faz o mesmo no servidor. O botão existe para quem acabou de
   * fechar uma venda e quer ver agora, sem esperar a virada da hora.
   */
  const sincronizarTudo = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setAviso(null)
      setDiagnostico(null)
      const tropecos: string[] = []

      // Passo 1 — entregas locais: a loja conta o que o motoboy entregou.
      setResumo('Passo 1 de 3 · conferindo entregas locais na Shopify…')
      const locais = await chamarPasso<{
        entregasLocais: {
          entregues?: number
          datasRepostas?: number
          mlConsumido?: number
          erro?: string
        } | null
      }>({ passo: 'locais' })
      const entregasLocais = falhou(locais) ? null : locais.entregasLocais
      if (falhou(locais)) tropecos.push(`entregas locais: ${locais.falha}`)
      else if (entregasLocais?.erro) tropecos.push(`entregas locais: ${entregasLocais.erro}`)

      // Passo 2 — os pedidos novos da Yampi, que trazem CPF e pagamento.
      setResumo('Passo 2 de 3 · importando pedidos da Yampi…')
      const imp = await chamarPasso<{
        importacao: Awaited<ReturnType<typeof importarDaYampi>> | null
      }>({ passo: 'importar', dias: 10 })
      const r = falhou(imp) ? null : imp.importacao
      if (falhou(imp)) tropecos.push(`importação: ${imp.falha}`)
      else if (r && !r.ok) tropecos.push(`importação: ${r.erro}`)

      // Passo 3 — espelho de envios. A fila pode ter acumulado centenas de
      // pedidos; cada rodada leva o que cabe no tempo de uma função e diz
      // quantos sobraram — daí o laço, com teto para não prender a tela.
      let enviados = 0
      let entregues = 0
      let naFila = 0
      for (let rodada = 1; rodada <= 8; rodada++) {
        setResumo(
          rodada === 1
            ? 'Passo 3 de 3 · espelhando envios na Shopify…'
            : `Passo 3 de 3 · espelhando envios na Shopify — ${naFila} na fila…`,
        )
        const passo = await chamarPasso<{
          envios: Awaited<ReturnType<typeof sincronizarEnvios>> | null
        }>({ passo: 'envios' })
        if (falhou(passo)) {
          tropecos.push(`espelho de envios: ${passo.falha}`)
          break
        }
        const e = passo.envios
        if (!e || !e.ok) {
          tropecos.push(`espelho de envios: ${e ? e.erro : 'sem resposta'}`)
          break
        }
        enviados += e.enviados
        entregues += e.entregues
        naFila = e.naFila
        if (naFila === 0) break
      }

      router.refresh()

      const partes = [
        r?.ok ? `${plural(r.resultado.pedidos, 'pedido conferido', 'pedidos conferidos')} na Yampi` : null,
        r?.ok && r.resultado.extratoLigado
          ? `${r.resultado.extratoLigado} movimento(s) do extrato ligados à venda`
          : null,
        enviados ? `${plural(enviados, 'envio espelhado', 'envios espelhados')} na Shopify` : null,
        entregues ? `${plural(entregues, 'entrega marcada', 'entregas marcadas')} na loja` : null,
        // A ponta inversa: entrega de motoboy marcada na LOJA fecha aqui.
        entregasLocais?.entregues
          ? `${plural(entregasLocais.entregues, 'entrega local confirmada', 'entregas locais confirmadas')} pela Shopify` +
            (entregasLocais.mlConsumido
              ? ` (${entregasLocais.mlConsumido.toFixed(1).replace('.', ',')} ml baixados)`
              : '')
          : null,
        entregasLocais?.datasRepostas
          ? `${plural(entregasLocais.datasRepostas, 'data de entrega reposta', 'datas de entrega repostas')} pela loja`
          : null,
      ].filter(Boolean)
      setResumo(
        (partes.length ? partes.join(' · ') : 'Sincronizado — nada de novo desta vez') +
          (naFila > 0 ? ` · ${naFila} envio(s) ainda na fila — clique de novo para continuar` : '') +
          '.',
      )
      if (tropecos.length) {
        setErro(`A sincronia tropeçou em: ${tropecos.join('; ')}. O que aparece acima foi concluído.`)
      }
      if (r?.ok && r.resultado.pedidosSemTransacao) {
        setAviso(
          `${plural(r.resultado.pedidosSemTransacao, 'pedido pago sem transação', 'pedidos pagos sem transação')} de pagamento — esses créditos não acham a venda sozinhos.`,
        )
      }
    })

  const sincronizar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      setDiagnostico(null)
      // Com orçamento de tempo: a fila pode ter centenas de pedidos, e uma
      // Server Action cortada pela Netlify derruba a tela sem explicação.
      const r = await sincronizarEnvios({ prazoMs: 14_000 })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResumo(
        r.enviados === 0 && r.ignorados.length === 0 && r.naFila === 0
          ? 'Nenhum pedido novo para espelhar: todos os que têm rastreio já estão fechados na Shopify.'
          : `${plural(r.enviados, 'pedido marcado como enviado', 'pedidos marcados como enviados')} na Shopify, com o rastreio na conta do cliente` +
            (r.entregues ? ` · ${plural(r.entregues, 'entrega confirmada', 'entregas confirmadas')}` : '') +
            (r.fechados ? ` · ${plural(r.fechados, 'pedido fechado', 'pedidos fechados')} e fora da fila de abertos` : '') +
            (r.naFila ? ` · ${r.naFila} ainda na fila — clique de novo para continuar` : '') +
            '. Quem avisa o cliente continua sendo a Yampi — a Shopify não manda nada.',
      )
      if (r.ignorados.length) {
        setAviso(
          `${plural(r.ignorados.length, 'pedido não foi espelhado', 'pedidos não foram espelhados')}: ` +
            r.ignorados
              .slice(0, 3)
              .map((i) => `${i.pedido} (${i.motivo})`)
              .join('; ') +
            (r.ignorados.length > 3 ? `; e mais ${r.ignorados.length - 3}.` : '.'),
        )
      }
    })

  const importar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setAviso(null)
      const r = await importarPedidos(60)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      const {
        pedidos,
        itens,
        clientes,
        itensSemVariante,
        desde,
        basesComConsumo,
        semDadosDeCliente,
        casadosPorNome,
      } = r.resultado
      setResumo(
        `${plural(pedidos, 'pedido', 'pedidos')} desde ${desde} · ${plural(itens, 'item', 'itens')} · ` +
          `${plural(clientes, 'cliente', 'clientes')} · consumo diário recalculado em ${plural(basesComConsumo, 'base', 'bases')}.` +
          (casadosPorNome
            ? ` ${plural(casadosPorNome, 'item casou', 'itens casaram')} pelo nome do perfume — o id da variante mudou na loja desde a venda.`
            : ''),
      )
      const avisos: string[] = []
      if (semDadosDeCliente) {
        avisos.push(
          'A loja não liberou os dados protegidos de cliente, então vieram valores e itens, mas não nome, e-mail nem endereço. ' +
            'Para liberar: no app da Shopify, peça acesso a "protected customer data" e reimporte — o CRM depende disso.',
        )
      }
      if (itensSemVariante) {
        avisos.push(
          `${plural(itensSemVariante, 'item não casou', 'itens não casaram')} com nenhuma variante do ERP. ` +
            'Eles aparecem no pedido, mas não baixam estoque de ninguém — importe o catálogo antes dos pedidos para casar tudo.',
        )
      }
      setAviso(avisos.length ? avisos.join(' ') : null)
    })

  if (!configurada) {
    return (
      <div
        style={{
          padding: '13px 15px',
          borderRadius: 12,
          background: 'rgba(224,168,74,.07)',
          border: '1px solid rgba(224,168,74,.28)',
        }}
      >
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          A Shopify não está configurada — sem isso não há de onde trazer pedidos. Preencha
          SHOPIFY_LOJA e as credenciais no <code>.env.local</code>.
        </span>
      </div>
    )
  }

  // A faixa é UMA linha discreta, não um banner: no mockup a sincronia vive no
  // rodapé do menu ("Sincronizado agora") — aqui ela ocupa o mínimo que ainda
  // deixa o botão manual e as ferramentas de diagnóstico alcançáveis.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          minHeight: 30,
        }}
      >
        <span
          className="font-sans"
          style={{ fontSize: 11, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 999,
              marginRight: 7,
              verticalAlign: 'middle',
              background: sincronizadoEm ? COR.ok : COR.atencao,
            }}
          />
          {total === 0
            ? 'Nenhum pedido no ERP ainda — a Yampi é o checkout, e é dela que vêm CPF e pagamento.'
            : `${plural(total, 'pedido no ERP', 'pedidos no ERP')} · ${idadeDaSincronia(sincronizadoEm)}`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setFerramentas((v) => !v)}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            fontSize: 10,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'rgba(242,237,227,.4)',
            cursor: 'pointer',
          }}
        >
          {ferramentas ? '− Ferramentas' : '+ Ferramentas'}
        </button>
        <button
          type="button"
          onClick={sincronizarTudo}
          disabled={pendente}
          className="font-sans hover:brightness-110"
          style={{
            height: 30,
            padding: '0 13px',
            fontWeight: 600,
            fontSize: 11,
            lineHeight: 1,
            borderRadius: 8,
            border: '1px solid rgba(239,209,140,.45)',
            background: 'rgba(239,209,140,.1)',
            color: COR.ouro,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'wait' : 'pointer',
            opacity: pendente ? 0.6 : 1,
          }}
        >
          {pendente ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {/* Resumo e erro convivem: a sincronia agora é por passos, e "o passo 2
          falhou" não apaga o que os passos 1 e 3 concluíram. */}
      {resumo && (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.5, color: COR.ok, textWrap: 'pretty' }}
        >
          {resumo}
        </span>
      )}
      {erro && (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
        >
          {erro}
        </span>
      )}
      {diagnostico && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.75)', textWrap: 'pretty' }}
        >
          {diagnostico}
        </span>
      )}
      {aviso && (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
        >
          {aviso}
        </span>
      )}

      {ferramentas && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              disabled={pendente}
              aria-label="Quanto histórico importar"
              style={{
                height: 32,
                padding: '0 10px',
                border: '1px solid rgba(255,255,255,.11)',
                background: 'rgba(255,255,255,.03)',
                borderRadius: 9,
                color: 'var(--color-corrente)',
                fontSize: 11,
                outline: 0,
              }}
            >
              {[90, 180, 270, 365].map((d) => (
                <option key={d} value={d}>
                  {`últimos ${d} dias`}
                </option>
              ))}
            </select>
            <BotaoFerramenta rotulo="Importar histórico" onClick={importarYampi} pendente={pendente} />
            <BotaoFerramenta rotulo="Espelhar envios" onClick={sincronizar} pendente={pendente} />
            <BotaoFerramenta rotulo="Conferir Yampi" onClick={conferirYampiAgora} pendente={pendente} />
            <BotaoFerramenta rotulo="Conferir permissões" onClick={diagnosticar} pendente={pendente} />
            <BotaoFerramenta rotulo="Importar da Shopify" onClick={importar} pendente={pendente} />
          </div>
      )}
    </div>
  )
}


function BotaoFerramenta({
  rotulo,
  onClick,
  pendente,
}: {
  rotulo: string
  onClick: () => void
  pendente: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pendente}
      className="font-sans hover:border-ouro/40 hover:text-ouro"
      style={{
        height: 32,
        padding: '0 12px',
        border: '1px solid rgba(255,255,255,.11)',
        background: 'transparent',
        color: 'var(--color-secundario)',
        fontWeight: 600,
        fontSize: 11,
        lineHeight: 1,
        borderRadius: 9,
        whiteSpace: 'nowrap',
        cursor: pendente ? 'wait' : 'pointer',
      }}
    >
      {rotulo}
    </button>
  )
}


/**
 * Há quanto tempo a Yampi foi lida.
 *
 * Substitui a sincronia que disparava ao abrir a tela. Ela existia para manter
 * o dado fresco sem depender de alguém clicar — mas o preço era a tela nascer
 * carregando, com os números mudando debaixo do olho de quem estava lendo. A
 * rotina de hora em hora já faz esse trabalho no servidor; o que faltava aqui
 * era DIZER quando foi a última vez, para a operação decidir se precisa do
 * botão.
 *
 * Sem essa frase, "os dados estão velhos?" só teria uma resposta: sincronizar
 * de novo — que é justamente o que a tela fazia sozinha.
 */
function idadeDaSincronia(iso: string | null): string {
  if (!iso) return 'nunca sincronizado com a Yampi'
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (!Number.isFinite(min) || min < 0) return 'sincronia em dia'
  if (min < 2) return 'sincronizado agora'
  if (min < 60) return `sincronizado há ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `sincronizado há ${plural(horas, 'hora', 'horas')}`
  return `sincronizado há ${plural(Math.floor(horas / 24), 'dia', 'dias')}`
}
