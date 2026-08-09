'use client'

import { useState, useTransition } from 'react'

import { BotaoSecundario, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import { ROTULO_EVENTO, plural } from '@/domain'
import type { EventoNotificacao } from '@/domain'

import { definirRemetente, dispararAvisos } from './actions'

export interface LinhaRegra {
  evento: EventoNotificacao
  remetente: 'yampi' | 'erp' | 'ninguem'
  assunto: string
}

export interface LinhaLog {
  chave: string
  pedidoId: string | null
  evento: string
  destinatario: string
  estado: 'enviando' | 'enviado' | 'falhou' | 'dispensado'
  motivo: string
  quando: string
}

const DONOS: { valor: LinhaRegra['remetente']; rotulo: string; explica: string }[] = [
  { valor: 'yampi', rotulo: 'Yampi', explica: 'A Yampi manda. O ERP não envia nada deste evento.' },
  { valor: 'erp', rotulo: 'ERP', explica: 'O ERP manda. Desligue este aviso na Yampi antes.' },
  { valor: 'ninguem', rotulo: 'Ninguém', explica: 'Nenhum aviso sai para o cliente.' },
]

const TOM_ESTADO: Record<LinhaLog['estado'], string> = {
  enviado: COR.ok,
  falhou: COR.erro,
  dispensado: 'var(--color-terciario)',
  enviando: COR.atencao,
}

/**
 * Quem manda cada aviso.
 *
 * O ponto da tela é impedir o e-mail em dobro. Dois remetentes ligados para o
 * mesmo fato é o erro que o cliente percebe na hora — e ele desconfia mais do
 * segundo aviso que do primeiro.
 */
export function RemetenteCliente({ regras, log }: { regras: LinhaRegra[]; log: LinhaLog[] }) {
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const doErp = regras.filter((r) => r.remetente === 'erp').length

  const trocar = (evento: string, remetente: LinhaRegra['remetente']) =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      const r = await definirRemetente(evento, remetente)
      if (!r.ok) setErro(r.erro)
    })

  const disparar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      const r = await dispararAvisos(50)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResumo(
        `${plural(r.enviados, 'aviso enviado', 'avisos enviados')}` +
          (r.dispensados
            ? ` · ${plural(r.dispensados, 'dispensado', 'dispensados')} por ser fato antigo`
            : '') +
          (r.falhas.length ? ` · ${plural(r.falhas.length, 'falha', 'falhas')}` : '') +
          (r.aguardando ? ` · ${r.aguardando} ainda com a Yampi` : '') +
          '.',
      )
    })

  const colunasRegra: Coluna<LinhaRegra>[] = [
    {
      chave: 'evento',
      titulo: 'Aviso',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}
          >
            {ROTULO_EVENTO[r.evento] ?? r.evento}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.3, color: 'var(--color-terciario)' }}
          >
            {r.assunto}
          </span>
        </span>
      ),
    },
    {
      chave: 'remetente',
      titulo: 'Quem manda',
      largura: '260px',
      render: (r) => (
        <span style={{ display: 'flex', gap: 6 }}>
          {DONOS.map((d) => {
            const ativo = r.remetente === d.valor
            return (
              <button
                key={d.valor}
                type="button"
                title={d.explica}
                onClick={() => trocar(r.evento, d.valor)}
                disabled={pendente}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 28,
                  padding: '0 12px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 10.5,
                  lineHeight: 1,
                  borderRadius: 7,
                  cursor: pendente ? 'wait' : 'pointer',
                }}
              >
                {d.rotulo}
              </button>
            )
          })}
        </span>
      ),
    },
  ]

  const colunasLog: Coluna<LinhaLog>[] = [
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '108px',
      render: (l) => (
        <Valor tamanho={11} peso={400} tom="var(--color-terciario)">
          {l.quando}
        </Valor>
      ),
    },
    {
      chave: 'evento',
      titulo: 'Aviso',
      largura: '176px',
      render: (l) => (
        <span
          className="font-sans"
          style={{ display: 'block', fontSize: 11.5, color: 'var(--color-corrente)' }}
        >
          {ROTULO_EVENTO[l.evento as EventoNotificacao] ?? l.evento}
        </span>
      ),
    },
    {
      chave: 'destinatario',
      titulo: 'Para',
      largura: 'minmax(0,1fr)',
      render: (l) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'rgba(242,237,227,.66)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {l.destinatario}
        </span>
      ),
    },
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '104px',
      render: (l) => (
        <Valor tamanho={11} tom="ouro">
          {l.pedidoId ?? '—'}
        </Valor>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '180px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 10.5, color: TOM_ESTADO[l.estado] }}
          >
            {l.estado}
          </span>
          {l.motivo && (
            <span
              className="font-sans"
              style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              {l.motivo}
            </span>
          )}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '15px 17px',
          borderRadius: 13,
          background: 'rgba(239,209,140,.045)',
          border: '1px solid var(--color-borda-ouro)',
        }}
      >
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <TituloSecao tamanho={14}>Quem avisa o cliente</TituloSecao>
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
          >
            Cada aviso tem um dono. Antes de passar um para o ERP, desligue o mesmo aviso na Yampi:
            dois remetentes ligados para o mesmo fato dão dois e-mails ao cliente, e ele desconfia
            mais do segundo que do primeiro.
            {doErp === 0
              ? ' Nenhum aviso está no ERP ainda — a Yampi continua mandando tudo.'
              : ` ${plural(doErp, 'aviso está no ERP', 'avisos estão no ERP')}.`}
          </span>
          {(erro || resumo) && (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
            >
              {erro ?? resumo}
            </span>
          )}
        </span>
        <BotaoSecundario altura={36} onClick={disparar}>
          {pendente ? 'Enviando…' : 'Enviar avisos pendentes'}
        </BotaoSecundario>
      </div>

      <Tabela colunas={colunasRegra} itens={regras} chaveDe={(r) => r.evento} />

      <TituloSecao tamanho={15}>Últimos avisos</TituloSecao>
      <Tabela
        colunas={colunasLog}
        itens={log}
        chaveDe={(l) => l.chave}
        bandeiraDe={(l) => (l.estado === 'falhou' ? 'erro' : null)}
        vazio={
          <div style={{ padding: '26px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum aviso enviado pelo ERP ainda.
            </span>
          </div>
        }
      />
    </div>
  )
}
