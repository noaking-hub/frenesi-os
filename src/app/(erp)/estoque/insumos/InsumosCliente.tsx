'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { ROTULO_ESTADO_INSUMO, ROTULO_INSUMO, brl, parseNum, plural } from '@/domain'
import type { InsumoAvaliado } from '@/domain'

import {
  ajustarInsumo,
  comprarInsumo,
  definirMinimo,
  historicoDoInsumo,
  type MovimentoInsumo,
} from './actions'

const TOM: Record<InsumoAvaliado['estado'], Tom> = {
  ok: 'ok',
  baixo: 'atencao',
  insuficiente: 'erro',
  zerado: 'erro',
}

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

/**
 * Insumos de envase.
 *
 * A coluna que decide é "Precisa": ela vem dos pedidos JÁ PAGOS e ainda não
 * despachados. Um item com 80 unidades parece cheio até se ver que a fila de
 * hoje consome 120 — e é por isso que saldo e necessidade ficam lado a lado.
 */
export function InsumosCliente({ itens }: { itens: InsumoAvaliado[] }) {
  const [comprando, setComprando] = useState<InsumoAvaliado | null>(null)
  const [ajustando, setAjustando] = useState<InsumoAvaliado | null>(null)
  const [historico, setHistorico] = useState<{ item: InsumoAvaliado; linhas: MovimentoInsumo[] } | null>(
    null,
  )
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const abrirHistorico = (i: InsumoAvaliado) =>
    iniciarTransicao(async () => {
      const linhas = await historicoDoInsumo(i.insumo.id)
      setHistorico({ item: i, linhas })
    })

  const colunas: Coluna<InsumoAvaliado>[] = [
    {
      chave: 'insumo',
      titulo: 'Insumo',
      largura: 'minmax(0,1fr)',
      render: (i) => (
        <CelulaDupla
          principal={i.insumo.nome}
          secundaria={`${ROTULO_INSUMO[i.insumo.tipo]}${i.insumo.frascoMl ? ` · frasco ${i.insumo.frascoMl} ml` : ''}`}
        />
      ),
    },
    {
      chave: 'saldo',
      titulo: 'Em estoque',
      largura: '110px',
      alinhamento: 'right',
      render: (i) => (
        <Valor tamanho={12.5} tom={TOM[i.estado]}>
          {`${i.insumo.unidades} un`}
        </Valor>
      ),
    },
    {
      chave: 'necessario',
      titulo: 'Precisa',
      largura: '132px',
      alinhamento: 'right',
      // Demanda já vendida: é o que separa "tenho pouco" de "não dá para
      // atender o que já vendi".
      render: (i) =>
        i.necessario > 0 ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
              {`${i.necessario} un`}
            </Valor>
            {i.falta > 0 && (
              <span className="font-sans" style={{ fontSize: 9, color: COR.erro, whiteSpace: 'nowrap' }}>
                {`faltam ${i.falta}`}
              </span>
            )}
          </span>
        ) : (
          <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.28)">
            —
          </Valor>
        ),
    },
    {
      chave: 'minimo',
      titulo: 'Mínimo',
      largura: '92px',
      alinhamento: 'right',
      render: (i) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.5)">
          {i.insumo.minimo || '—'}
        </Valor>
      ),
    },
    {
      chave: 'cobertura',
      titulo: 'Cobertura',
      largura: '108px',
      alinhamento: 'right',
      render: (i) => (
        <Valor tamanho={11.5} peso={400} tom={i.coberturaDias === null ? 'rgba(242,237,227,.3)' : 'var(--color-secundario)'}>
          {i.coberturaDias === null ? 'sem consumo' : `${i.coberturaDias} dias`}
        </Valor>
      ),
    },
    {
      chave: 'custo',
      titulo: 'Custo un.',
      largura: '108px',
      alinhamento: 'right',
      render: (i) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={12} peso={400}>
            {i.insumo.custoUnitario > 0 ? brl(i.insumo.custoUnitario) : '—'}
          </Valor>
          {i.valorEmEstoque > 0 && (
            <span
              className="font-mono"
              style={{ fontSize: 9, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
            >
              {`total ${brl(i.valorEmEstoque)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '134px',
      render: (i) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: COR[TOM[i.estado]],
            border: `1px solid ${COR[TOM[i.estado]]}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {ROTULO_ESTADO_INSUMO[i.estado]}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: '',
      largura: '218px',
      render: (i) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <BotaoSecundario altura={27} onClick={() => setComprando(i)}>
            Comprar
          </BotaoSecundario>
          <BotaoSecundario altura={27} onClick={() => setAjustando(i)}>
            Contar
          </BotaoSecundario>
          <BotaoSecundario altura={27} onClick={() => abrirHistorico(i)}>
            Histórico
          </BotaoSecundario>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {erro && (
        <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}

      <Tabela
        colunas={colunas}
        itens={itens}
        chaveDe={(i) => i.insumo.id}
        bandeiraDe={(i) => (i.estado === 'insuficiente' || i.estado === 'zerado' ? 'erro' : i.estado === 'baixo' ? 'atencao' : null)}
      />

      {comprando && (
        <CompraInsumo
          item={comprando}
          aoFechar={() => setComprando(null)}
          aoErro={setErro}
        />
      )}
      {ajustando && (
        <ContagemInsumo item={ajustando} aoFechar={() => setAjustando(null)} aoErro={setErro} />
      )}
      {historico && (
        <Modal titulo={`Histórico · ${historico.item.insumo.nome}`} largura={620} aoFechar={() => setHistorico(null)}>
          <TituloSecao tamanho={15}>{historico.item.insumo.nome}</TituloSecao>
          {historico.linhas.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum movimento ainda. A primeira compra ou contagem aparece aqui.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 380, overflowY: 'auto' }}>
              {historico.linhas.map((m, n) => (
                <div
                  key={n}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '92px 74px minmax(0,1fr) 84px',
                    gap: 10,
                    alignItems: 'center',
                    paddingBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
                    {m.quando}
                  </span>
                  <Valor tamanho={11} tom={m.unidades >= 0 ? 'ok' : 'atencao'}>
                    {`${m.unidades > 0 ? '+' : ''}${m.unidades} un`}
                  </Valor>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.35,
                      color: 'var(--color-secundario)',
                      textWrap: 'pretty',
                    }}
                  >
                    {m.descricao}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: 'rgba(242,237,227,.4)', textAlign: 'right' }}
                  >
                    {m.saldo === null ? '' : `saldo ${m.saldo}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={() => setHistorico(null)}>
              Fechar
            </BotaoSecundario>
          </div>
        </Modal>
      )}

      {pendente && (
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          carregando…
        </span>
      )}
    </div>
  )
}

function CompraInsumo({
  item,
  aoFechar,
  aoErro,
}: {
  item: InsumoAvaliado
  aoFechar: () => void
  aoErro: (e: string | null) => void
}) {
  const [unidades, setUnidades] = useState('')
  const [custo, setCusto] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const qtd = parseNum(unidades)
  const total = parseNum(custo)
  const unitario = qtd > 0 ? total / qtd : 0

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await comprarInsumo(item.insumo.id, qtd, total, fornecedor)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoErro(null)
      aoFechar()
    })

  return (
    <Modal titulo={`Comprar ${item.insumo.nome}`} largura={480} aoFechar={aoFechar}>
      <TituloSecao tamanho={15}>{`Comprar · ${item.insumo.nome}`}</TituloSecao>
      <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}>
        {`Hoje há ${item.insumo.unidades} un em estoque. A entrada refaz o custo médio, como na compra de frasco de perfume.`}
      </span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Unidades</Rotulo>
          <input
            value={unidades}
            onChange={(e) => setUnidades(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="500"
            autoFocus
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Custo total (R$)</Rotulo>
          <input
            value={custo}
            onChange={(e) => setCusto(e.target.value.replace(/[^0-9.,]/g, ''))}
            inputMode="decimal"
            placeholder="450,00"
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Fornecedor</Rotulo>
        <input
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
          placeholder="Opcional — fica no histórico"
          className="font-sans focus:border-ouro/45"
          style={campo}
        />
      </label>

      {qtd > 0 && total > 0 && (
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
          {`${qtd} un a ${brl(unitario)} cada · saldo depois: ${item.insumo.unidades + qtd} un`}
        </span>
      )}

      {erro && (
        <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar}>
          {pendente ? 'Registrando…' : 'Registrar compra'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}

function ContagemInsumo({
  item,
  aoFechar,
  aoErro,
}: {
  item: InsumoAvaliado
  aoFechar: () => void
  aoErro: (e: string | null) => void
}) {
  const [contado, setContado] = useState(String(item.insumo.unidades))
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const qtd = parseNum(contado)
  const diferenca = qtd - item.insumo.unidades

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await ajustarInsumo(item.insumo.id, qtd, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoErro(null)
      aoFechar()
    })

  return (
    <Modal titulo={`Contar ${item.insumo.nome}`} largura={460} aoFechar={aoFechar}>
      <TituloSecao tamanho={15}>{`Contagem · ${item.insumo.nome}`}</TituloSecao>
      <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}>
        {`O ERP diz ${item.insumo.unidades} un. O que você contou vira o novo saldo, e a diferença fica registrada com o motivo.`}
      </span>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Unidades contadas</Rotulo>
        <input
          value={contado}
          onChange={(e) => setContado(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          autoFocus
          className="font-mono focus:border-ouro/45"
          style={campo}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Motivo</Rotulo>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Contagem mensal, quebra, sobra de caixa…"
          className="font-sans focus:border-ouro/45"
          style={campo}
        />
      </label>

      {diferenca !== 0 && (
        <span
          className="font-sans"
          style={{ fontSize: 11, color: diferenca > 0 ? COR.ok : COR.erro }}
        >
          {`${diferenca > 0 ? 'Sobraram' : 'Faltaram'} ${Math.abs(diferenca)} ${plural(Math.abs(diferenca), 'unidade', 'unidades')} em relação ao sistema.`}
        </span>
      )}

      {erro && (
        <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar}>
          {pendente ? 'Gravando…' : 'Confirmar contagem'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}

/** Mínimo editável direto na tela — é o gatilho do alerta de compra. */
export function MinimoRapido({ item }: { item: InsumoAvaliado }) {
  const [valor, setValor] = useState(String(item.insumo.minimo))
  const [pendente, iniciarTransicao] = useTransition()

  return (
    <input
      value={valor}
      onChange={(e) => setValor(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() =>
        iniciarTransicao(async () => {
          await definirMinimo(item.insumo.id, parseNum(valor))
        })
      }
      disabled={pendente}
      className="font-mono"
      style={{ ...campo, height: 28, fontSize: 11, width: 74, textAlign: 'right' }}
    />
  )
}
