'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { brl, competenciaPorExtenso, plural } from '@/domain'

import {
  alternarCentroCusto,
  fecharCompetencia,
  reabrirCompetencia,
  salvarCentroCusto,
} from '../acoes-gerenciais'
import { CAMPO, Campo, Erro, Previa, Rodape } from '../Compromissos'

/**
 * Fechar a competência é uma promessa: os números daquele mês não mudam mais.
 *
 * Por isso o diálogo mostra o que está prestes a ser congelado — quantidade
 * de lançamentos, resultado e quantos ainda estão sem categoria. Fechar um
 * mês com lançamento sem categoria congela um número que já nasce errado.
 */
export function FecharCompetencia({
  competencia,
  lancamentos,
  semCategoria,
  resultado,
}: {
  competencia: string
  lancamentos: number
  semCategoria: number
  resultado: number
}) {
  const [aberto, setAberto] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await fecharCompetencia(competencia, observacao)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setObservacao('')
      setAberto(false)
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-sans hover:border-ouro/45 hover:text-ouro"
        style={{
          height: 28,
          padding: '0 11px',
          border: '1px solid rgba(239,209,140,.3)',
          background: 'rgba(239,209,140,.06)',
          color: COR.ouro,
          fontWeight: 600,
          fontSize: 10.5,
          lineHeight: 1,
          borderRadius: 7,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Fechar competência
      </button>

      {aberto && (
        <Modal titulo="Fechar competência" largura={520} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>{`Fechar ${competenciaPorExtenso(competencia)}`}</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              A partir do fechamento, valor, categoria e tipo dos lançamentos deste mês não podem
              mais mudar sem reabrir — e a reabertura fica registrada com motivo. Dar baixa
              continua liberado: o caixa de outro mês não reescreve o resultado deste.
            </span>

            <Previa
              linhas={[
                { rotulo: 'Lançamentos no mês', valor: String(lancamentos) },
                { rotulo: 'Resultado a congelar', valor: brl(resultado), tom: resultado < 0 ? COR.erro : COR.ok },
                {
                  rotulo: 'Sem categoria',
                  valor: semCategoria ? plural(semCategoria, 'lançamento', 'lançamentos') : 'nenhum',
                  tom: semCategoria ? COR.atencao : COR.ok,
                },
              ]}
            />

            {semCategoria > 0 && (
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.5, color: COR.atencao, textWrap: 'pretty' }}
              >
                {`${plural(semCategoria, 'lançamento está', 'lançamentos estão')} sem categoria e por isso fora da DRE. Fechar agora congela um resultado que já nasce incompleto.`}
              </span>
            )}

            <Campo rotulo="Observação do fechamento" dica="Fica no histórico junto com a data e o operador">
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Conferido com o extrato do Sicoob"
                style={CAMPO}
              />
            </Campo>

            <Erro texto={erro} />
            <Rodape
              rotulo="Fechar competência"
              aoConfirmar={confirmar}
              aoCancelar={() => setAberto(false)}
              pendente={pendente}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

export function ReabrirCompetencia({ competencia }: { competencia: string }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await reabrirCompetencia(competencia, motivo)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setMotivo('')
      setAberto(false)
    })

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="font-sans hover:brightness-110"
        style={{
          height: 28,
          padding: '0 11px',
          border: `1px solid ${COR.erro}55`,
          background: 'transparent',
          color: COR.erro,
          fontWeight: 600,
          fontSize: 10.5,
          lineHeight: 1,
          borderRadius: 7,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Reabrir
      </button>

      {aberto && (
        <Modal titulo="Reabrir competência" largura={490} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>{`Reabrir ${competenciaPorExtenso(competencia)}`}</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              O resultado deste mês pode voltar a mudar. Se ele já foi enviado ao contador, o que
              ele tem em mãos deixa de bater com o que o ERP mostra — o motivo abaixo é o que
              permite explicar a diferença depois.
            </span>

            <Campo rotulo="Motivo da reabertura">
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Nota de agosto chegou em setembro"
                style={CAMPO}
              />
            </Campo>

            <Erro texto={erro} />
            <Rodape
              rotulo="Reabrir competência"
              aoConfirmar={confirmar}
              aoCancelar={() => setAberto(false)}
              pendente={pendente}
              destrutivo
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/** Centro de custo agrupa gasto por frente — loja, marketing, expedição. */
export function NovoCentroCusto() {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const confirmar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await salvarCentroCusto(nome)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setNome('')
      setAberto(false)
    })

  return (
    <>
      <BotaoOuro altura={30} onClick={() => setAberto(true)}>
        + Centro de custo
      </BotaoOuro>

      {aberto && (
        <Modal titulo="Novo centro de custo" largura={440} aoFechar={() => setAberto(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <TituloSecao tamanho={16}>Novo centro de custo</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--color-secundario)', textWrap: 'pretty' }}
            >
              Serve para responder "quanto a expedição custou este mês?" sem depender de a
              categoria ser específica demais. Um mesmo frete pode ser de venda ou de compra — o
              centro de custo separa, a categoria não.
            </span>

            <Campo rotulo="Nome">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Expedição"
                style={CAMPO}
              />
            </Campo>

            <Erro texto={erro} />
            <Rodape
              rotulo="Criar centro de custo"
              aoConfirmar={confirmar}
              aoCancelar={() => setAberto(false)}
              pendente={pendente}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

export function AlternarCentro({ id, nome, ativo }: { id: string; nome: string; ativo: boolean }) {
  const [, iniciar] = useTransition()
  return (
    <Switch
      ligado={ativo}
      label={`${ativo ? 'Inativar' : 'Ativar'} ${nome}`}
      onChange={(v) => iniciar(async () => void (await alternarCentroCusto(id, v)))}
    />
  )
}
