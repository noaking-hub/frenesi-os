'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { Losango, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { plural } from '@/domain'

import { importarCatalogo } from './actions'
import type { RespostaImportacao } from './actions'

interface Props {
  configurada: boolean
  /** Última sincronização registrada no banco, se houver. */
  ultima: { executadaEm: string; perfumes: number; variantes: number; ignorados: number } | null
}

/** Catálogo com mais de 12 h é importado de novo ao abrir a tela. */
const VALIDADE_CATALOGO_H = 12

/**
 * Painel de importação do catálogo da Shopify. Quando as credenciais não
 * estão no ambiente, explica exatamente o que configurar — sem botão morto.
 *
 * Ao abrir com o catálogo velho, importa sozinho: nome, preço e variante
 * mudam na loja sem avisar o ERP, e quem esquece de clicar não descobre que
 * esqueceu.
 */
export function ImportarShopify({ configurada, ultima }: Props) {
  const [pendente, iniciarTransicao] = useTransition()
  const [resposta, setResposta] = useState<RespostaImportacao | null>(null)

  const executar = () =>
    iniciarTransicao(async () => {
      setResposta(await importarCatalogo())
    })

  // O ref impede o loop: a importação revalida a rota, o server component
  // renderiza de novo com props novas, e sem a trava o efeito rodaria de novo.
  const jaTentou = useRef(false)
  useEffect(() => {
    if (jaTentou.current || !configurada) return
    const idadeH = ultima
      ? (Date.now() - new Date(ultima.executadaEm).getTime()) / 3_600_000
      : Infinity
    if (idadeH < VALIDADE_CATALOGO_H) return
    jaTentou.current = true
    executar()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez, ao abrir
  }, [])

  const quandoUltima = ultima
    ? new Date(ultima.executadaEm).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <section
      style={{
        background: 'linear-gradient(160deg,#16141A,#101011)',
        border: '1px solid rgba(239,209,140,.16)',
        borderRadius: 16,
        padding: '17px 19px',
        display: 'flex',
        flexDirection: 'column',
        gap: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Losango />
        <TituloSecao tamanho={15} tom="ouro">
          Catálogo da Shopify
        </TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          A loja é a fonte de nome, marca, variantes, preço e quantidade publicada. Custo por ml e
          volume em estoque continuam sendo do ERP — a importação nunca os sobrescreve.
        </span>
        <div style={{ flex: 1 }} />
        {configurada ? (
          <button
            type="button"
            onClick={executar}
            disabled={pendente}
            className="botao-ouro font-sans hover:brightness-[1.07]"
            style={{
              height: 34,
              padding: '0 15px',
              fontWeight: 700,
              fontSize: 11.5,
              lineHeight: 1,
              borderRadius: 8,
              cursor: pendente ? 'wait' : 'pointer',
              opacity: pendente ? 0.6 : 1,
              whiteSpace: 'nowrap',
              boxShadow: 'var(--shadow-ouro)',
            }}
          >
            {pendente ? 'Importando…' : 'Importar catálogo agora'}
          </button>
        ) : null}
      </div>

      {quandoUltima && !resposta && (
        <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(239,209,140,.6)' }}>
          {`Última importação ${quandoUltima} · ${plural(ultima!.perfumes, 'perfume', 'perfumes')} · ${plural(ultima!.variantes, 'variante', 'variantes')}${ultima!.ignorados ? ` · ${ultima!.ignorados} ignorados` : ''}`}
        </span>
      )}

      {!configurada && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '13px 14px',
            borderRadius: 11,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.09)',
          }}
        >
          <Rotulo>Para conectar</Rotulo>
          <ol
            className="font-sans"
            style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.7, color: 'rgba(242,237,227,.7)' }}
          >
            <li>
              Crie um app para a loja (Configurações → Apps e canais de venda → Desenvolver apps)
              com os escopos <code>read_products</code> e <code>read_inventory</code>, e lance a
              versão instalada na loja.
            </li>
            <li>
              <strong>App no dev dashboard novo:</strong> copie o &ldquo;ID do cliente&rdquo; e a
              &ldquo;Chave secreta&rdquo; (<code>shpss_…</code>) para{' '}
              <code>SHOPIFY_CLIENT_ID</code> e <code>SHOPIFY_CLIENT_SECRET</code> — o ERP troca
              por um token de acesso sozinho. <strong>App legado:</strong> copie o Admin API
              access token (<code>shpat_…</code>) para <code>SHOPIFY_ADMIN_TOKEN</code>.
            </li>
            <li>
              Adicione também <code>SHOPIFY_LOJA=sua-loja.myshopify.com</code> no{' '}
              <code>.env.local</code> e reinicie o servidor.
            </li>
          </ol>
        </div>
      )}

      {resposta && !resposta.ok && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 13px',
            borderRadius: 10,
            background: 'rgba(194,90,80,.08)',
            border: '1px solid rgba(194,90,80,.3)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.85)', textWrap: 'pretty' }}>
            {resposta.erro}
          </span>
        </div>
      )}

      {resposta && resposta.ok && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 13px',
              borderRadius: 10,
              background: 'rgba(92,158,112,.08)',
              border: '1px solid rgba(92,158,112,.28)',
            }}
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: COR.ok, flex: 'none' }} />
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.85)', textWrap: 'pretty' }}>
              {`Catálogo importado: ${plural(resposta.resultado.perfumesNovos, 'perfume novo', 'perfumes novos')}, ${resposta.resultado.perfumesAtualizados} atualizados, ${plural(resposta.resultado.variantes, 'variante', 'variantes')}.`}
              {resposta.resultado.perfumesNovos > 0 &&
                ' Perfumes novos entram com custo e volume zerados — complete o cadastro para o preço e a cobertura saírem certos.'}
            </span>
          </div>

          {resposta.resultado.ignorados.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                padding: '12px 13px',
                borderRadius: 10,
                background: 'rgba(217,140,63,.06)',
                border: '1px solid rgba(217,140,63,.2)',
              }}
            >
              <Rotulo style={{ color: COR.atencao }}>
                {`${plural(resposta.resultado.ignorados.length, 'item ignorado', 'itens ignorados')} — com o motivo`}
              </Rotulo>
              {resposta.resultado.ignorados.slice(0, 8).map((i, n) => (
                <span key={n} className="font-sans" style={{ fontSize: 11, lineHeight: 1.45, color: 'rgba(242,237,227,.62)', textWrap: 'pretty' }}>
                  {`${i.produto}${i.variante ? ` · ${i.variante}` : ''} — ${i.motivo}`}
                </span>
              ))}
              {resposta.resultado.ignorados.length > 8 && (
                <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                  {`+ ${resposta.resultado.ignorados.length - 8} itens no registro da sincronização`}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
