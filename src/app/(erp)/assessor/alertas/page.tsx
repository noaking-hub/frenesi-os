import { revalidatePath } from 'next/cache'

import {
  CabecalhoPagina,
  GradeIndicadores,
  Indicador,
  Painel,
  Pilha,
  Pilula,
  Vazio,
} from '@/components/erp/ui'
import { carregarAlertas, reativarAlerta, silenciarAlerta } from '@/data/assessor/alertas'
import { sessaoAtual } from '@/data/sessao'

import { ListaDeAlertas } from './Lista'

/**
 * Alertas do motor proativo — §4.6.
 *
 * A Central mostra a fila calculada AGORA; esta tela mostra a mesma coisa com
 * memória: desde quando o problema existe, quantas vezes a vigília o viu, o que
 * você já mandou silenciar e o que se resolveu sozinho.
 *
 * A seção de resolvidos existe por um motivo que não é nostalgia: ver um
 * problema sumir sem ninguém ter feito nada é informação. Ou ele se resolveu de
 * fato, ou a regra que o detectava parou de funcionar — e as duas merecem ser
 * notadas.
 */

export const dynamic = 'force-dynamic'

export default async function TelaDeAlertas() {
  const p = await carregarAlertas()

  async function silenciar(chave: string, dias: number) {
    'use server'
    const u = await sessaoAtual()
    await silenciarAlerta(chave, dias, u?.email ?? u?.id ?? 'desconhecido')
    revalidatePath('/assessor/alertas')
  }

  async function reativar(chave: string) {
    'use server'
    await reativarAlerta(chave)
    revalidatePath('/assessor/alertas')
  }

  const criticos = p.abertos.filter((a) => a.severidade === 'critico').length
  const hora = p.ultimaVigilia
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(p.ultimaVigilia))
    : null

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Alertas"
        subtitulo="O que a vigília encontrou sem você perguntar. Cada alerta guarda desde quando existe e quantas vezes já apareceu."
        icone="sino"
        acao={
          <Pilula icone="atualizar" tom={hora ? 'ok' : 'atencao'}>
            {hora ? `Última vigília ${hora}` : 'Vigília ainda não rodou'}
          </Pilula>
        }
      />

      <GradeIndicadores conectada minimo={190}>
        <Indicador
          plano
          icone={criticos > 0 ? 'alerta-circulo' : 'check-circulo'}
          tom={criticos > 0 ? 'erro' : p.abertos.length > 0 ? 'atencao' : 'ok'}
          rotulo="Abertos"
          valor={String(p.abertos.length)}
          tomValor={criticos > 0 ? 'erro' : undefined}
          nota={criticos > 0 ? `${criticos} crítico(s)` : 'nenhum crítico'}
        />
        <Indicador
          plano
          icone="relogio"
          tom="neutro"
          rotulo="Silenciados"
          valor={String(p.silenciados.length)}
          nota="voltam sozinhos no fim do prazo"
        />
        <Indicador
          plano
          icone="check"
          tom="ok"
          rotulo="Resolvidos"
          valor={String(p.resolvidos.length)}
          nota="sumiram da fila e fecharam sozinhos"
        />
      </GradeIndicadores>

      <Painel
        titulo="Exigem decisão"
        icone="alvo"
        tom={criticos > 0 ? 'erro' : 'ouro'}
        rodape={{
          nota:
            'A vigília roda de hora em hora. Silenciar adia com prazo — nunca esconde para sempre, porque um problema que ninguém quer ver de novo é um problema para resolver ou uma regra para desligar.',
        }}
      >
        {p.abertos.length === 0 ? (
          <Vazio texto="Nenhum alerta aberto. A operação está no eixo." icone="check-circulo" />
        ) : (
          <ListaDeAlertas alertas={p.abertos} aoSilenciar={silenciar} aoReativar={reativar} />
        )}
      </Painel>

      {p.silenciados.length > 0 && (
        <Painel titulo="Silenciados" icone="relogio" tom="neutro" nota="Voltam à lista principal quando o prazo vence.">
          <ListaDeAlertas
            alertas={p.silenciados}
            aoSilenciar={silenciar}
            aoReativar={reativar}
            silenciados
          />
        </Painel>
      )}

      {p.resolvidos.length > 0 && (
        <Painel
          titulo="Resolvidos"
          icone="check"
          tom="ok"
          nota="Sumiram da fila e fecharam sozinhos, com data."
        >
          <ListaDeAlertas alertas={p.resolvidos} aoSilenciar={silenciar} aoReativar={reativar} resolvidos />
        </Painel>
      )}
    </Pilha>
  )
}
