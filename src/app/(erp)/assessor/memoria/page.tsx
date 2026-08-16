import { revalidatePath } from 'next/cache'

import { CabecalhoPagina, Colunas, Destaque, Painel, Pilha, Vazio } from '@/components/erp/ui'
import { apagarMemoria, lerMemorias } from '@/data/assessor/memoria'
import { sessaoAtual } from '@/data/sessao'

import { Lista } from './Lista'

/**
 * Memória do Gerente — §9.1.
 *
 * A tela existe porque o escopo dá ao usuário o direito de VER, EDITAR e APAGAR
 * o que o assistente guardou sobre ele. Memória invisível é a pior espécie:
 * muda o comportamento do sistema sem que ninguém consiga apontar a causa.
 *
 * O que NÃO aparece aqui é tão importante quanto o que aparece — e por isso o
 * bloco de cima diz explicitamente que dado da operação nunca é memorizado.
 */

export const dynamic = 'force-dynamic'

export default async function TelaDeMemoria() {
  const usuario = await sessaoAtual()
  const memorias = await lerMemorias(usuario?.id ?? null)

  async function apagar(id: string) {
    'use server'
    const u = await sessaoAtual()
    await apagarMemoria(id, u?.id ?? null)
    revalidatePath('/assessor/memoria')
  }

  const preferencias = memorias.filter((m) => m.tipo === 'preferencia')
  const decisoes = memorias.filter((m) => m.tipo === 'decisao')

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Memória"
        subtitulo="O que o Gerente guardou sobre como você trabalha. Tudo aqui pode ser apagado, e apagar apaga de verdade."
        icone="estrela"
      />

      <Destaque tom="info" icone="escudo" titulo="O que ele NUNCA guarda">
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
        >
          Saldo, estoque, preço, pedido e qualquer número da operação são consultados no momento da
          resposta — nunca memorizados. Memória que guarda saldo vira saldo velho apresentado como
          atual, e num ERP financeiro isso é pior do que não lembrar de nada. Aqui moram só
          preferências e decisões suas.
        </span>
      </Destaque>

      <Colunas proporcao="repeat(auto-fit, minmax(320px, 1fr))">
        <Painel
          titulo="Preferências"
          icone="ajustes"
          nota="Como você quer ver as coisas."
        >
          {preferencias.length === 0 ? (
            <Vazio
              texto='Nenhuma ainda. Diga ao Gerente: "lembre que eu prefiro sempre 30 dias".'
              icone="ajustes"
            />
          ) : (
            <Lista memorias={preferencias} aoApagar={apagar} />
          )}
        </Painel>

        <Painel
          titulo="Decisões aprovadas"
          icone="check-circulo"
          nota="O que você já resolveu e não quer rediscutir."
        >
          {decisoes.length === 0 ? (
            <Vazio
              texto='Nenhuma ainda. Ex.: "decidi não repor amostras abaixo de 10 ml".'
              icone="check-circulo"
            />
          ) : (
            <Lista memorias={decisoes} aoApagar={apagar} />
          )}
        </Painel>
      </Colunas>

      <span
        className="font-sans"
        style={{ fontSize: 10.5, color: 'rgba(242,237,227,.32)', textWrap: 'pretty' }}
      >
        Quando uma memória contraria uma configuração oficial do ERP, prevalece o ERP — e o Gerente
        avisa que existe o conflito em vez de resolvê-lo em silêncio.
      </span>
    </Pilha>
  )
}
