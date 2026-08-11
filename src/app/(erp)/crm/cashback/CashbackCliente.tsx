'use client'

import { useRouter } from 'next/navigation'

import { useMemo, useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Modal } from '@/components/erp/Modal'
import { Badge, BotaoOuro, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { CarteiraCashback, RegraCashback } from '@/data/cashback'
import { brl, parseNum, plural } from '@/domain'

import { gerarCreditos, lancarMovimento, salvarRegra } from './actions'

const campo: React.CSSProperties = {
  height: 34,
  padding: '0 11px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--color-corrente)',
  fontSize: 12,
  borderRadius: 8,
  outline: 'none',
}

const dataBr = (iso: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '—'

/**
 * O caixa do cashback: regra, créditos gerados dos pedidos pagos, resgates
 * e o saldo vivo de cada cliente — com extrato completo ao clicar.
 */
export function CashbackCliente({
  regra,
  carteiras,
}: {
  regra: RegraCashback
  carteiras: CarteiraCashback[]
}) {
  const [pct, setPct] = useState(String(regra.pct).replace('.', ','))
  const [validade, setValidade] = useState(String(regra.validadeDias))
  const [ativo, setAtivo] = useState(regra.ativo)
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [lancando, setLancando] = useState<CarteiraCashback | null>(null)
  const [pendente, iniciarTransicao] = useTransition()
  const router = useRouter()

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      carteiras.filter(
        (c) => !termo || c.nome.toLowerCase().includes(termo) || c.email.toLowerCase().includes(termo),
      ),
    [carteiras, termo],
  )
  const carteiraSel = carteiras.find((c) => c.email === selecionado) ?? null

  const saldoTotal = carteiras.reduce((a, c) => a + c.saldo, 0)
  const expirando = carteiras.reduce((a, c) => a + c.expirando30, 0)
  const creditado = carteiras.reduce((a, c) => a + c.creditado, 0)
  const resgatado = carteiras.reduce((a, c) => a + c.resgatado, 0)
  const comSaldo = carteiras.filter((c) => c.saldo > 0).length

  const kpis: Kpi[] = [
    {
      label: 'Saldo em aberto',
      valor: brl(saldoTotal),
      hint: `${plural(comSaldo, 'cliente com saldo', 'clientes com saldo')}`,
      tom: 'ouro',
    },
    {
      label: 'A expirar em 30 dias',
      valor: brl(expirando),
      hint: expirando > 0 ? 'Bom motivo para uma mensagem' : 'Nada vencendo agora',
      tom: expirando > 0 ? 'atencao' : 'ok',
    },
    { label: 'Creditado até hoje', valor: brl(creditado), hint: 'Somando todos os clientes' },
    { label: 'Resgatado', valor: brl(resgatado), hint: 'Descontos já concedidos' },
    {
      label: 'Regra em uso',
      valor: regra.ativo ? `${regra.pct}%` : 'Desligada',
      hint: regra.ativo ? `créditos valem ${regra.validadeDias} dias` : 'Ative para creditar',
      tom: regra.ativo ? 'ok' : 'neutro',
    },
  ]

  const salvar = () =>
    iniciarTransicao(async () => {
      setAviso(null)
      const r = await salvarRegra({ pct: parseNum(pct), validadeDias: Math.round(parseNum(validade)), ativo })
      setAviso(r.ok ? { tom: 'ok', texto: 'Regra salva.' } : { tom: 'erro', texto: r.erro })
      if (r.ok) router.refresh()
    })

  const gerar = () =>
    iniciarTransicao(async () => {
      setAviso(null)
      const r = await gerarCreditos()
      setAviso(
        r.ok
          ? {
              tom: 'ok',
              texto: r.gerados
                ? `${plural(r.gerados, 'crédito gerado', 'créditos gerados')} · ${brl(r.valor)} entraram nos saldos.`
                : 'Nenhum pedido novo para creditar — tudo já estava no livro.',
            }
          : { tom: 'erro', texto: r.erro },
      )
      if (r.ok) router.refresh()
    })

  const colunas: Coluna<CarteiraCashback>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(150px,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nome}
          </span>
          <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.email}
          </span>
        </span>
      ),
    },
    {
      chave: 'creditado',
      titulo: 'Creditado',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.6)', whiteSpace: 'nowrap' }}>
          {brl(c.creditado)}
        </span>
      ),
    },
    {
      chave: 'resgatado',
      titulo: 'Resgatado',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.6)', whiteSpace: 'nowrap' }}>
          {c.resgatado ? brl(c.resgatado) : '—'}
        </span>
      ),
    },
    {
      chave: 'saldo',
      titulo: 'Saldo',
      largura: '112px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={13} tom={c.saldo > 0 ? 'ouro' : 'rgba(242,237,227,.35)'}>
          {brl(c.saldo)}
        </Valor>
      ),
    },
    {
      chave: 'vencimento',
      titulo: 'Próximo vencimento',
      largura: '132px',
      alinhamento: 'right',
      render: (c) =>
        c.saldo > 0 && c.proximoVencimento ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.6)' }}>
              {dataBr(c.proximoVencimento)}
            </span>
            {c.expirando30 > 0 && (
              <span className="font-sans" style={{ fontSize: 9.5, color: COR.atencao, whiteSpace: 'nowrap' }}>
                {`${brl(c.expirando30)} em 30 dias`}
              </span>
            )}
          </span>
        ) : (
          <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }}>
            —
          </span>
        ),
    },
    {
      chave: 'acao',
      titulo: 'Ações',
      largura: '96px',
      render: (c) => (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            setLancando(c)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            e.stopPropagation()
            setLancando(c)
          }}
          className="font-sans hover:bg-[rgba(239,209,140,.12)]"
          style={{
            fontWeight: 600,
            fontSize: 9.5,
            color: 'var(--color-ouro)',
            border: '1px solid rgba(239,209,140,.26)',
            borderRadius: 6,
            padding: '5px 8px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          Lançar resgate
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 110 }}>
            <Rotulo>% por pedido pago</Rotulo>
            <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 110 }}>
            <Rotulo>Validade (dias)</Rotulo>
            <input value={validade} onChange={(e) => setValidade(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label className="font-sans" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, fontSize: 12, color: 'var(--color-corrente)', cursor: 'pointer' }}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Cashback ligado
          </label>
          <BotaoSecundario altura={34} onClick={salvar} desabilitado={pendente}>
            Salvar regra
          </BotaoSecundario>
          <div style={{ flex: 1 }} />
          <BotaoOuro altura={36} onClick={gerar} desabilitado={pendente}>
            {pendente ? 'Processando…' : 'Gerar créditos dos pedidos pagos'}
          </BotaoOuro>
        </div>
        <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.38)', textWrap: 'pretty' }}>
          Gerar créditos é seguro de repetir: cada pedido credita UMA vez, garantido pelo banco. O
          resgate é manual — quando o cliente usar o saldo (num desconto ou cupom que você conceder),
          lance aqui para o livro continuar batendo.
        </span>
        {aviso && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: aviso.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}>
            {aviso.texto}
          </span>
        )}
      </section>

      <label className="focus-within:border-ouro/45" style={{ display: 'flex', alignItems: 'center', gap: 9, maxWidth: 440, height: 38, padding: '0 14px', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.03)', borderRadius: 9 }}>
        <span aria-hidden style={{ width: 11, height: 11, border: '1.4px solid rgba(242,237,227,.4)', borderRadius: '50%', flex: 'none' }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="font-sans" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }} />
      </label>

      <div className="empilha-1180" style={{ display: 'grid', gridTemplateColumns: carteiraSel ? 'minmax(0,1fr) 330px' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <Tabela
          colunas={colunas}
          itens={visiveis}
          chaveDe={(c) => c.email}
          aoClicar={(c) => setSelecionado((atual) => (atual === c.email ? null : c.email))}
          selecionadoDe={(c) => c.email === selecionado}
          bandeiraDe={(c) => (c.expirando30 > 0 ? 'atencao' : null)}
          vazio={
            <div style={{ padding: '28px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Nenhum lançamento ainda — ligue a regra e gere os créditos dos pedidos pagos.
              </span>
            </div>
          }
          rodape={
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {`${visiveis.length} de ${plural(carteiras.length, 'cliente no livro', 'clientes no livro')} · clique para abrir o extrato`}
              </span>
            </div>
          }
        />

        {carteiraSel && (
          <section className="card-ouro" style={{ borderRadius: 16, padding: '18px 19px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                <TituloSecao tamanho={14}>{carteiraSel.nome}</TituloSecao>
                <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.45)', wordBreak: 'break-all' }}>
                  {carteiraSel.email}
                </span>
              </span>
              <button type="button" onClick={() => setSelecionado(null)} aria-label="Fechar extrato" className="font-sans hover:brightness-150" style={{ border: 0, background: 'transparent', color: 'rgba(242,237,227,.4)', fontSize: 14, cursor: 'pointer', padding: 2 }}>
                ×
              </button>
            </div>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <Valor tamanho={19} tom="ouro">{brl(carteiraSel.saldo)}</Valor>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                saldo disponível
              </span>
            </span>
            <Rotulo>{`Extrato · ${plural(carteiraSel.lancamentos.length, 'lançamento', 'lançamentos')}`}</Rotulo>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {carteiraSel.lancamentos.map((l) => (
                <span key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.028)', border: '1px solid rgba(255,255,255,.06)' }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.45)' }}>
                      {dataBr(l.criadoEm)}
                    </span>
                    <Valor tamanho={11.5} tom={l.vencido ? 'rgba(242,237,227,.35)' : l.valor >= 0 ? 'ok' : 'erro'}>
                      {`${l.valor >= 0 ? '+' : '−'} ${brl(Math.abs(l.valor))}`}
                    </Valor>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Badge tom={l.vencido ? 'neutro' : l.tipo === 'credito' ? 'ok' : l.tipo === 'resgate' ? 'erro' : 'info'}>
                      {l.vencido ? 'Expirado' : l.tipo === 'credito' ? 'Crédito' : l.tipo === 'resgate' ? 'Resgate' : 'Ajuste'}
                    </Badge>
                    <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.35, color: 'rgba(242,237,227,.5)', textWrap: 'pretty' }}>
                      {l.descricao ?? l.pedidoId ?? ''}
                      {!l.vencido && l.expiraEm ? ` · vence ${dataBr(l.expiraEm)}` : ''}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {lancando && (
        <LancarModal carteira={lancando} aoFechar={() => setLancando(null)} />
      )}
    </div>
  )
}

/** Resgate (desconta do saldo) ou ajuste a favor — sempre com descrição. */
function LancarModal({ carteira, aoFechar }: { carteira: CarteiraCashback; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<'resgate' | 'ajuste'>('resgate')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()
  const router = useRouter()

  const n = parseNum(valor)
  const excede = tipo === 'resgate' && n > carteira.saldo

  const confirmar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await lancarMovimento({
        email: carteira.email,
        nome: carteira.nome,
        valor: tipo === 'resgate' ? -n : n,
        descricao,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
      router.refresh()
    })

  return (
    <Modal titulo={`Lançar no cashback de ${carteira.nome}`} largura={460} aoFechar={aoFechar}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(
          [
            ['resgate', 'Resgate (desconta do saldo)'],
            ['ajuste', 'Ajuste a favor (credita)'],
          ] as const
        ).map(([chave, rotulo]) => {
          const ativo = tipo === chave
          return (
            <button key={chave} type="button" onClick={() => setTipo(chave)} className="hover:border-ouro/40 font-sans" style={{ height: 32, padding: '0 12px', border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`, background: ativo ? 'rgba(239,209,140,.09)' : 'transparent', color: ativo ? COR.ouro : 'rgba(242,237,227,.6)', fontWeight: 600, fontSize: 10.5, lineHeight: 1, borderRadius: 8, cursor: 'pointer' }}>
              {rotulo}
            </button>
          )
        })}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Rotulo>{`Valor (saldo atual: ${brl(carteira.saldo)})`}</Rotulo>
        <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" autoFocus className="font-mono focus:border-ouro/45" style={{ ...campo, height: 38 }} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Rotulo>Descrição (o porquê fica no extrato)</Rotulo>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex.: desconto concedido no pedido YP-1234" className="font-sans focus:border-ouro/45" style={{ ...campo, height: 38 }} />
      </label>
      {(erro || excede) && (
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro ?? `O resgate passa do saldo disponível de ${brl(carteira.saldo)}.`}
        </span>
      )}
      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={confirmar} desabilitado={pendente || !(n > 0) || excede || !descricao.trim()}>
          {pendente ? 'Lançando…' : 'Lançar'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}
