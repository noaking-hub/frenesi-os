'use client'

import { useRouter } from 'next/navigation'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import type { Aniversariante } from '@/data/giftback'
import { parseNum, plural } from '@/domain'

import { enviarPresente, importarDaYampi, marcarParabenizado, salvarAniversario } from './actions'

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

const chip = (ativo: boolean): React.CSSProperties => ({
  height: 31,
  padding: '0 13px',
  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
  fontWeight: 600,
  fontSize: 11,
  lineHeight: 1,
  borderRadius: 'var(--radius-pill)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Giftback: quem faz aniversário, quando, e o presente a um clique — cupom
 * único criado na Yampi + e-mail de parabéns da marca. Um presente por
 * aniversário, garantido pelo banco.
 */
export function GiftbackCliente({
  lista,
  comAniversario,
  semAniversario,
  ultimaImportacao,
}: {
  lista: Aniversariante[]
  comAniversario: number
  semAniversario: number
  /** ISO da última importação de aniversários da Yampi; null = nunca. */
  ultimaImportacao: string | null
}) {
  const [recorte, setRecorte] = useState<'30d' | 'todos'>('30d')
  const [busca, setBusca] = useState('')
  const [pct, setPct] = useState('15')
  const [validade, setValidade] = useState('7')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [agindoEm, setAgindoEm] = useState<string | null>(null)
  const [novoEmail, setNovoEmail] = useState('')
  const [novaData, setNovaData] = useState('')
  const [pendente, iniciarTransicao] = useTransition()
  const router = useRouter()

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      lista
        .filter((a) => (recorte === '30d' ? a.diasAte <= 30 : true))
        .filter((a) => !termo || a.nome.toLowerCase().includes(termo) || a.email.toLowerCase().includes(termo)),
    [lista, recorte, termo],
  )

  const hoje = lista.filter((a) => a.diasAte === 0)
  const em7 = lista.filter((a) => a.diasAte <= 7)
  const em30 = lista.filter((a) => a.diasAte <= 30)
  const parabenizados = lista.filter((a) => a.parabenizadoEsteAno)

  const kpis: Kpi[] = [
    {
      label: 'Aniversário hoje',
      valor: String(hoje.length),
      hint: hoje.length ? hoje.map((a) => a.nome.split(' ')[0]).slice(0, 3).join(', ') : 'Ninguém hoje',
      tom: hoje.length ? 'ouro' : 'neutro',
    },
    { label: 'Próximos 7 dias', valor: String(em7.length), hint: 'Contando os de hoje' },
    { label: 'Próximos 30 dias', valor: String(em30.length), hint: 'A lista abaixo' },
    {
      label: 'Parabenizados no ano',
      valor: String(parabenizados.length),
      hint: 'Um presente por aniversário',
      tom: 'ok',
    },
    {
      label: 'Sem data no cadastro',
      valor: String(semAniversario),
      hint: comAniversario ? `${comAniversario} já têm aniversário` : 'Importe da Yampi ou cadastre',
      tom: semAniversario ? 'atencao' : 'ok',
    },
  ]

  const importar = () =>
    iniciarTransicao(async () => {
      setAviso(null)
      const r = await importarDaYampi()
      setAviso(
        r.ok
          ? {
              tom: 'ok',
              texto: r.atualizados
                ? `${plural(r.atualizados, 'aniversário importado', 'aniversários importados')} do cadastro da Yampi (${r.lidos} clientes lidos).`
                : `A Yampi respondeu (${r.lidos} clientes lidos), mas nenhum trazia data de nascimento — cadastre à mão abaixo.`,
            }
          : { tom: 'erro', texto: r.erro },
      )
      if (r.ok) router.refresh()
    })

  // A importação da Yampi roda SOZINHA ao abrir quando a última leitura tem
  // mais de 24 horas (ou nunca houve) — e todo dia no agendador. Sem botão:
  // aniversário esquecido é exatamente o que este módulo existe para evitar.
  const jaDisparou = useRef(false)
  useEffect(() => {
    if (jaDisparou.current) return
    const UM_DIA = 24 * 60 * 60 * 1000
    const velha = !ultimaImportacao || Date.now() - new Date(ultimaImportacao).getTime() > UM_DIA
    if (!velha) return
    jaDisparou.current = true
    importar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimaImportacao])

  const presentear = (a: Aniversariante) =>
    iniciarTransicao(async () => {
      setAviso(null)
      setAgindoEm(a.email)
      const r = await enviarPresente({
        email: a.email,
        nome: a.nome,
        pct: Math.round(parseNum(pct) || 15),
        validadeDias: Math.round(parseNum(validade) || 7),
      })
      setAgindoEm(null)
      setAviso(
        r.ok
          ? { tom: 'ok', texto: `Presente enviado para ${a.nome}: cupom ${r.cupom} por e-mail.` }
          : { tom: 'erro', texto: r.erro },
      )
      if (r.ok) router.refresh()
    })

  const marcar = (a: Aniversariante) =>
    iniciarTransicao(async () => {
      setAviso(null)
      const r = await marcarParabenizado(a.email)
      if (!r.ok) setAviso({ tom: 'erro', texto: r.erro })
      router.refresh()
    })

  const cadastrar = () =>
    iniciarTransicao(async () => {
      setAviso(null)
      const r = await salvarAniversario(novoEmail.trim().toLowerCase(), novaData)
      setAviso(
        r.ok
          ? { tom: 'ok', texto: 'Aniversário cadastrado.' }
          : { tom: 'erro', texto: r.erro },
      )
      if (r.ok) {
        setNovoEmail('')
        setNovaData('')
        router.refresh()
      }
    })

  const wa = (a: Aniversariante) => {
    if (!a.telefone) return null
    const digitos = a.telefone.replace(/\D/g, '')
    if (digitos.length < 10) return null
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos
    const msg = `Feliz aniversário, ${a.nome.split(' ')[0]}! 🥂 Aqui é da FRENESI — hoje o dia é seu, e queremos celebrar junto.`
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
  }

  const colunas: Coluna<Aniversariante>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(150px,1fr)',
      render: (a) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: 'var(--color-corrente)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.nome}
          </span>
          <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.email}
          </span>
        </span>
      ),
    },
    {
      chave: 'quando',
      titulo: 'Aniversário',
      largura: '128px',
      render: (a) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, color: a.diasAte === 0 ? COR.ouro : 'var(--color-corrente)' }}>
            {diaMes(a.aniversario)}
          </span>
          <span className="font-sans" style={{ fontSize: 9.5, color: a.diasAte <= 7 ? COR.atencao : 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
            {a.diasAte === 0 ? 'É HOJE' : `em ${plural(a.diasAte, 'dia', 'dias')}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'situacao',
      titulo: 'Este ano',
      largura: '132px',
      render: (a) =>
        a.parabenizadoEsteAno ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
            <Badge tom="ok">Parabenizado</Badge>
            {a.cupomDoAno && (
              <span className="font-mono" style={{ fontSize: 9, color: 'rgba(239,209,140,.5)' }}>
                {a.cupomDoAno}
              </span>
            )}
          </span>
        ) : (
          <Badge tom={a.diasAte <= 7 ? 'atencao' : 'neutro'}>Aguardando</Badge>
        ),
    },
    {
      chave: 'acao',
      titulo: 'Presentear',
      largura: '218px',
      render: (a) => {
        if (a.parabenizadoEsteAno) {
          return (
            <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.35)' }}>
              presente deste ano já foi
            </span>
          )
        }
        const linkWa = wa(a)
        return (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={pendente}
              onClick={() => presentear(a)}
              className="hover:brightness-[1.07] botao-ouro font-sans"
              style={{ height: 28, padding: '0 11px', fontWeight: 700, fontSize: 10, lineHeight: 1, borderRadius: 7, cursor: pendente ? 'wait' : 'pointer', opacity: pendente && agindoEm !== a.email ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              {pendente && agindoEm === a.email ? 'Enviando…' : 'E-mail + cupom'}
            </button>
            {linkWa && (
              <a href={linkWa} target="_blank" rel="noreferrer" onClick={() => marcar(a)} className="hover:bg-[rgba(92,158,112,.24)] font-sans" style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 11px', background: 'rgba(92,158,112,.14)', color: COR.ok, fontWeight: 600, fontSize: 10, lineHeight: 1, borderRadius: 7, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                WhatsApp
              </a>
            )}
          </span>
        )
      },
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <section className="card-ouro" style={{ borderRadius: 14, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <TituloSecao tamanho={13.5}>Presente de aniversário</TituloSecao>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              Cupom único criado na Yampi (uso único, por CPF, sem acumular) + e-mail de parabéns da
              marca. As datas vêm do cadastro da Yampi sozinhas — ao abrir esta tela e todo dia no
              agendador.
            </span>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 78 }}>
            <Rotulo>%</Rotulo>
            <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 110 }}>
            <Rotulo>Validade (dias)</Rotulo>
            <input value={validade} onChange={(e) => setValidade(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <div style={{ flex: 1 }} />
          {pendente && (
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 11, color: COR.ouro, whiteSpace: 'nowrap' }}>
              Atualizando…
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 220px', maxWidth: 300 }}>
            <Rotulo>Cadastrar à mão — e-mail do cliente</Rotulo>
            <input value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="cliente@email.com" className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 150 }}>
            <Rotulo>Data de nascimento</Rotulo>
            <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="font-mono focus:border-ouro/45" style={campo} />
          </label>
          <BotaoSecundario altura={34} onClick={cadastrar} desabilitado={pendente || !novoEmail.trim() || !novaData}>
            Salvar aniversário
          </BotaoSecundario>
        </div>

        {aviso && (
          <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: aviso.tom === 'ok' ? COR.ok : COR.erro, textWrap: 'pretty' }}>
            {aviso.texto}
          </span>
        )}
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setRecorte('30d')} className="hover:border-ouro/40 font-sans" style={chip(recorte === '30d')}>
          {`Próximos 30 dias · ${em30.length}`}
        </button>
        <button type="button" onClick={() => setRecorte('todos')} className="hover:border-ouro/40 font-sans" style={chip(recorte === 'todos')}>
          {`Todos com data · ${lista.length}`}
        </button>
        <div style={{ flex: 1 }} />
        <label className="focus-within:border-ouro/45" style={{ display: 'flex', alignItems: 'center', gap: 9, width: 280, height: 34, padding: '0 12px', border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.03)', borderRadius: 9 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="font-sans" style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12, lineHeight: 1 }} />
        </label>
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(a) => a.email}
        bandeiraDe={(a) => (a.diasAte === 0 && !a.parabenizadoEsteAno ? 'ouro' : null)}
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              {lista.length === 0
                ? 'Nenhum cliente com aniversário cadastrado ainda — importe da Yampi ou cadastre à mão no cartão acima.'
                : 'Ninguém nesse recorte — troque para "Todos com data" ou limpe a busca.'}
            </span>
          </div>
        }
      />
    </div>
  )
}
