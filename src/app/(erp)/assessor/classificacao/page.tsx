import { CabecalhoPagina, GradeIndicadores, Indicador, Painel, Pilha, Pilula } from '@/components/erp/ui'
import { analisarLancamentos, lerCategoriasAtivas } from '@/data/assessor/financeiro'
import { escritaLiberada } from '@/data/assessor/motor'
import { brl } from '@/domain'

import { Fila } from './Fila'

/**
 * Fila de revisão da categorização — §4.12 e §14.
 *
 * A categorização é uma das principais razões de existência do Gerente, e até
 * agora ela só existia dentro do chat. Conversar é bom para entender; é péssimo
 * para revisar quarenta linhas. Esta tela dá o que a conversa não dá: ver todas
 * de uma vez, discordar de uma sem descartar as outras, e aplicar em lote
 * sabendo exatamente quantos registros e quanto dinheiro estão no clique.
 *
 * Nenhum LLM participa. A sugestão vem da função pura e testada do domínio, e
 * mandar o modelo repetir a decisão só acrescentaria custo, latência e a chance
 * de ele discordar de si mesmo entre duas aberturas da tela.
 */

export const dynamic = 'force-dynamic'

export default async function TelaDeClassificacao() {
  const [analise, categorias, escrita] = await Promise.all([
    analisarLancamentos(300),
    lerCategoriasAtivas(),
    escritaLiberada(),
  ])

  const r = analise.resumo
  const semSugestaoMasClassificavel = analise.sugestoes.filter(
    (s) => !s.categoriaId && !s.motivo.toLowerCase().includes('transferência') && !s.motivo.includes('pedido'),
  ).length

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Fila de classificação"
        subtitulo="Movimentos financeiros sem categoria, com a sugestão do ERP e o motivo dela. Você confere, marca e aplica — o modelo não participa desta decisão."
        icone="recibo"
        acao={
          <Pilula icone={escrita ? 'check-circulo' : 'cadeado'} tom={escrita ? 'ok' : 'atencao'}>
            {escrita ? `Modo ${analise.politica.modo}` : 'Escrita desligada'}
          </Pilula>
        }
      />

      <GradeIndicadores conectada minimo={190}>
        <Indicador
          plano
          icone="lista"
          tom="ouro"
          rotulo="Na fila"
          valor={String(r.total)}
          nota={`${brl(r.valorTotal)} sem classificação`}
        />
        <Indicador
          plano
          icone="check-circulo"
          tom="ok"
          rotulo="Com sugestão"
          valor={String(r.total - r.semSugestao)}
          nota="o ERP sabe propor uma categoria"
        />
        <Indicador
          plano
          icone="alerta"
          tom={r.paraRevisao > 0 ? 'atencao' : 'neutro'}
          rotulo="Exigem seu olho"
          valor={String(r.paraRevisao)}
          nota="histórico dividido, pouco histórico ou valor acima do teto"
        />
        <Indicador
          plano
          icone="transferir"
          tom="info"
          rotulo="Não classificáveis"
          valor={String(r.semSugestao - semSugestaoMasClassificavel)}
          nota="transferências e créditos de venda — contá-los duplicaria o resultado"
        />
      </GradeIndicadores>

      <Painel
        titulo="Movimentos a classificar"
        icone="ajustes"
        nota={`Modo ${analise.politica.modo} · limiar ${(analise.politica.limiar * 100).toFixed(0)}% · teto ${brl(analise.politica.tetoValor)} por movimento`}
        rodape={{
          nota:
            'Transferência entre contas próprias e crédito de venda aparecem bloqueados de propósito: classificá-los contaria o mesmo dinheiro duas vezes.',
          link: { href: '/assessor/configuracoes', texto: 'Ajustar política' },
        }}
      >
        <Fila
          sugestoes={analise.sugestoes.map((s) => ({
            id: s.movimentoId,
            descricao: s.descricao,
            valor: s.valor,
            tipo: s.tipo,
            categoriaId: s.categoriaId,
            categoria: s.categoria,
            confianca: s.confianca,
            origem: s.origem,
            exigeRevisao: s.exigeRevisao,
            motivo: s.motivo,
          }))}
          categorias={categorias}
          escritaLiberada={escrita}
        />
      </Painel>
    </Pilha>
  )
}
