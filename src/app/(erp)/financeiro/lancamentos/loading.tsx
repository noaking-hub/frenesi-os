import { Colunas, ComTrilha, GradeIndicadores, Painel, Pilha } from '@/components/erp/ui'

/**
 * O esqueleto que faltava — e a metade da correção que o dono consegue VER.
 *
 * Antes não existia um `loading.tsx` em nenhuma das 46 páginas do ERP. No App
 * Router, navegar para uma rota `force-dynamic` sem este arquivo mantém a tela
 * ANTERIOR intacta até o servidor terminar: nenhum pixel muda, nenhum controle
 * desabilita, o cursor continua em pé no campo de busca. Quem clica no filtro
 * e vê a tela parada não tem como distinguir isso de uma tela travada — e foi
 * exatamente a palavra que o dono usou.
 *
 * Ou seja: enquanto a espera era de segundos, a ausência de feedback fazia
 * parecer pane; agora que a espera caiu para dezenas de milissegundos, este
 * esqueleto quase não aparece. Ele existe para o dia em que a rede estiver
 * ruim, que é quando a diferença entre "carregando" e "quebrado" importa.
 *
 * O desenho repete a geometria da tela real — seis indicadores, trilha à
 * direita, barra de filtros, tabela e cinco cartões — para que a troca não
 * empurre o conteúdo de lugar quando os dados chegam.
 */
export default function Carregando() {
  return (
    <Pilha gap={16}>
      <GradeIndicadores>
        {Array.from({ length: 6 }, (_, i) => (
          <Painel key={i} padding="14px 15px 13px">
            <Barra altura={64} />
          </Painel>
        ))}
      </GradeIndicadores>

      <ComTrilha
        trilha={
          <>
            <Painel padding="14px 15px 15px">
              <Barra altura={96} />
            </Painel>
            <Painel titulo="Próximos vencimentos" icone="calendario">
              <Barra altura={148} />
            </Painel>
            <Painel titulo="Resumo do período" icone="lista">
              <Barra altura={120} />
            </Painel>
          </>
        }
      >
        <Painel padding="15px 16px">
          <Barra altura={116} />
        </Painel>

        <Painel titulo="Lançamentos" icone="lista" nota="carregando…" padding="16px 17px 14px">
          <Pilha gap={7}>
            {/* Dez faixas, não cinquenta: o esqueleto tem de dizer "vem uma
                tabela", não desenhar uma tabela inteira que ninguém lê. */}
            {Array.from({ length: 10 }, (_, i) => (
              <Barra key={i} altura={38} />
            ))}
          </Pilha>
        </Painel>

        <Colunas proporcao="repeat(5, minmax(0, 1fr))" gap={12}>
          {Array.from({ length: 5 }, (_, i) => (
            <Painel key={i} padding="14px 15px 13px">
              <Barra altura={118} />
            </Painel>
          ))}
        </Colunas>
      </ComTrilha>
    </Pilha>
  )
}

/**
 * Uma faixa que pulsa.
 *
 * `aria-hidden`: para quem usa leitor de tela, dez retângulos vazios são dez
 * anúncios inúteis. Quem precisa saber que a página está carregando recebe
 * isso do próprio navegador, que já anuncia a navegação.
 */
function Barra({ altura }: { altura: number }) {
  return (
    <div
      aria-hidden
      className="animate-[fr-pulse_1.6s_ease-in-out_infinite]"
      style={{
        height: altura,
        borderRadius: 10,
        background: 'rgba(255,255,255,.035)',
        border: '1px solid rgba(255,255,255,.04)',
      }}
    />
  )
}
