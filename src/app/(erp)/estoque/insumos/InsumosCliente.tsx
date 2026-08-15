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
  editarInsumo,
  editarMovimentoInsumo,
  excluirMovimentoInsumo,
  historicoDoInsumo,
  type MovimentoInsumo,
} from './actions'

const TOM: Record<InsumoAvaliado['estado'], Tom> = {
  ok: 'ok',
  baixo: 'atencao',
  insuficiente: 'erro',
  zerado: 'erro',
}

/** Nome curto do movimento no histórico — a frase completa já vem na descrição. */
const ROTULO_MOVIMENTO: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Contagem',
  estorno: 'Correção',
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

const dica = {
  fontSize: 10.5,
  lineHeight: 1.5,
  color: 'var(--color-terciario)',
  textWrap: 'pretty',
} as const

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <span className="font-sans" style={{ fontSize: 11.5, color: COR.erro, textWrap: 'pretty' }}>
      {texto}
    </span>
  )
}

/**
 * Insumos de envase.
 *
 * A coluna que decide é "Precisa": ela vem dos pedidos JÁ PAGOS e ainda não
 * despachados. Um item com 80 unidades parece cheio até se ver que a fila de
 * hoje consome 120 — e é por isso que saldo e necessidade ficam lado a lado.
 *
 * Tudo o que foi lançado é corrigível: entrada e contagem se editam ou se
 * excluem pelo histórico, com saldo e custo médio refeitos do primeiro
 * movimento em diante, e a correção fica registrada na própria lista.
 */
export function InsumosCliente({ itens }: { itens: InsumoAvaliado[] }) {
  const [comprando, setComprando] = useState<InsumoAvaliado | null>(null)
  const [ajustando, setAjustando] = useState<InsumoAvaliado | null>(null)
  const [editando, setEditando] = useState<InsumoAvaliado | null>(null)
  const [historico, setHistorico] = useState<{ id: string; linhas: MovimentoInsumo[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const abrirHistorico = (id: string) =>
    iniciarTransicao(async () => {
      const linhas = await historicoDoInsumo(id)
      setHistorico({ id, linhas })
    })

  // O item do histórico vem sempre da lista recém-renderizada pelo servidor:
  // depois de uma correção, o diálogo tem de mostrar o saldo novo, não o que
  // estava na tela quando ele abriu.
  const itemDoHistorico = historico ? itens.find((i) => i.insumo.id === historico.id) ?? null : null

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
      largura: '312px',
      render: (i) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <BotaoSecundario altura={27} onClick={() => setEditando(i)}>
            Editar
          </BotaoSecundario>
          <BotaoSecundario altura={27} onClick={() => setComprando(i)}>
            Comprar
          </BotaoSecundario>
          <BotaoSecundario altura={27} onClick={() => setAjustando(i)}>
            Contar
          </BotaoSecundario>
          <BotaoSecundario altura={27} onClick={() => abrirHistorico(i.insumo.id)}>
            Histórico
          </BotaoSecundario>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Erro texto={erro} />

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
      {editando && (
        <CadastroDoInsumo item={editando} aoFechar={() => setEditando(null)} aoErro={setErro} />
      )}
      {historico && itemDoHistorico && (
        <HistoricoInsumo
          item={itemDoHistorico}
          linhas={historico.linhas}
          aoRecarregar={() => abrirHistorico(historico.id)}
          aoFechar={() => setHistorico(null)}
        />
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
      <span className="font-sans" style={dica}>
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

      <Erro texto={erro} />

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
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
      <span className="font-sans" style={dica}>
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

      <Erro texto={erro} />

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
          {pendente ? 'Gravando…' : 'Confirmar contagem'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}

/**
 * Cadastro do insumo.
 *
 * O custo unitário está aqui porque quem lançou saldo inicial sem nota não
 * tem compra nenhuma para editar — sem este campo, o item ficaria com custo
 * "—" para sempre e o valor em estoque nasceria errado.
 */
function CadastroDoInsumo({
  item,
  aoFechar,
  aoErro,
}: {
  item: InsumoAvaliado
  aoFechar: () => void
  aoErro: (e: string | null) => void
}) {
  const [nome, setNome] = useState(item.insumo.nome)
  const [minimo, setMinimo] = useState(String(item.insumo.minimo))
  const [custo, setCusto] = useState(item.insumo.custoUnitario > 0 ? String(item.insumo.custoUnitario).replace('.', ',') : '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const unitario = parseNum(custo)

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await editarInsumo(item.insumo.id, {
        nome,
        minimo: parseNum(minimo),
        custoUnitario: unitario,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoErro(null)
      aoFechar()
    })

  return (
    <Modal titulo={`Editar ${item.insumo.nome}`} largura={500} aoFechar={aoFechar}>
      <TituloSecao tamanho={15}>{`Cadastro · ${item.insumo.nome}`}</TituloSecao>
      <span className="font-sans" style={dica}>
        O saldo não se edita aqui — ele vem dos movimentos. Para corrigir uma entrada ou uma contagem
        já lançada, use o Histórico.
      </span>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>Nome</Rotulo>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
          className="font-sans focus:border-ouro/45"
          style={campo}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Mínimo</Rotulo>
          <input
            value={minimo}
            onChange={(e) => setMinimo(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="0 desliga o alerta"
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Custo unitário (R$)</Rotulo>
          <input
            value={custo}
            onChange={(e) => setCusto(e.target.value.replace(/[^0-9.,]/g, ''))}
            inputMode="decimal"
            placeholder="0,35"
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
      </div>

      <span className="font-sans" style={dica}>
        O custo unitário vale como referência enquanto nenhuma entrada do histórico tiver valor. Na
        primeira compra com custo, o custo médio calculado passa a mandar.
      </span>

      {unitario > 0 && item.insumo.unidades > 0 && (
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
          {`${item.insumo.unidades} un em estoque valem ${brl(item.insumo.unidades * unitario)}.`}
        </span>
      )}

      <Erro texto={erro} />

      <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
        <BotaoSecundario altura={36} onClick={aoFechar}>
          Cancelar
        </BotaoSecundario>
        <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
          {pendente ? 'Gravando…' : 'Salvar cadastro'}
        </BotaoOuro>
      </div>
    </Modal>
  )
}

/**
 * Histórico do insumo, com a correção dentro dele.
 *
 * A correção mora no mesmo diálogo em vez de abrir outro por cima: o
 * histórico é o contexto que faz a edição fazer sentido, e diálogo sobre
 * diálogo fecha os dois no mesmo Esc.
 */
function HistoricoInsumo({
  item,
  linhas,
  aoRecarregar,
  aoFechar,
}: {
  item: InsumoAvaliado
  linhas: MovimentoInsumo[]
  aoRecarregar: () => void
  aoFechar: () => void
}) {
  const [corrigindo, setCorrigindo] = useState<MovimentoInsumo | null>(null)

  return (
    <Modal titulo={`Histórico · ${item.insumo.nome}`} largura={700} aoFechar={aoFechar}>
      {corrigindo ? (
        <CorrigirMovimento
          item={item}
          movimento={corrigindo}
          aoVoltar={() => setCorrigindo(null)}
          aoConcluir={() => {
            setCorrigindo(null)
            aoRecarregar()
          }}
        />
      ) : (
        <>
          <TituloSecao tamanho={15}>{item.insumo.nome}</TituloSecao>
          <span className="font-sans" style={dica}>
            {`Saldo ${item.insumo.unidades} un · custo médio ${item.insumo.custoUnitario > 0 ? brl(item.insumo.custoUnitario) : 'não informado'}. Entradas e contagens podem ser corrigidas ou excluídas — saldo e custo médio são refeitos, e a correção fica registrada aqui.`}
          </span>

          {linhas.length === 0 ? (
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum movimento ainda. A primeira compra ou contagem aparece aqui.
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 400, overflowY: 'auto' }}>
              {linhas.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 76px minmax(0,1fr) 78px 84px',
                    gap: 10,
                    alignItems: 'center',
                    paddingBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,.05)',
                  }}
                >
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, color: 'var(--color-terciario)', lineHeight: 1.35 }}
                  >
                    {m.quando}
                    <br />
                    <span style={{ fontSize: 9, color: 'rgba(242,237,227,.28)' }}>
                      {ROTULO_MOVIMENTO[m.tipo] ?? m.tipo}
                    </span>
                  </span>

                  {m.tipo === 'estorno' ? (
                    <Valor tamanho={10.5} peso={400} tom="rgba(242,237,227,.3)">
                      registro
                    </Valor>
                  ) : (
                    <Valor tamanho={11} tom={m.unidades >= 0 ? 'ok' : 'atencao'}>
                      {`${m.unidades > 0 ? '+' : ''}${m.unidades} un`}
                    </Valor>
                  )}

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
                    {m.responsavel && (
                      <span style={{ color: 'rgba(242,237,227,.3)' }}>{` · ${m.responsavel}`}</span>
                    )}
                  </span>

                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: 'rgba(242,237,227,.4)', textAlign: 'right' }}
                  >
                    {m.saldo === null ? '' : `saldo ${m.saldo}`}
                  </span>

                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {m.editavel ? (
                      <BotaoSecundario altura={24} onClick={() => setCorrigindo(m)}>
                        Corrigir
                      </BotaoSecundario>
                    ) : (
                      <span
                        className="font-sans"
                        title={m.travadoPor ?? undefined}
                        style={{ fontSize: 9.5, color: 'rgba(242,237,227,.22)' }}
                      >
                        automático
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <BotaoSecundario altura={36} onClick={aoFechar}>
              Fechar
            </BotaoSecundario>
          </div>
        </>
      )}
    </Modal>
  )
}

/**
 * Correção de um lançamento.
 *
 * Numa contagem o número digitado é o SALDO apurado; numa entrada é a
 * quantidade que entrou. São coisas diferentes, e o rótulo diz qual é qual
 * para ninguém somar de novo o que já estava somado.
 */
function CorrigirMovimento({
  item,
  movimento,
  aoVoltar,
  aoConcluir,
}: {
  item: InsumoAvaliado
  movimento: MovimentoInsumo
  aoVoltar: () => void
  aoConcluir: () => void
}) {
  const ehContagem = movimento.tipo === 'ajuste'
  const [quantidade, setQuantidade] = useState(String(movimento.quantidade))
  const [custo, setCusto] = useState(
    movimento.custoUnitario && movimento.custoUnitario > 0
      ? String(movimento.custoUnitario).replace('.', ',')
      : '',
  )
  const [observacao, setObservacao] = useState(movimento.observacao)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciarTransicao] = useTransition()

  const qtd = parseNum(quantidade)
  const unitario = parseNum(custo)
  const diferenca = qtd - movimento.quantidade

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await editarMovimentoInsumo(movimento.id, {
        quantidade: qtd,
        custoUnitario: unitario,
        observacao,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoConcluir()
    })

  const excluir = () =>
    iniciarTransicao(async () => {
      setErro(null)
      const r = await excluirMovimentoInsumo(movimento.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoConcluir()
    })

  return (
    <>
      <TituloSecao tamanho={15}>{`Corrigir ${ehContagem ? 'contagem' : 'entrada'} · ${item.insumo.nome}`}</TituloSecao>
      <span className="font-sans" style={dica}>
        {`Lançado em ${movimento.quando}: ${movimento.descricao}. Ao gravar, o saldo e o custo médio são refeitos do primeiro movimento até hoje, e a correção fica registrada no histórico com o seu nome.`}
      </span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>{ehContagem ? 'Unidades contadas' : 'Unidades que entraram'}</Rotulo>
          <input
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            autoFocus
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>Custo unitário (R$)</Rotulo>
          <input
            value={custo}
            onChange={(e) => setCusto(e.target.value.replace(/[^0-9.,]/g, ''))}
            inputMode="decimal"
            placeholder="0,35"
            className="font-mono focus:border-ouro/45"
            style={campo}
          />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <Rotulo>{ehContagem ? 'Motivo' : 'Fornecedor'}</Rotulo>
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder={ehContagem ? 'Estoque inicial, contagem mensal, quebra…' : 'Opcional — fica no histórico'}
          className="font-sans focus:border-ouro/45"
          style={campo}
        />
      </label>

      <span className="font-sans" style={dica}>
        {ehContagem
          ? 'O número é o saldo apurado na contagem, não a diferença. O custo unitário é opcional: informe-o quando este lançamento foi o saldo inicial e o valor ficou de fora.'
          : 'O custo unitário é o preço pago por unidade nesta entrada. Deixe vazio para a entrada não valer no custo médio.'}
      </span>

      {diferenca !== 0 && (
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
          {`Este lançamento passa de ${movimento.quantidade} un para ${qtd} un${unitario > 0 ? ` a ${brl(unitario)} cada` : ''}.`}
        </span>
      )}

      {confirmandoExclusao && (
        <span className="font-sans" style={{ fontSize: 11, color: COR.erro, textWrap: 'pretty' }}>
          O movimento sai do razão e o saldo é refeito sem ele. A exclusão fica registrada no
          histórico, com quem excluiu.
        </span>
      )}

      <Erro texto={erro} />

      <div style={{ display: 'flex', gap: 9, justifyContent: 'space-between' }}>
        <BotaoSecundario
          altura={36}
          desabilitado={pendente}
          onClick={() => (confirmandoExclusao ? excluir() : setConfirmandoExclusao(true))}
        >
          {confirmandoExclusao ? 'Confirmar exclusão' : 'Excluir movimento'}
        </BotaoSecundario>
        <span style={{ display: 'flex', gap: 9 }}>
          <BotaoSecundario altura={36} onClick={aoVoltar}>
            Voltar
          </BotaoSecundario>
          <BotaoOuro altura={36} onClick={salvar} desabilitado={pendente}>
            {pendente ? 'Gravando…' : 'Salvar correção'}
          </BotaoOuro>
        </span>
      </div>
    </>
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
