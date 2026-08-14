'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, Rotulo, Switch, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { volume } from '@/domain'
import type { PerfumeBase } from '@/domain'

import { criarPerfumeBase, salvarPerfumeBase } from './actions'

const GENEROS: PerfumeBase['genero'][] = ['Masculino', 'Feminino', 'Unissex']

export function EditorPerfume({ base, aoFechar }: { base: PerfumeBase; aoFechar: () => void }) {
  const [genero, setGenero] = useState<PerfumeBase['genero'] | null>(base.genero ?? null)
  const [custoTexto, setCustoTexto] = useState(base.custoPorMl ? String(base.custoPorMl).replace('.', ',') : '')
  const [consumoTexto, setConsumoTexto] = useState(
    base.consumoDiarioMl ? String(base.consumoDiarioMl).replace('.', ',') : '',
  )
  const [ativo, setAtivo] = useState(base.ativo !== false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const numero = (t: string) => {
    const n = parseFloat(t.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await salvarPerfumeBase({
        id: base.id,
        genero,
        custoPorMl: numero(custoTexto),
        consumoDiarioMl: numero(consumoTexto),
        ativo,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const campo = {
    height: 38,
    padding: '0 12px',
    border: '1px solid rgba(255,255,255,.11)',
    background: 'rgba(255,255,255,.03)',
    borderRadius: 9,
    color: 'var(--color-corrente)',
    fontSize: 12.5,
    lineHeight: 1,
    outline: 0,
    width: '100%',
  } as const

  return (
    <Modal titulo={`Editar ${base.nome}`} aoFechar={aoFechar}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {base.imagemUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={base.imagemUrl}
              alt=""
              style={{ width: 52, height: 66, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-borda)', flex: 'none' }}
            />
          )}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
            <TituloSecao tamanho={15}>{base.nome}</TituloSecao>
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
              {base.marca}
            </span>
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Nome, marca e imagem vêm da Shopify — para mudar, edite na loja e reimporte o
              catálogo.
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Gênero</Rotulo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[...GENEROS, null].map((g) => {
              const escolhido = genero === g
              return (
                <button
                  key={g ?? 'nenhum'}
                  type="button"
                  onClick={() => setGenero(g)}
                  className="hover:border-ouro/40 font-sans"
                  style={{
                    height: 32,
                    padding: '0 14px',
                    border: `1px solid ${escolhido ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                    background: escolhido ? 'rgba(239,209,140,.09)' : 'transparent',
                    color: escolhido ? COR.ouro : 'rgba(242,237,227,.65)',
                    fontWeight: 600,
                    fontSize: 11.5,
                    lineHeight: 1,
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {g ?? 'Não informado'}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Rotulo>Custo por ml (R$)</Rotulo>
            <input
              value={custoTexto}
              onChange={(e) => setCustoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder="0,00"
              className="font-mono"
              style={campo}
            />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Normalmente vem das compras (Estoque → Lotes). Ajuste aqui só para corrigir — não
              gera lote nem movimentação.
            </span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Rotulo>Consumo diário (ml)</Rotulo>
            <input
              value={consumoTexto}
              onChange={(e) => setConsumoTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className="font-mono"
              style={campo}
            />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
              Base do cálculo de cobertura (&ldquo;acaba em X dias&rdquo;). Será derivado das vendas
              quando os pedidos forem integrados.
            </span>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 14px',
            borderRadius: 10,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}>
              Perfume ativo
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
              Desativado, sai do estoque, da produção e da sincronia — sem apagar o histórico. Use
              para os perfumes que você não fraciona.
            </span>
          </span>
          <Switch ligado={ativo} onChange={setAtivo} label={ativo ? 'Desativar perfume' : 'Ativar perfume'} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            padding: '11px 13px',
            borderRadius: 10,
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.06)',
          }}
        >
          <Rotulo>Volume em estoque</Rotulo>
          <Valor tamanho={13} tom={base.volumeMl === 0 ? 'erro' : 'ouro'}>
            {volume(base.volumeMl)}
          </Valor>
          <span className="font-sans" style={{ flex: 1, fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', textWrap: 'pretty' }}>
            Não se edita aqui: muda por compra, produção ou inventário — cada uma com seu
            lançamento na trilha.
          </span>
        </div>

        {erro && (
          <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
            {erro}
          </span>
        )}

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <BotaoSecundario altura={36} onClick={aoFechar}>
            Cancelar
          </BotaoSecundario>
          <button
            type="button"
            onClick={salvar}
            disabled={pendente}
            className="botao-ouro font-sans hover:brightness-[1.07]"
            style={{
              height: 36,
              padding: '0 18px',
              fontWeight: 700,
              fontSize: 11.5,
              lineHeight: 1,
              borderRadius: 9,
              cursor: pendente ? 'wait' : 'pointer',
              opacity: pendente ? 0.6 : 1,
            }}
          >
            {pendente ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
    </Modal>
  )
}

/**
 * Cadastro de base fora da Shopify — frasco comprado avulso, amostra,
 * exclusivo que não está na loja.
 *
 * Não pergunta volume nem custo de propósito: quem os define é a compra do
 * frasco, em Estoque → Lotes. Digitar volume aqui criaria estoque sem lote, e
 * a conciliação apontaria divergência já no primeiro dia.
 */
export function CriadorPerfume({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [marca, setMarca] = useState('')
  const [genero, setGenero] = useState<PerfumeBase['genero'] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const campo = {
    height: 38,
    padding: '0 12px',
    border: '1px solid rgba(255,255,255,.11)',
    background: 'rgba(255,255,255,.03)',
    borderRadius: 9,
    color: 'var(--color-corrente)',
    fontSize: 12.5,
    lineHeight: 1,
    outline: 0,
    width: '100%',
  } as const

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await criarPerfumeBase({ nome, marca, genero })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo="Novo perfume base" largura={520} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>Cadastro manual</Rotulo>
        <TituloSecao tamanho={15}>Novo perfume base</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          Para o que não vem da Shopify. Se o perfume já está na loja, prefira reimportar o
          catálogo — assim ele nasce com imagem e com as variantes ligadas.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Nome</Rotulo>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Libre Intense"
            autoFocus
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Marca</Rotulo>
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            placeholder="Yves Saint Laurent"
            className="font-sans focus:border-ouro/45"
            style={campo}
          />
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Gênero</Rotulo>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...GENEROS, null].map((g) => {
            const escolhido = genero === g
            return (
              <button
                key={g ?? 'nenhum'}
                type="button"
                onClick={() => setGenero(g)}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 32,
                  padding: '0 14px',
                  border: `1px solid ${escolhido ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: escolhido ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: escolhido ? COR.ouro : 'rgba(242,237,227,.65)',
                  fontWeight: 600,
                  fontSize: 11.5,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {g ?? 'Não informado'}
              </button>
            )
          })}
        </div>
      </div>

      <span
        className="font-sans"
        style={{
          fontSize: 10.5,
          lineHeight: 1.5,
          color: 'var(--color-terciario)',
          textWrap: 'pretty',
          padding: '11px 13px',
          borderRadius: 10,
          background: 'rgba(255,255,255,.028)',
          border: '1px solid var(--color-borda)',
        }}
      >
        Nasce com volume e custo zerados. Os dois entram juntos na primeira compra do frasco, em
        Estoque → Lotes — é de lá que sai o custo por ml que a Precificação usa.
      </span>

      {erro && (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
        >
          {erro}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <button
          type="button"
          onClick={salvar}
          disabled={pendente || !nome.trim() || !marca.trim()}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 36,
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            cursor: pendente ? 'wait' : 'pointer',
            opacity: pendente || !nome.trim() || !marca.trim() ? 0.5 : 1,
          }}
        >
          {pendente ? 'Cadastrando…' : 'Cadastrar perfume'}
        </button>
      </div>
    </Modal>
  )
}
