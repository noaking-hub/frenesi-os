'use client'

import { useState, useTransition } from 'react'

import { BotaoOuro, BotaoSecundario, FaixaAlerta, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, competenciasRecentes, nomeDaCompetencia } from '@/domain'
import type { Fechamento } from '@/domain'

import { definirContaContabil, enviarAoEscritorio, gerarFechamento } from './actions'

const campo = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
} as const

interface Props {
  competenciaInicial: string
  emailLigado: boolean
  destinatarioSugerido: string
  categorias: { nome: string; natureza: string; contaContabil: string; valorMes: number }[]
}

/**
 * Fechamento da competência.
 *
 * Gerar e enviar são dois botões, não um. Quem fecha o mês precisa ver quantas
 * linhas vão, quanto de receita, e quais categorias estão sem conta contábil
 * ANTES de o contador receber — conferência que acontece depois do envio não é
 * conferência, é constatação.
 */
export function FechamentoCliente({
  competenciaInicial,
  emailLigado,
  destinatarioSugerido,
  categorias,
}: Props) {
  const [competencia, setCompetencia] = useState(competenciaInicial)
  const [destinatario, setDestinatario] = useState(destinatarioSugerido)
  const [previa, setPrevia] = useState<Fechamento | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [contas, setContas] = useState<Record<string, string>>(
    Object.fromEntries(categorias.map((c) => [c.nome, c.contaContabil])),
  )

  function rodar(acao: () => Promise<void>) {
    setErro(null)
    setRecado(null)
    iniciar(async () => {
      try {
        await acao()
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function baixar() {
    if (!previa) return
    const blob = new Blob([previa.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = previa.arquivo
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <TituloSecao tamanho={14}>Fechar a competência</TituloSecao>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo>Competência</Rotulo>
            <select
              value={competencia}
              onChange={(e) => {
                setCompetencia(e.target.value)
                setPrevia(null)
              }}
              style={campo}
            >
              {competenciasRecentes(12).map((c) => (
                <option key={c} value={c}>
                  {nomeDaCompetencia(c)}
                </option>
              ))}
            </select>
          </span>

          <BotaoOuro
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await gerarFechamento(competencia)
                if (!r.ok) throw new Error(r.erro)
                setPrevia(r.fechamento)
              })
            }
          >
            {pendente ? 'Apurando…' : 'Apurar o mês'}
          </BotaoOuro>

          {previa && previa.registros > 0 && (
            <BotaoSecundario altura={32} onClick={baixar}>
              Baixar CSV
            </BotaoSecundario>
          )}

          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 240 }}>
            <Rotulo>E-mail do escritório</Rotulo>
            <input
              type="email"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              placeholder="contabilidade@escritorio.com.br"
              style={campo}
            />
          </span>

          <BotaoSecundario
            altura={32}
            desabilitado={pendente}
            onClick={() =>
              rodar(async () => {
                const r = await enviarAoEscritorio(competencia, destinatario)
                if (!r.ok) throw new Error(r.erro)
                setRecado(`${r.arquivo} · ${r.registros} registro(s). ${r.detalhe}`)
              })
            }
          >
            {emailLigado ? 'Enviar ao escritório' : 'Registrar envio'}
          </BotaoSecundario>
        </div>

        {!emailLigado && (
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            O envio automático precisa de RESEND_API_KEY e EMAIL_REMETENTE num domínio verificado. Sem
            eles o arquivo é gerado e registrado, mas quem manda o e-mail é você — e a tela diz isso em
            vez de marcar como enviado.
          </span>
        )}
      </section>

      {erro && <FaixaAlerta tom="erro" texto={erro} />}
      {recado && <FaixaAlerta tom="ok" texto={recado} />}

      {previa && (
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <TituloSecao tamanho={14}>{`O que vai no arquivo de ${nomeDaCompetencia(previa.competencia)}`}</TituloSecao>

          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            {[
              { rotulo: 'Registros', valor: String(previa.registros), tom: undefined },
              { rotulo: 'Receita bruta', valor: brl(previa.receita), tom: COR.ok },
              { rotulo: 'Despesas', valor: brl(previa.despesa), tom: COR.erro },
              { rotulo: 'Outras entradas', valor: brl(previa.outrasEntradas), tom: undefined },
              {
                rotulo: 'Resultado',
                valor: brl(previa.resultado),
                tom: previa.resultado >= 0 ? COR.ok : COR.erro,
              },
            ].map((k) => (
              <span key={k.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Rotulo>{k.rotulo}</Rotulo>
                <Valor tamanho={15} tom={k.tom}>
                  {k.valor}
                </Valor>
              </span>
            ))}
          </div>

          {previa.avisos.map((a) => (
            <FaixaAlerta key={a} tom="atencao" texto={a} />
          ))}

          <pre
            className="font-mono"
            style={{
              fontSize: 9.5,
              lineHeight: 1.7,
              color: 'rgba(242,237,227,.5)',
              background: 'rgba(0,0,0,.2)',
              borderRadius: 10,
              padding: 12,
              maxHeight: 220,
              overflow: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {previa.csv.replace('﻿', '').split('\r\n').slice(0, 12).join('\n')}
            {previa.registros > 11 ? `\n… mais ${previa.registros - 11} linha(s)` : ''}
          </pre>
        </section>
      )}

      {/* ── Plano de contas ──────────────────────────────────────────── */}
      <section
        style={{
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '15px 18px',
            borderBottom: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <TituloSecao tamanho={14.5}>Plano de contas por categoria</TituloSecao>
          <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
            É esta amarração que traduz o nosso vocabulário para o do escritório.
          </span>
        </div>

        {categorias.map((c) => (
          <div
            key={c.nome}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(150px,1fr) 122px minmax(240px,1.5fr) 108px 90px',
              gap: 12,
              alignItems: 'center',
              padding: '9px 18px',
              borderTop: '1px solid var(--color-borda-sutil)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--color-corrente)', textWrap: 'pretty' }}
            >
              {c.nome}
            </span>
            <span
              className="font-sans"
              style={{
                fontSize: 10,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                color:
                  c.natureza === 'Custo variável'
                    ? COR.atencao
                    : c.natureza === 'Despesa fixa'
                      ? COR.info
                      : 'rgba(242,237,227,.5)',
                whiteSpace: 'nowrap',
              }}
            >
              {c.natureza}
            </span>
            <input
              value={contas[c.nome] ?? ''}
              onChange={(e) => setContas((v) => ({ ...v, [c.nome]: e.target.value }))}
              placeholder="sem conta contábil"
              style={{ ...campo, height: 28, fontSize: 11, width: '100%' }}
            />
            <Valor tamanho={11.5} style={{ textAlign: 'right' }}>
              {brl(c.valorMes)}
            </Valor>
            <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {(contas[c.nome] ?? '') !== c.contaContabil && (
                <BotaoSecundario
                  altura={26}
                  desabilitado={pendente}
                  onClick={() =>
                    rodar(async () => {
                      const r = await definirContaContabil(c.nome, contas[c.nome] ?? '')
                      if (!r.ok) throw new Error(r.erro)
                      setRecado(`${c.nome} agora lança em "${contas[c.nome] || '—'}".`)
                    })
                  }
                >
                  Salvar
                </BotaoSecundario>
              )}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
