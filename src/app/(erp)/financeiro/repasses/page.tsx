import { GradeIndicadores, Indicador, Painel, Pilha, Vazio } from '@/components/erp/ui'
import { carregarFilaDeDestino } from '@/data/financeiro'
import { brl, plural } from '@/domain'

import { Fila } from './Fila'

/**
 * Destino dos repasses — a fila que acaba com o chute.
 *
 * O extrato do gateway descreve todo saque com a mesma frase: "Transferência
 * para conta bancária". Ela vale tanto para o dinheiro que foi para o Inter
 * quanto para o que pagou o anúncio da Meta, e o ERP tratava as duas como
 * movimentação interna — R$ 1.205,49 de tráfego pago sumiram da DRE por isso,
 * num dia em que o dono da operação sabia exatamente para onde tinham ido.
 *
 * A tela não adivinha e não deixa o ERP adivinhar: cada linha espera uma de
 * duas respostas — conta própria (e nasce a perna de entrada que faltava) ou
 * despesa (e some a marca de transferência). Enquanto a resposta não vem, a
 * linha fica visível aqui em vez de virar número errado em outra tela.
 */
export const dynamic = 'force-dynamic'

export default async function RepassesSemDestino() {
  const f = await carregarFilaDeDestino()

  if (f.semBanco) {
    return (
      <Pilha>
        <Painel>
          <Vazio
            icone="cadeado"
            texto="O Supabase precisa estar configurado para ler os repasses do gateway."
          />
        </Painel>
      </Pilha>
    )
  }

  const contasDestino = f.contas.filter((c) => c.ativa)

  return (
    <Pilha gap={16}>
      <GradeIndicadores>
        <Indicador
          icone="transferir"
          tom={f.itens.length ? 'atencao' : 'ok'}
          rotulo="Repasses sem destino"
          valor={
            f.itens.length ? plural(f.itens.length, 'repasse', 'repasses') : 'Fila vazia'
          }
          nota={
            f.itens.length
              ? 'Nem despesa nem transferência até alguém dizer'
              : 'Todo saque do gateway já tem destino declarado'
          }
          tomNota={f.itens.length ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Valor parado na fila"
          valor={brl(f.total)}
          nota="Fora da DRE e neutro no caixa enquanto espera"
        />
        <Indicador
          icone="banco"
          tom="info"
          rotulo="Contas para receber"
          valor={String(contasDestino.length)}
          nota="Destinos possíveis de uma transferência própria"
          href="/financeiro/contas"
        />
      </GradeIndicadores>

      <Painel
        titulo="Para onde foi cada saque?"
        icone="transferir"
        nota={f.itens.length ? plural(f.itens.length, 'pendente', 'pendentes') : undefined}
        rodape={{
          nota:
            'Conta própria vira transferência com as duas pernas — neutra no caixa. ' +
            'Despesa deixa de ser transferência e passa a contar na DRE.',
          link: { href: '/financeiro/extrato', texto: 'Ver o extrato de origem' },
        }}
      >
        {f.itens.length === 0 ? (
          <Vazio
            icone="check-circulo"
            texto="Nenhum repasse esperando destino. Novos saques do gateway aparecem aqui."
          />
        ) : (
          <Fila
            itens={f.itens}
            contas={contasDestino.map((c) => ({ id: c.id, nome: c.nome, banco: c.banco }))}
            categorias={f.categorias.map((c) => ({ id: c.id, nome: c.nome }))}
          />
        )}
      </Painel>
    </Pilha>
  )
}
