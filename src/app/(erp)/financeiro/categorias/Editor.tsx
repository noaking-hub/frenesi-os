'use client'

import { useState, useTransition } from 'react'

import { Modal } from '@/components/erp/Modal'
import { BotaoOuro, Switch, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { ROTULO_NATUREZA, podeExcluirCategoria } from '@/domain'
import type { CategoriaGerencial, NaturezaGerencial } from '@/domain'

import {
  alternarCategoria,
  excluirCategoria,
  salvarCategoria,
  type DadosCategoria,
} from '../acoes-gerenciais'
import { CAMPO, Campo, Erro, Rodape } from '../Compromissos'

const NATUREZAS: NaturezaGerencial[] = [
  'receita_operacional',
  'deducao_receita',
  'cmv',
  'despesa_fixa',
  'despesa_comercial',
  'despesa_administrativa',
  'despesa_financeira',
  'investimento',
  'aporte_retirada',
  'transferencia',
]

/**
 * Explica o efeito de cada natureza no resultado.
 *
 * A natureza é o campo mais consequente do cadastro — ela decide se um
 * pagamento vira custo do produto, estrutura ou nada disso — e é também o
 * mais fácil de errar por analogia com o nome. O texto embaixo do seletor é
 * o que evita "Compra de perfume" cadastrada como despesa administrativa.
 */
const EFEITO: Record<NaturezaGerencial, string> = {
  receita_operacional: 'Entra como faturamento no topo da DRE.',
  deducao_receita: 'Sai da receita bruta antes da líquida: imposto, devolução, taxa de gateway.',
  cmv: 'Custo que varia com a venda — perfume, frasco, etiqueta. Entra na margem de contribuição.',
  despesa_fixa: 'Estrutura que existe mesmo sem vender. É a base do ponto de equilíbrio.',
  despesa_comercial: 'Gasto para vender: anúncio, comissão, frete de venda.',
  despesa_administrativa: 'Custo de manter a operação: contabilidade, software, escritório.',
  despesa_financeira: 'Juros, multa e tarifa bancária. Não é despesa da operação.',
  investimento: 'Compra de ativo. Sai do caixa e NÃO passa pelo resultado.',
  aporte_retirada: 'Dinheiro do sócio entrando ou saindo. Patrimônio, não resultado.',
  transferencia: 'Movimento entre contas próprias. Não afeta o resultado nem soma no total.',
}

export function NovaCategoria({ centros }: { centros: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <BotaoOuro altura={32} onClick={() => setAberto(true)}>
        + Nova categoria
      </BotaoOuro>
      {aberto && <Editor categoria={null} centros={centros} aoFechar={() => setAberto(false)} />}
    </>
  )
}

export function EditarCategoria({
  categoria,
  centros,
}: {
  categoria: CategoriaGerencial
  centros: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [pendente, iniciar] = useTransition()

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
      <Switch
        ligado={categoria.ativa}
        label={`${categoria.ativa ? 'Inativar' : 'Ativar'} ${categoria.nome}`}
        onChange={(v) => iniciar(async () => void (await alternarCategoria(categoria.id, v)))}
      />
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={pendente}
        className="font-sans hover:border-ouro/45 hover:text-ouro"
        style={{
          height: 26,
          padding: '0 9px',
          border: '1px solid rgba(255,255,255,.1)',
          background: 'transparent',
          color: 'var(--color-secundario)',
          fontWeight: 600,
          fontSize: 10,
          lineHeight: 1,
          borderRadius: 7,
          cursor: 'pointer',
        }}
      >
        Editar
      </button>
      {aberto && <Editor categoria={categoria} centros={centros} aoFechar={() => setAberto(false)} />}
    </span>
  )
}

function Editor({
  categoria,
  centros,
  aoFechar,
}: {
  categoria: CategoriaGerencial | null
  centros: { id: string; nome: string }[]
  aoFechar: () => void
}) {
  const [dados, setDados] = useState<DadosCategoria>({
    nome: categoria?.nome ?? '',
    natureza: categoria?.natureza ?? 'despesa_administrativa',
    impactaDre: categoria?.impactaDre ?? true,
    impactaCaixa: categoria?.impactaCaixa ?? true,
    exigeDocumento: categoria?.exigeDocumento ?? false,
    usarEmAutomacao: categoria?.usarEmAutomacao ?? true,
    contaContabil: categoria?.contaContabil ?? '',
    centroCusto: categoria?.centroCusto ?? null,
  })
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const trocar = <K extends keyof DadosCategoria>(chave: K, valor: DadosCategoria[K]) =>
    setDados((d) => ({ ...d, [chave]: valor }))

  const salvar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await salvarCategoria(categoria?.id ?? null, dados)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  const apagar = () =>
    iniciar(async () => {
      setErro(null)
      const r = await excluirCategoria(categoria!.id)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      aoFechar()
    })

  return (
    <Modal titulo={categoria ? 'Editar categoria' : 'Nova categoria'} largura={580} aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <TituloSecao tamanho={16}>{categoria ? 'Editar categoria' : 'Nova categoria'}</TituloSecao>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
          <Campo rotulo="Nome">
            <input
              value={dados.nome}
              onChange={(e) => trocar('nome', e.target.value)}
              placeholder="Marketing e anúncios"
              style={CAMPO}
            />
          </Campo>
          <Campo rotulo="Conta contábil" dica="Código do plano de contas do contador">
            <input
              value={dados.contaContabil}
              onChange={(e) => trocar('contaContabil', e.target.value)}
              placeholder="4.1.02.001"
              style={CAMPO}
            />
          </Campo>
        </div>

        <Campo rotulo="Natureza gerencial" dica={EFEITO[dados.natureza]}>
          <select
            value={dados.natureza}
            onChange={(e) => trocar('natureza', e.target.value as NaturezaGerencial)}
            style={CAMPO}
          >
            {NATUREZAS.map((n) => (
              <option key={n} value={n}>
                {ROTULO_NATUREZA[n]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Centro de custo padrão">
          <select
            value={dados.centroCusto ?? ''}
            onChange={(e) => trocar('centroCusto', e.target.value || null)}
            style={CAMPO}
          >
            <option value="">Sem centro de custo</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Chave
            titulo="Entra na DRE"
            explicacao="Desligado, o lançamento existe no caixa mas não aparece no resultado."
            ligado={dados.impactaDre}
            aoTrocar={(v) => trocar('impactaDre', v)}
          />
          <Chave
            titulo="Entra no fluxo de caixa"
            explicacao="Provisão de imposto ainda não pago fica desligada até virar obrigação."
            ligado={dados.impactaCaixa}
            aoTrocar={(v) => trocar('impactaCaixa', v)}
          />
          <Chave
            titulo="Exige documento fiscal"
            explicacao="O ERP recusa o lançamento sem número de nota ou boleto."
            ligado={dados.exigeDocumento}
            aoTrocar={(v) => trocar('exigeDocumento', v)}
          />
          <Chave
            titulo="Disponível para automação"
            explicacao="Permite que a classificação automática do extrato escolha esta categoria."
            ligado={dados.usarEmAutomacao}
            aoTrocar={(v) => trocar('usarEmAutomacao', v)}
          />
        </div>

        <Erro texto={erro} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {categoria && (
            <button
              type="button"
              onClick={apagar}
              disabled={pendente || !podeExcluirCategoria(categoria)}
              title={
                podeExcluirCategoria(categoria)
                  ? 'Excluir definitivamente'
                  : `${categoria.emUso} lançamento(s) usam esta categoria — inative em vez de excluir`
              }
              className="font-sans"
              style={{
                height: 36,
                padding: '0 12px',
                border: `1px solid ${podeExcluirCategoria(categoria) ? COR.erro : 'rgba(255,255,255,.1)'}`,
                background: 'transparent',
                color: podeExcluirCategoria(categoria) ? COR.erro : 'var(--color-terciario)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 8,
                cursor: podeExcluirCategoria(categoria) ? 'pointer' : 'not-allowed',
                opacity: podeExcluirCategoria(categoria) ? 1 : 0.5,
              }}
            >
              Excluir
            </button>
          )}
          <div style={{ flex: 1 }} />
          <Rodape
            rotulo={categoria ? 'Salvar categoria' : 'Criar categoria'}
            aoConfirmar={salvar}
            aoCancelar={aoFechar}
            pendente={pendente}
          />
        </div>
      </div>
    </Modal>
  )
}

function Chave({
  titulo,
  explicacao,
  ligado,
  aoTrocar,
}: {
  titulo: string
  explicacao: string
  ligado: boolean
  aoTrocar: (v: boolean) => void
}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderTop: '1px solid var(--color-borda-sutil)',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span className="font-sans" style={{ fontSize: 12, color: 'var(--color-corrente)' }}>
          {titulo}
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10, lineHeight: 1.45, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          {explicacao}
        </span>
      </span>
      <Switch ligado={ligado} onChange={aoTrocar} label={titulo} />
    </span>
  )
}
