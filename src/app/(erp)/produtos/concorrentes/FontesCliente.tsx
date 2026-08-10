'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, EstadoVazio, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { ROTULO_FONTE, brl, parseNum, plural } from '@/domain'
import type { FonteConcorrente, PerfumeBase, StatusFonte, VarianteMl } from '@/domain'

import {
  adicionarConcorrente,
  diagnosticarConcorrente,
  ensinarApelido,
  lancarPrecoManual,
  recasarPendentes,
  removerConcorrente,
  vascularPrecos,
  type ResumoColeta,
} from './actions'

const TOM_FONTE: Record<StatusFonte, Tom> = {
  nunca: 'neutro',
  lida: 'ok',
  parcial: 'atencao',
  bloqueada: 'erro',
  manual: 'info',
}

const PLATAFORMAS: { valor: 'nuvemshop' | 'shopify' | 'manual'; rotulo: string; explica: string }[] = [
  {
    valor: 'nuvemshop',
    rotulo: 'Nuvemshop',
    explica: 'Lê o sitemap da loja e o preço no JSON-LD de cada produto.',
  },
  {
    valor: 'shopify',
    rotulo: 'Shopify',
    explica: 'Lê /products.json, o endpoint público de catálogo.',
  },
  {
    valor: 'manual',
    rotulo: 'Só manual',
    explica: 'Nada é lido sozinho; os preços são digitados. Funciona em qualquer loja.',
  },
]

export interface TituloSemDono {
  titulo: string
  fonte: string
  preco: number
  variante: number | null
}

interface Props {
  fontes: FonteConcorrente[]
  bases: PerfumeBase[]
  semDono: TituloSemDono[]
  variantes: readonly VarianteMl[]
}

/**
 * Fontes de preço de concorrente.
 *
 * A tela inteira existe para uma decisão: mudar ou não o preço de venda. Por
 * isso ela precisa dizer, sem rodeio, de onde cada preço veio e o que falhou —
 * card verde para leitura que não aconteceu é o pior resultado possível aqui.
 */
export function FontesCliente({ fontes, bases, semDono, variantes }: Props) {
  const [adicionando, setAdicionando] = useState(false)
  const [lancando, setLancando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<ResumoColeta[] | null>(null)
  const [diagnostico, setDiagnostico] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const automaticas = fontes.filter((f) => f.coleta !== 'manual')

  const vascular = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setDiagnostico(null)
      const r = await vascularPrecos()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setResumo(r.resumo)
    })

  const diagnosticar = (f: FonteConcorrente) =>
    iniciarTransicao(async () => {
      setErro(null)
      setResumo(null)
      setDiagnostico(null)
      const r = await diagnosticarConcorrente(f.dominio, f.coleta)
      if (!r.ok) {
        setErro(`${f.nome}: ${r.erro}`)
        return
      }
      const d = r.diagnostico
      setDiagnostico(
        [
          `${f.nome} · ${d.estrategia}`,
          ...d.passos.map((p) => `${p.passo}: ${p.resultado}`),
          d.amostra.length
            ? `amostra: ${d.amostra.map((a) => `${a.titulo} = ${brl(a.preco)}${a.variante ? ` (${a.variante} ml)` : ' (sem ml)'}`).join(' | ')}`
            : 'amostra: nada extraído',
          `resposta: ${d.bruto}`,
        ].join('\n'),
      )
    })

  const recasar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await recasarPendentes()
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setDiagnostico(`${plural(r.casados, 'título casado', 'títulos casados')} com o catálogo.`)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={15}>Fontes de preço</TituloSecao>
        <div style={{ flex: 1 }} />
        {semDono.length > 0 && (
          <BotaoSecundario altura={34} onClick={recasar}>
            {`Tentar casar ${semDono.length} sem dono`}
          </BotaoSecundario>
        )}
        <BotaoSecundario altura={34} onClick={() => setLancando(true)}>
          Lançar preço à mão
        </BotaoSecundario>
        <BotaoSecundario altura={34} onClick={() => setAdicionando(true)}>
          + Adicionar concorrente
        </BotaoSecundario>
        <BotaoOuro altura={34} onClick={vascular}>
          {pendente ? 'Vasculhando…' : `Vasculhar ${plural(automaticas.length, 'loja', 'lojas')}`}
        </BotaoOuro>
      </div>

      {fontes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum concorrente monitorado"
          instrucao="Cadastre a loja de um concorrente para o ERP comparar preços. Sem isso, a recomendação de preço sai só do seu custo e da sua margem alvo."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {fontes.map((f) => {
            const tom = TOM_FONTE[f.status]
            return (
              <div
                key={f.id}
                style={{
                  background: 'linear-gradient(150deg,#16151A,#101011)',
                  border: `1px solid ${COR[tom] === COR.neutro ? 'var(--color-borda)' : `${COR[tom]}44`}`,
                  borderRadius: 'var(--radius-card)',
                  padding: '15px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    className="font-sans"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 600,
                      fontSize: 12.5,
                      lineHeight: 1.25,
                      color: 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {f.nome}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 600,
                      fontSize: 9,
                      lineHeight: 1,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: COR[tom],
                      border: `1px solid ${COR[tom]}`,
                      borderRadius: 'var(--radius-pill)',
                      padding: '3px 7px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ROTULO_FONTE[f.status]}
                  </span>
                </div>

                <span
                  className="font-mono"
                  style={{
                    display: 'block',
                    fontSize: 10.5,
                    lineHeight: 1.2,
                    color: 'rgba(239,209,140,.6)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.dominio}
                </span>

                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    className="font-sans"
                    style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--color-secundario)' }}
                  >
                    {f.itensLidos ? `${f.itensLidos} preços lidos` : 'Nenhum preço lido'}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.35)' }}>
                    {f.quando || 'nunca'}
                  </span>
                </span>

                {/* O motivo cru da falha, sem tradução que perca informação. */}
                <span
                  className="font-sans"
                  style={{
                    fontSize: 10,
                    lineHeight: 1.4,
                    color: f.erro ? COR.erro : 'var(--color-terciario)',
                    textWrap: 'pretty',
                  }}
                >
                  {f.erro ??
                    (f.coleta === 'manual'
                      ? 'Leitura manual · preços digitados'
                      : `Leitura por ${f.coleta} · roda quando você vasculhar`)}
                </span>

                <span style={{ display: 'flex', gap: 7, marginTop: 2 }}>
                  {f.coleta !== 'manual' && (
                    <BotaoSecundario altura={28} onClick={() => diagnosticar(f)}>
                      Diagnosticar
                    </BotaoSecundario>
                  )}
                  <BotaoSecundario
                    altura={28}
                    onClick={() =>
                      iniciarTransicao(async () => {
                        const r = await removerConcorrente(f.id)
                        if (!r.ok) setErro(r.erro)
                      })
                    }
                  >
                    Remover
                  </BotaoSecundario>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {erro && (
        <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}

      {resumo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {resumo.map((r) => (
            <span
              key={r.fonte}
              className="font-sans"
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: r.erro ? COR.erro : COR.ok,
                textWrap: 'pretty',
              }}
            >
              {r.erro
                ? `${r.fonte}: ${r.erro}`
                : `${r.fonte}: ${r.lidos} preços lidos, ${r.casados} casados com o catálogo${r.casados < r.lidos ? ` · ${r.lidos - r.casados} sem dono` : ''}.`}
            </span>
          ))}
        </div>
      )}

      {diagnostico && (
        <pre
          className="font-mono"
          style={{
            margin: 0,
            padding: '13px 15px',
            maxHeight: 260,
            overflow: 'auto',
            borderRadius: 11,
            border: '1px solid var(--color-borda)',
            background: 'rgba(255,255,255,.02)',
            color: 'rgba(242,237,227,.72)',
            fontSize: 10.5,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {diagnostico}
        </pre>
      )}

      {semDono.length > 0 && <SemDono itens={semDono} bases={bases} />}

      {adicionando && <NovoConcorrente aoFechar={() => setAdicionando(false)} />}
      {lancando && (
        <PrecoManual
          fontes={fontes}
          bases={bases}
          variantes={variantes}
          aoFechar={() => setLancando(false)}
        />
      )}
    </div>
  )
}

/**
 * Títulos que a leitura trouxe e o casamento automático recusou.
 *
 * Ficam visíveis de propósito. Esconder o não casado faria a comparação
 * parecer completa quando falta metade — e é sobre essa comparação que o preço
 * de venda vai ser decidido.
 */
function SemDono({ itens, bases }: { itens: TituloSemDono[]; bases: PerfumeBase[] }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 17px',
        borderRadius: 13,
        background: 'rgba(224,168,74,.05)',
        border: '1px solid rgba(224,168,74,.24)',
      }}
    >
      <TituloSecao tamanho={14}>{`${itens.length} preços sem dono`}</TituloSecao>
      <span
        className="font-sans"
        style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
      >
        O ERP leu estes títulos mas não teve certeza de qual perfume do seu catálogo eles são — e
        preferiu não chutar: um preço casado com o perfume errado empurra o preço de venda de
        OUTRO produto. Diga qual é e ele aprende para as próximas leituras.
      </span>

      {erro && (
        <span className="font-sans" style={{ fontSize: 11, color: COR.erro }}>
          {erro}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
        {itens.slice(0, 40).map((i) => (
          <div
            key={`${i.fonte}-${i.titulo}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 88px 220px',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span
                className="font-sans"
                style={{
                  display: 'block',
                  fontSize: 11.5,
                  lineHeight: 1.3,
                  color: 'var(--color-corrente)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {i.titulo}
              </span>
              <span className="font-sans" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.32)' }}>
                {`${i.fonte}${i.variante ? ` · ${i.variante} ml` : ' · sem ml reconhecível'}`}
              </span>
            </span>

            <Valor tamanho={11.5} tom="var(--color-secundario)" style={{ display: 'block', textAlign: 'right' }}>
              {brl(i.preco)}
            </Valor>

            <select
              defaultValue=""
              disabled={pendente}
              aria-label={`Perfume correspondente a ${i.titulo}`}
              onChange={(e) => {
                const baseId = e.target.value
                if (!baseId) return
                iniciarTransicao(async () => {
                  setErro(null)
                  const r = await ensinarApelido(i.titulo, baseId)
                  if (!r.ok) setErro(r.erro)
                })
              }}
              className="font-sans"
              style={{
                height: 30,
                padding: '0 8px',
                border: '1px solid rgba(255,255,255,.11)',
                background: 'rgba(255,255,255,.03)',
                borderRadius: 8,
                color: 'var(--color-corrente)',
                fontSize: 11,
                outline: 0,
                width: '100%',
              }}
            >
              <option value="">É qual perfume?</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {itens.length > 40 && (
        <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
          {`Mostrando 40 de ${itens.length}. Os demais aparecem conforme estes forem resolvidos.`}
        </span>
      )}
    </section>
  )
}

function NovoConcorrente({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [dominio, setDominio] = useState('')
  const [plataforma, setPlataforma] = useState<'nuvemshop' | 'shopify' | 'manual'>('nuvemshop')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const campo = {
    height: 40,
    padding: '0 13px',
    border: '1px solid rgba(255,255,255,.11)',
    background: 'rgba(255,255,255,.03)',
    borderRadius: 9,
    color: 'var(--color-corrente)',
    fontSize: 13,
    outline: 0,
  } as const

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await adicionarConcorrente(nome, dominio, plataforma)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const escolhida = PLATAFORMAS.find((p) => p.valor === plataforma)!

  return (
    <Modal titulo="Adicionar concorrente" largura={480} aoFechar={aoFechar}>
      <TituloSecao tamanho={15}>Adicionar concorrente</TituloSecao>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Nome</Rotulo>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Decants do Bruno"
          autoFocus
          className="font-sans focus:border-ouro/45"
          style={campo}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Domínio da loja</Rotulo>
        <input
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          placeholder="decantsdobruno.com.br"
          className="font-mono focus:border-ouro/45"
          style={campo}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Plataforma da loja</Rotulo>
        <span style={{ display: 'flex', gap: 6 }}>
          {PLATAFORMAS.map((p) => {
            const ativo = p.valor === plataforma
            return (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPlataforma(p.valor)}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 32,
                  padding: '0 13px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 10.5,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {p.rotulo}
              </button>
            )
          })}
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {escolhida.explica}
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
        <BotaoOuro altura={36} onClick={salvar}>
          {pendente ? 'Salvando…' : 'Adicionar'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}

/** Preço digitado. É o caminho que nunca depende da loja do outro cooperar. */
function PrecoManual({
  fontes,
  bases,
  variantes,
  aoFechar,
}: {
  fontes: FonteConcorrente[]
  bases: PerfumeBase[]
  variantes: readonly VarianteMl[]
  aoFechar: () => void
}) {
  const [fonte, setFonte] = useState(fontes[0]?.id ?? '')
  const [baseId, setBaseId] = useState('')
  const [variante, setVariante] = useState<number>(variantes[1] ?? variantes[0])
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const preco = parseNum(texto)
  const campo = {
    height: 40,
    padding: '0 13px',
    border: '1px solid rgba(255,255,255,.11)',
    background: 'rgba(255,255,255,.03)',
    borderRadius: 9,
    color: 'var(--color-corrente)',
    fontSize: 13,
    outline: 0,
    width: '100%',
  } as const

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setSalvo(null)
      const r = await lancarPrecoManual({ concorrenteId: fonte, baseId, variante, preco })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      // Não fecha: lançar preço à mão é trabalho em série, um perfume atrás do
      // outro. Fechar a cada gravação dobraria o número de cliques.
      setSalvo(`${brl(preco)} gravado. Escolha o próximo perfume.`)
      setTexto('')
      setBaseId('')
    })

  return (
    <Modal titulo="Lançar preço de concorrente" largura={520} aoFechar={aoFechar}>
      <TituloSecao tamanho={15}>Lançar preço à mão</TituloSecao>
      <span
        className="font-sans"
        style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
      >
        Serve para loja que não deixa ler sozinho. O preço entra na comparação igual ao lido
        automaticamente — a diferença aparece no título, que fica marcado como lançado à mão.
      </span>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Concorrente</Rotulo>
        <select value={fonte} onChange={(e) => setFonte(e.target.value)} className="font-sans" style={campo}>
          {fontes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Perfume</Rotulo>
        <select value={baseId} onChange={(e) => setBaseId(e.target.value)} className="font-sans" style={campo}>
          <option value="">Escolha o perfume…</option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {`${b.nome} · ${b.marca}`}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Variante</Rotulo>
          <select
            value={variante}
            onChange={(e) => setVariante(Number(e.target.value))}
            className="font-sans"
            style={campo}
          >
            {variantes.map((v) => (
              <option key={v} value={v}>
                {`${v} ml`}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Preço praticado (R$)</Rotulo>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value.replace(/[^0-9.,]/g, ''))}
            inputMode="decimal"
            placeholder="54,90"
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
      </div>

      {(erro || salvo) && (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: erro ? COR.erro : COR.ok, textWrap: 'pretty' }}
        >
          {erro ?? salvo}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Fechar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar}>
          {pendente ? 'Gravando…' : 'Gravar preço'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}
