'use client'

import { useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Modal } from '@/components/erp/Modal'
import {
  Badge,
  Barra,
  BotaoOuro,
  BotaoSecundario,
  FaixaAlerta,
  Rotulo,
  TituloSecao,
  Valor,
} from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { apurarLote, brl, pad2, pct, plural, previaEncerramento, volume } from '@/domain'
import type { Lote, ParametrosPrecificacao, PerdaReal, PerfumeBase } from '@/domain'

import { ajustarPerdaParametro, encerrarLote } from './actions'

interface Props {
  lotes: Lote[]
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
  perda: PerdaReal
  conciliacao: { saldoLotesMl: number; estoqueMl: number; divergenciaMl: number; confere: boolean }
}

export function LotesCliente({ lotes, bases, parametros, perda, conciliacao }: Props) {
  const [selecionado, setSelecionado] = useState(lotes[0]?.id ?? '')
  const [encerrando, setEncerrando] = useState<Lote | null>(null)

  const abrirEncerramento = (l: Lote) => {
    setSelecionado(l.id)
    setEncerrando(l)
  }

  const apuracoes = lotes.map((l) => apurarLote(l, parametros))
  const loteSel = lotes.find((l) => l.id === selecionado) ?? lotes[0]
  const apSel = apurarLote(loteSel, parametros)

  const kpis: Kpi[] = [
    {
      label: 'Lotes encerrados',
      valor: pad2(perda.lotesEncerrados),
      hint: 'Frascos declarados vazios',
    },
    {
      label: 'Perda real medida',
      valor: pct(perda.mediaPct),
      hint: 'Média ponderada por volume comprado',
      tom: perda.mediaPct <= parametros.perdaPct ? 'ok' : 'erro',
    },
    {
      label: 'Parâmetro em uso',
      valor: pct(parametros.perdaPct),
      hint: perda.subestimado
        ? `Subestimado em ${pct(perda.delta)}`
        : 'Coerente com o medido',
      tom: perda.subestimado ? 'atencao' : 'ok',
    },
    {
      label: 'Custo da perda',
      valor: brl(perda.custo),
      hint: 'Nos lotes já encerrados',
      tom: 'erro',
    },
    {
      label: 'Lotes abertos',
      valor: pad2(perda.lotesAbertos),
      hint: 'Perda ainda não mensurável',
      tom: 'neutro',
    },
  ]

  const colunas: Coluna<Lote>[] = [
    {
      chave: 'lote',
      titulo: 'Lote',
      largura: '88px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Valor tamanho={10.5} tom="ouro">
            {l.id}
          </Valor>
          <span
            className="font-sans"
            style={{ fontSize: 9, lineHeight: 1.25, color: 'var(--color-apagado)' }}
          >
            {l.entrada}
          </span>
        </span>
      ),
    },
    {
      chave: 'perfume',
      titulo: 'Perfume',
      largura: 'minmax(140px,1fr)',
      render: (l) => {
        const ap = apurarLote(l, parametros)
        return (
          <CelulaDupla
            principal={l.perfume}
            secundaria={`${plural(ap.unidades, 'decant', 'decants')} · ${l.encerradoEm ?? 'em uso'}`}
          />
        )
      },
    },
    {
      chave: 'comprado',
      titulo: 'Comprado',
      largura: '88px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
          {volume(l.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'usado',
      titulo: 'Usado',
      largura: '88px',
      alinhamento: 'right',
      render: (l) => (
        <Valor tamanho={11.5} peso={400} tom="var(--color-secundario)">
          {volume(apurarLote(l, parametros).consumidoMl)}
        </Valor>
      ),
    },
    {
      chave: 'perda',
      titulo: 'Perda / saldo',
      largura: '108px',
      render: (l) => {
        const ap = apurarLote(l, parametros)
        const tom: Tom = ap.aberto ? 'neutro' : ap.acimaDoParametro ? 'erro' : 'ok'
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <Valor tamanho={11.5} tom={tom}>
                {volume(ap.diferencaMl)}
              </Valor>
              <Valor tamanho={10.5} tom={tom}>
                {ap.perdaPct === null ? '—' : pct(ap.perdaPct)}
              </Valor>
            </span>
            {/* Régua de 8%: acima disso a barra enche. */}
            <Barra pct={ap.perdaPct === null ? 0 : (ap.perdaPct / 8) * 100} tom={tom} altura={3} />
          </span>
        )
      },
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '96px',
      render: (l) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <Badge tom={l.encerradoEm ? 'neutro' : 'ok'}>
            {l.encerradoEm ? 'Encerrado' : 'Em uso'}
          </Badge>
          {!l.encerradoEm && (
            // Linha clicável já é um <button>, e button dentro de button é
            // HTML inválido: o navegador desaninha, a hidratação quebra e a
            // página inteira perde os handlers. Daí o span com role.
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                // Sem isto o clique também dispararia a seleção da linha.
                e.stopPropagation()
                abrirEncerramento(l)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                abrirEncerramento(l)
              }}
              className="font-sans hover:bg-[rgba(239,209,140,.12)]"
              style={{
                fontWeight: 600,
                fontSize: 9.5,
                color: 'var(--color-ouro)',
                border: '1px solid rgba(239,209,140,.26)',
                background: 'transparent',
                borderRadius: 6,
                padding: '5px 7px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              Declarar vazio
            </span>
          )}
        </span>
      ),
    },
  ]

  const resumoLote = [
    { label: 'Volume comprado', valor: volume(apSel.compradoMl), tom: 'var(--color-corrente)' },
    { label: 'Fracionado em vendas', valor: volume(apSel.consumidoMl), tom: 'var(--color-corrente)' },
    { label: 'Decants gerados', valor: `${apSel.unidades} un`, tom: 'var(--color-corrente)' },
    {
      label: apSel.aberto ? 'Saldo teórico restante' : 'Perda real apurada',
      valor: volume(apSel.diferencaMl),
      tom: apSel.aberto ? COR.ouro : COR.erro,
    },
    {
      label: apSel.aberto ? 'Perda prevista pelo parâmetro' : 'Perda sobre o comprado',
      valor: apSel.perdaPct === null ? pct(parametros.perdaPct) : pct(apSel.perdaPct),
      tom: apSel.aberto ? COR.neutro : COR.erro,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {perda.subestimado && (
        <FaixaAlerta
          tom="erro"
          texto={`A perda real média dos lotes encerrados é ${pct(perda.mediaPct)}, acima do parâmetro de ${pct(parametros.perdaPct)}. Isso significa que todo preço calculado está com o custo subestimado.`}
          acao={<AjustarParametro perdaPct={perda.mediaPct} />}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 356px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Tabela
          colunas={colunas}
          itens={lotes}
          chaveDe={(l) => l.id}
          aoClicar={(l) => setSelecionado(l.id)}
          selecionadoDe={(l) => l.id === selecionado}
          bandeiraDe={(l) => {
            const ap = apurarLote(l, parametros)
            return !ap.aberto && ap.acimaDoParametro ? 'erro' : null
          }}
          cabecalho={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '15px 18px',
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <TituloSecao tamanho={14.5}>Lotes de perfume base</TituloSecao>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                Um lote é um frasco comprado. Clique para ver a apuração.
              </span>
            </div>
          }
          rodape={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 18px',
                borderTop: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  flex: 'none',
                  background: conciliacao.confere ? 'var(--color-ok)' : 'var(--color-erro)',
                }}
              />
              {/* Invariante: saldo dos abertos = volume em estoque. */}
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
              >
                {conciliacao.confere
                  ? `Saldo teórico dos ${apuracoes.filter((a) => a.aberto).length} lotes abertos: ${volume(conciliacao.saldoLotesMl)} · o mesmo volume que Perfumes base mostra em estoque.`
                  : `Saldo teórico dos lotes abertos (${volume(conciliacao.saldoLotesMl)}) não bate com o volume em estoque (${volume(conciliacao.estoqueMl)}). Diferença de ${volume(Math.abs(conciliacao.divergenciaMl))} — há movimentação lançada fora do fluxo de lotes.`}
              </span>
            </div>
          }
        />

        <section
          className="card-ouro"
          style={{
            borderRadius: 16,
            padding: '18px 19px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Rotulo style={{ color: 'rgba(239,209,140,.6)' }}>
              {`Apuração do lote ${apSel.id}`}
            </Rotulo>
            <span
              className="font-display"
              style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2, color: 'var(--color-tinta)' }}
            >
              {apSel.perfume}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              background: 'rgba(255,255,255,.05)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {resumoLote.map((r) => (
              <span
                key={r.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '11px 13px',
                  background: 'var(--color-painel)',
                }}
              >
                <span
                  className="font-sans"
                  style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--color-secundario)' }}
                >
                  {r.label}
                </span>
                <Valor tamanho={12.5} tom={r.tom}>
                  {r.valor}
                </Valor>
              </span>
            ))}
          </div>

          <Rotulo>Saídas desde a entrada · volume líquido envasado</Rotulo>

          {loteSel.saidas.length === 0 ? (
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              Nenhuma saída ainda · lote recém-registrado, volume íntegro.
            </span>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                maxHeight: 210,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {loteSel.saidas.map((s) => (
                <span
                  key={`${s.ref}-${s.data}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px minmax(0,1fr) 76px',
                    gap: 10,
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.35)' }}
                  >
                    {s.data}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontWeight: 500, fontSize: 11, lineHeight: 1.35, color: 'var(--color-secundario)' }}
                    >
                      {`${s.unidades} decants de ${s.variante} ml`}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(239,209,140,.45)' }}
                    >
                      {s.ref}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <Valor tamanho={11} tom="var(--color-secundario)">
                      {volume(s.unidades * s.variante)}
                    </Valor>
                  </span>
                </span>
              ))}
            </div>
          )}

          <span
            className="font-sans"
            style={{
              fontSize: 10.5,
              lineHeight: 1.55,
              color: 'var(--color-terciario)',
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,.06)',
              textWrap: 'pretty',
            }}
          >
            {apSel.aberto
              ? `A perda só pode ser medida no fim. Enquanto o lote está aberto, o ERP usa o parâmetro de ${pct(parametros.perdaPct)} como estimativa.`
              : 'Quando você declarou o frasco vazio, o ERP somou tudo que saiu deste lote desde a entrada e tratou a diferença como perda real: sobra de fundo, respingo e evaporação.'}
          </span>

          {apSel.aberto && (
            <BotaoOuro altura={36} onClick={() => setEncerrando(loteSel)}>
              Declarar frasco vazio
            </BotaoOuro>
          )}
        </section>
      </div>

      {encerrando && (
        <ConfirmarEncerramento
          lote={encerrando}
          base={bases.find((b) => b.id === encerrando.baseId)}
          parametros={parametros}
          aoFechar={() => setEncerrando(null)}
        />
      )}
    </div>
  )
}

/** O alerta propõe o número medido; o botão grava a nova vigência. */
function AjustarParametro({ perdaPct }: { perdaPct: number }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciarTransicao(async () => {
            setErro(null)
            const r = await ajustarPerdaParametro(perdaPct)
            if (!r.ok) setErro(r.erro)
          })
        }
        className="font-sans hover:bg-[rgba(239,209,140,.16)]"
        style={{
          height: 32,
          padding: '0 14px',
          border: '1px solid rgba(239,209,140,.3)',
          background: 'rgba(239,209,140,.07)',
          color: 'var(--color-ouro)',
          fontWeight: 600,
          fontSize: 11,
          borderRadius: 8,
          cursor: pendente ? 'wait' : 'pointer',
          opacity: pendente ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {pendente ? 'Ajustando…' : `Ajustar parâmetro para ${pct(perdaPct)}`}
      </button>
      {erro && (
        <span className="font-sans" style={{ fontSize: 10.5, color: COR.erro, textAlign: 'right' }}>
          {erro}
        </span>
      )}
    </span>
  )
}

/**
 * Encerrar é irreversível e mexe em três lugares: fecha o lote, tira ml do
 * estoque e muda o custo de todo preço calculado. A confirmação mostra os
 * três antes, com os números — não é um "tem certeza?".
 */
function ConfirmarEncerramento({
  lote,
  base,
  parametros,
  aoFechar,
}: {
  lote: Lote
  base: PerfumeBase | undefined
  parametros: ParametrosPrecificacao
  aoFechar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()
  const pv = previaEncerramento(lote, base, parametros)

  const confirmar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await encerrarLote(lote.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const linhas = [
    { label: 'Volume comprado', valor: volume(pv.compradoMl), tom: 'var(--color-corrente)' },
    { label: 'Envasado, pelo extrato de saídas', valor: volume(pv.envasadoMl), tom: 'var(--color-corrente)' },
    {
      label: 'Perda real a lançar',
      valor: `${volume(pv.perdaMl)} · ${pct(pv.perdaPct)}`,
      tom: pv.acimaDoParametro ? COR.erro : COR.ok,
    },
    {
      label: 'Custo da perda',
      valor: base && base.custoPorMl > 0 ? brl(pv.custo) : 'base sem custo por ml',
      tom: base && base.custoPorMl > 0 ? COR.erro : 'var(--color-terciario)',
    },
    {
      label: 'Volume da base depois da baixa',
      valor: volume(pv.saldoBaseMl),
      tom: 'var(--color-corrente)',
    },
  ]

  return (
    <Modal titulo={`Declarar o lote ${lote.id} vazio`} largura={520} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Rotulo>{`Encerrar o lote ${lote.id}`}</Rotulo>
        <TituloSecao tamanho={15}>{lote.perfume}</TituloSecao>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(255,255,255,.05)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {linhas.map((r) => (
          <span
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '11px 13px',
              background: 'var(--color-painel)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--color-secundario)' }}
            >
              {r.label}
            </span>
            <Valor tamanho={12.5} tom={r.tom}>
              {r.valor}
            </Valor>
          </span>
        ))}
      </div>

      {pv.impedimento ? (
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro, textWrap: 'pretty' }}
        >
          {pv.impedimento}
        </span>
      ) : (
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.55, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {`Isto não tem volta: o lote fecha, os ${volume(pv.perdaMl)} saem do estoque com uma movimentação de ajuste e a perda medida passa a contar na média. `}
          {pv.acimaDoParametro
            ? `Como ${pct(pv.perdaPct)} está acima do parâmetro de ${pct(parametros.perdaPct)}, a tela vai propor corrigir o parâmetro — e todo preço calculado sobe junto.`
            : `Está dentro do parâmetro de ${pct(parametros.perdaPct)} em uso.`}
        </span>
      )}

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
          onClick={confirmar}
          disabled={pendente || pv.impedimento !== null}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 36,
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            cursor: pendente ? 'wait' : pv.impedimento ? 'not-allowed' : 'pointer',
            opacity: pendente || pv.impedimento ? 0.5 : 1,
          }}
        >
          {pendente ? 'Encerrando…' : 'Confirmar frasco vazio'}
        </button>
      </div>
    </Modal>
  )
}
