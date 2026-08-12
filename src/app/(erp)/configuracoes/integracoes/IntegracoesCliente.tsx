'use client'

import { useState, useTransition } from 'react'

import { Badge, BotaoSecundario, FaixaAlerta, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { EstadoIntegracao } from '@/data/integracoes'

import { testarIntegracao } from './actions'

function quando(iso: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const minutos = Math.round((Date.now() - t) / 60_000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 48) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} dias`
}

/**
 * Painel de integrações.
 *
 * Cada cartão responde duas perguntas verificáveis: a credencial existe? e
 * quando foi a última vez que isto produziu alguma coisa? O botão de teste
 * chama o serviço de verdade e mostra o que ele respondeu — escopos, contagens,
 * nomes de campo —, porque o que trava uma integração quase nunca é a conexão.
 */
export function IntegracoesCliente({
  integracoes,
  conectado = false,
  avisoMelhorEnvio,
}: {
  integracoes: EstadoIntegracao[]
  /** O Melhor Envio já foi autorizado por alguém neste navegador ou noutro. */
  conectado?: boolean
  /** Resultado da volta do OAuth, quando a pessoa acabou de autorizar. */
  avisoMelhorEnvio?: 'conectado' | 'falhou' | 'estado-invalido'
}) {
  const [saida, setSaida] = useState<{ id: string; linhas: string[]; erro: boolean } | null>(null)
  const [pendente, iniciar] = useTransition()
  const [testando, setTestando] = useState<string | null>(null)

  function testar(id: string) {
    setTestando(id)
    setSaida(null)
    iniciar(async () => {
      const r = await testarIntegracao(id)
      setSaida(r.ok ? { id, linhas: r.linhas, erro: false } : { id, linhas: [r.erro], erro: true })
      setTestando(null)
    })
  }

  const faltando = integracoes.filter((i) => !i.configurada)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {faltando.length > 0 && (
        <FaixaAlerta
          tom="atencao"
          texto={`${faltando.length} integração(ões) sem credencial completa: ${faltando
            .map((i) => i.nome)
            .join(', ')}. As telas que dependem delas continuam funcionando, mas com o que já está no banco.`}
        />
      )}

      {avisoMelhorEnvio && (
        <FaixaAlerta
          tom={avisoMelhorEnvio === 'conectado' ? 'ok' : 'erro'}
          texto={
            avisoMelhorEnvio === 'conectado'
              ? 'Melhor Envio conectado. A próxima varredura de rastreio já inclui os envios dele.'
              : avisoMelhorEnvio === 'estado-invalido'
                ? 'A autorização voltou sem bater com o pedido original — comece de novo pelo botão Conectar.'
                : 'O Melhor Envio recusou a autorização. Confira client id, secret e a URL de redirecionamento cadastrada lá.'
          }
        />
      )}

      <TituloSecao tamanho={16}>O que está ligado</TituloSecao>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
        {integracoes.map((i) => (
          <section
            key={i.id}
            style={{
              background: 'var(--color-mesa)',
              border: `1px solid ${i.configurada ? 'rgba(92,158,112,.22)' : 'var(--color-borda)'}`,
              borderRadius: 'var(--radius-card)',
              padding: '15px 17px',
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
              <span
                aria-hidden
                className="font-display"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(239,209,140,.08)',
                  border: '1px solid var(--color-borda-ouro)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11.5,
                  color: 'var(--color-ouro)',
                  flex: 'none',
                }}
              >
                {i.sigla}
              </span>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Valor tamanho={13}>{i.nome}</Valor>
                  <Badge tom={i.configurada ? 'ok' : 'atencao'}>
                    {i.configurada ? 'Credencial presente' : 'Sem credencial'}
                  </Badge>
                  <span
                    className="font-sans"
                    style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-terciario)' }}
                  >
                    {i.papel}
                  </span>
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                >
                  {i.detalhe}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.4)' }}>
                {`${i.atividade}: ${quando(i.ultimaAtividade)}`}
              </span>
              <div style={{ flex: 1 }} />
              {i.testavel && (
                <BotaoSecundario
                  altura={28}
                  desabilitado={pendente || !i.configurada}
                  onClick={() => testar(i.id)}
                >
                  {testando === i.id ? 'Testando…' : 'Testar conexão'}
                </BotaoSecundario>
              )}
              {/* OAuth não se resolve com variável de ambiente: alguém precisa
                  autorizar no navegador, uma vez. O link leva à rota que
                  começa a conversa com o Melhor Envio. */}
              {i.id === 'melhorenvio' && i.configurada && (
                <a
                  href="/api/melhorenvio/autorizar"
                  className="font-sans hover:brightness-110"
                  style={{
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 13px',
                    borderRadius: 8,
                    border: `1px solid ${conectado ? 'rgba(255,255,255,.14)' : 'rgba(239,209,140,.45)'}`,
                    background: conectado ? 'transparent' : 'rgba(239,209,140,.1)',
                    color: conectado ? 'var(--color-secundario)' : COR.ouro,
                    fontWeight: 600,
                    fontSize: 11,
                    textDecoration: 'none',
                  }}
                >
                  {conectado ? 'Reconectar' : 'Conectar'}
                </a>
              )}
            </div>

            {i.faltando.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {i.faltando.map((f) => (
                  <span
                    key={f}
                    className="font-mono"
                    style={{ fontSize: 9.5, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
                  >
                    {`falta ${f}`}
                  </span>
                ))}
              </div>
            )}

            {saida?.id === i.id && (
              <pre
                className="font-mono"
                style={{
                  fontSize: 9.5,
                  lineHeight: 1.65,
                  color: saida.erro ? COR.erro : 'rgba(242,237,227,.55)',
                  background: 'rgba(0,0,0,.2)',
                  borderRadius: 9,
                  padding: 11,
                  maxHeight: 240,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}
              >
                {saida.linhas.join('\n')}
              </pre>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
