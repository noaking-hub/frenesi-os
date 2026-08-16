import { redirect } from 'next/navigation'

import { CabecalhoPagina, Painel, Pilha } from '@/components/erp/ui'
import { lerConfiguracaoDoGerente, salvarConfiguracaoDoGerente } from '@/data/assessor/politica'
import { lerRegrasDeClassificacao } from '@/data/assessor/financeiro'
import { sessaoAtual } from '@/data/sessao'
import type { ModoDeAutonomia } from '@/domain'

import { Formulario } from './Formulario'
import { Regras } from './Regras'

/**
 * Configurações administrativas do Gerente — §13 e §15.
 *
 * É aqui que a autonomia é concedida, e o desenho da tela leva isso a sério: os
 * três modos aparecem com o que cada um FAZ, não com o nome bonito. "Assistido"
 * não diz nada sozinho; "classifica automaticamente acima do limiar e manda o
 * resto para revisão" diz.
 *
 * Nada aqui é irreversível e tudo é auditado. Mas ligar escrita muda o que um
 * assistente pode fazer com o financeiro da operação — então a tela mostra o
 * estado atual com a mesma clareza com que oferece a mudança.
 */

export const dynamic = 'force-dynamic'

export default async function ConfiguracoesDoGerente() {
  const [config, regras, usuario] = await Promise.all([
    lerConfiguracaoDoGerente(),
    lerRegrasDeClassificacao(),
    sessaoAtual(),
  ])

  async function salvar(dados: {
    escritaLiberada: boolean
    modoAutonomia: ModoDeAutonomia
    limiarConfianca: number
    tetoValorAutomatico: number
  }) {
    'use server'
    const u = await sessaoAtual()
    await salvarConfiguracaoDoGerente({ ...dados, por: u?.email ?? u?.id ?? 'desconhecido' })
    redirect('/assessor/configuracoes')
  }

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Configurações do Gerente"
        subtitulo="Quanto o assistente pode fazer sozinho, e a partir de que confiança. Toda ação continua auditada, com prévia e possibilidade de desfazer."
        icone="ajustes"
      />

      <Formulario
        inicial={{
          escritaLiberada: config.escritaLiberada,
          modoAutonomia: config.modoAutonomia,
          limiarConfianca: config.limiarConfianca,
          tetoValorAutomatico: config.tetoValorAutomatico,
        }}
        travadaPorAmbiente={config.travadaPorAmbiente}
        atualizadaEm={config.atualizadaEm}
        atualizadaPor={config.atualizadaPor}
        aoSalvar={salvar}
      />

      <Painel
        titulo="Regras de classificação"
        icone="lista"
        nota="Regras determinísticas aprovadas por você. O Gerente propõe; quem cria é a sua confirmação."
        rodape={{
          nota:
            'Conflito entre regras de mesma prioridade interrompe a automação e manda o movimento para revisão — nunca escolhe uma em silêncio.',
        }}
      >
        <Regras regras={regras} />
      </Painel>

      <span
        className="font-sans"
        style={{ fontSize: 10.5, color: 'rgba(242,237,227,.32)', textWrap: 'pretty' }}
      >
        Usuário atual: {usuario?.email ?? 'sessão não identificada'}. Alterações ficam registradas
        com autor e horário.
      </span>
    </Pilha>
  )
}
