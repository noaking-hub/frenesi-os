import {
  Colunas,
  Ico,
  Destaque,
  Etiqueta,
  GradeIndicadores,
  Indicador,
  LinkSeta,
  Num,
  Painel,
  Pilula,
  TINTA,
  VELADO,
  CONTORNO,
  Vazio,
  type NomeIcone,
  type TomUi,
} from '@/components/erp/ui'
import { brl } from '@/domain'
import type { Briefing, Prioridade, Severidade } from '@/domain'

import type { ResumoExecutivo } from '@/data/assessor/prioridades'

/**
 * Os blocos da Central do Gerente — §3.1 e §7 do escopo.
 *
 * A tela anterior desenhava caixas cinzas com texto dentro, e por isso não
 * pertencia ao ERP: o Financeiro tem cabeçalho com ícone, indicadores em grade
 * conectada, painéis com nota e rodapé de navegação. Aqui é o mesmo vocabulário
 * — `Painel`, `Indicador`, `Destaque`, `Num` — porque a Central não é um
 * módulo à parte, é a leitura executiva dos módulos que já existem.
 *
 * A ordem também é do escopo e não é decoração: primeiro o que exige decisão,
 * depois o que mudou, depois o retrato do dia. Quem abre o ERP às sete da manhã
 * precisa da fila antes do panorama.
 */

const TOM_DA_SEVERIDADE: Record<Severidade, TomUi> = {
  critico: 'erro',
  alto: 'atencao',
  medio: 'info',
  informativo: 'neutro',
}

const ROTULO: Record<Severidade, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Médio',
  informativo: 'Informativo',
}

const ICONE_DA_SEVERIDADE: Record<Severidade, NomeIcone> = {
  critico: 'alerta-circulo',
  alto: 'alerta',
  medio: 'info',
  informativo: 'info',
}

// ── §3.1 · Indicador de atualização e módulos consultados ──────────────────

/**
 * De quando é o dado e de onde ele veio.
 *
 * O escopo pede este bloco, e a razão é a mesma que sustenta o resto do módulo:
 * número sem hora é número que ninguém sabe se ainda vale. Ele fica no topo
 * porque é a primeira dúvida de quem lê um painel que se atualiza sozinho.
 */
export function IndicadorDeAtualizacao({
  apuradoEm,
  modulos,
}: {
  apuradoEm: string
  modulos: string[]
}) {
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(apuradoEm))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Pilula icone="atualizar" tom="ok">
        Apurado às {hora}
      </Pilula>
      <span
        className="font-sans"
        style={{ fontSize: 11.5, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
      >
        Lido agora de {modulos.join(', ')} — os mesmos números das telas, não uma segunda conta.
      </span>
    </div>
  )
}

// ── §7.1 · Prioridades agora ───────────────────────────────────────────────

/**
 * A fila do que exige decisão, com os sete campos do §7.1 em cada item.
 *
 * O desenho de cada linha segue a ordem em que a decisão se forma: severidade e
 * título dizem o que é, impacto financeiro e operacional dizem quanto pesa,
 * urgência diz quando, confiança diz o quanto acreditar, e a ação leva para a
 * tela que resolve. Faltando qualquer um desses, o item vira aviso — e aviso
 * sem próximo passo é o que ensina o operador a ignorar a fila.
 */
export function PrioridadesAgora({ itens, resumo }: { itens: Prioridade[]; resumo: string }) {
  return (
    <Painel
      titulo="Prioridades agora"
      icone="alvo"
      tom={itens.some((i) => i.severidade === 'critico') ? 'erro' : 'ouro'}
      nota={resumo}
      rodape={{
        nota:
          'Fila ordenada por regra fixa do ERP — severidade, depois impacto. A IA relata esta ordem; não a reordena.',
      }}
    >
      {itens.length === 0 ? (
        <Vazio texto="Nada exige decisão agora. A fila está limpa." icone="check-circulo" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {itens.map((p) => (
            <ItemDaFila key={p.id} p={p} />
          ))}
        </div>
      )}
    </Painel>
  )
}

function ItemDaFila({ p }: { p: Prioridade }) {
  const tom = TOM_DA_SEVERIDADE[p.severidade]
  return (
    <article
      style={{
        display: 'flex',
        gap: 13,
        padding: '13px 14px',
        borderRadius: 12,
        border: `1px solid ${CONTORNO[tom]}`,
        background: VELADO[tom],
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          flex: 'none',
          borderRadius: 9,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(0,0,0,.22)',
          border: `1px solid ${CONTORNO[tom]}`,
          color: TINTA[tom],
        }}
      >
        <Ico n={ICONE_DA_SEVERIDADE[p.severidade]} tamanho={16} />
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span
            className="font-sans"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: TINTA[tom],
            }}
          >
            {ROTULO[p.severidade]}
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.3,
              color: 'var(--color-tinta)',
              textWrap: 'pretty',
            }}
          >
            {p.titulo}
          </span>
        </div>

        {/* Os cinco campos de contexto. Em linha e compactos: são qualificadores
            do título, e empilhá-los faria cada item ocupar meia tela. */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {p.impactoFinanceiro !== null && (
            <Campo rotulo="Impacto">
              <Num tom={tom} tamanho={12.5}>
                {brl(p.impactoFinanceiro)}
              </Num>
            </Campo>
          )}
          <Campo rotulo="Alcance">{p.impactoOperacional}</Campo>
          <Campo rotulo="Urgência">{p.urgencia}</Campo>
          <Campo rotulo="Responsável">{p.responsavel}</Campo>
          <Campo rotulo="Confiança" titulo={p.confianca.motivo}>
            {p.confianca.nivel}
          </Campo>
        </div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', flex: 'none' }}>
        <LinkSeta href={p.proximaAcao.href}>{p.proximaAcao.texto}</LinkSeta>
      </div>
    </article>
  )
}

/** Rótulo minúsculo em cima do valor — o par que o Financeiro usa nas fichas. */
function Campo({
  rotulo,
  children,
  titulo,
}: {
  rotulo: string
  children: React.ReactNode
  titulo?: string
}) {
  return (
    <span
      title={titulo}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
    >
      <Etiqueta>{rotulo}</Etiqueta>
      <span
        className="font-sans"
        style={{
          fontSize: 11.5,
          lineHeight: 1.25,
          color: 'rgba(242,237,227,.72)',
          textWrap: 'pretty',
        }}
      >
        {children}
      </span>
    </span>
  )
}

// ── §7.2 · Briefing executivo ──────────────────────────────────────────────

/**
 * "O que mudou", "O que exige ação", "O que acompanhar".
 *
 * Três colunas, e vazio é resposta legítima em qualquer uma. O escopo é
 * explícito: o briefing não repete indicador estável sem motivo — dizer todo
 * dia "vendeu parecido com ontem" treina o leitor a pular o bloco.
 */
export function BriefingExecutivo({ briefing }: { briefing: Briefing }) {
  const vazio =
    briefing.mudou.length === 0 &&
    briefing.exigeAcao.length === 0 &&
    briefing.acompanhar.length === 0

  return (
    <Painel
      titulo="Briefing executivo"
      icone="documento"
      nota="No máximo cinco assuntos — só o que saiu do normal."
    >
      {vazio ? (
        <Vazio texto="Sem novidade relevante desde a última leitura." icone="check-circulo" />
      ) : (
        <Colunas proporcao="repeat(auto-fit, minmax(230px, 1fr))">
          <ColunaBriefing titulo="O que mudou" icone="tendencia" tom="info" itens={briefing.mudou} />
          <ColunaBriefing
            titulo="O que exige ação"
            icone="alerta"
            tom="atencao"
            itens={briefing.exigeAcao}
          />
          <ColunaBriefing
            titulo="O que acompanhar"
            icone="olho"
            tom="neutro"
            itens={briefing.acompanhar}
          />
        </Colunas>
      )}
    </Painel>
  )
}

function ColunaBriefing({
  titulo,
  icone,
  tom,
  itens,
}: {
  titulo: string
  icone: NomeIcone
  tom: TomUi
  itens: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: TINTA[tom], display: 'grid', placeItems: 'center' }}>
          <Ico n={icone} tamanho={14} />
        </span>
        <Etiqueta>{titulo}</Etiqueta>
      </div>
      {itens.length === 0 ? (
        <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.3)' }}>
          Nada aqui.
        </span>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0 }}>
          {itens.map((t, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, listStyle: 'none' }}>
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  marginTop: 6,
                  flex: 'none',
                  transform: 'rotate(45deg)',
                  background: TINTA[tom],
                  opacity: 0.7,
                }}
              />
              <span
                className="font-sans"
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: 'rgba(242,237,227,.74)',
                  textWrap: 'pretty',
                }}
              >
                {t}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── §3.1 · Resumo executivo do dia ─────────────────────────────────────────

/**
 * Os sete domínios do escopo, em grade conectada.
 *
 * Conectada e não solta porque é UM retrato, não sete cartões independentes: o
 * fio de 1px entre as células é o que diz que eles se leem juntos. É o mesmo
 * tratamento do Dashboard, pela mesma razão.
 */
export function ResumoDoDia({ e }: { e: ResumoExecutivo }) {
  return (
    <Painel titulo="Resumo do dia" icone="grade" nota="Vendas, pedidos, estoque, produção, caixa, margem e CRM." padding="16px 17px 17px">
      <GradeIndicadores conectada minimo={168}>
        <Indicador
          plano
          icone="cifrao"
          tom="ouro"
          rotulo="Vendas"
          valor={brl(e.vendas.valor)}
          nota={e.vendas.rotulo}
        />
        <Indicador
          plano
          icone="carrinho"
          tom="info"
          rotulo="Pedidos"
          valor={String(e.pedidos.qtd)}
          nota={e.pedidos.rotulo}
        />
        <Indicador
          plano
          icone="frasco"
          tom={e.estoque.criticos > 0 ? 'atencao' : 'ok'}
          rotulo="Estoque"
          valor={String(e.estoque.criticos)}
          tomValor={e.estoque.criticos > 0 ? 'atencao' : undefined}
          nota={e.estoque.rotulo}
        />
        <Indicador
          plano
          icone="caixa"
          tom="neutro"
          rotulo="Produção"
          valor={String(e.producao.qtd)}
          nota={e.producao.rotulo}
        />
        <Indicador
          plano
          icone="carteira"
          tom={e.caixa.valor < 0 ? 'erro' : 'ok'}
          rotulo="Caixa"
          valor={brl(e.caixa.valor)}
          tomValor={e.caixa.valor < 0 ? 'erro' : undefined}
          nota={e.caixa.rotulo}
        />
        <Indicador
          plano
          icone="porcento"
          tom={e.margem.pct < 0 ? 'erro' : 'ouro'}
          rotulo="Margem"
          valor={`${e.margem.pct.toFixed(1)}%`}
          tomValor={e.margem.pct < 0 ? 'erro' : undefined}
          nota={e.margem.rotulo}
        />
        <Indicador
          plano
          icone="pessoas"
          tom="roxo"
          rotulo="CRM"
          valor={String(e.crm.qtd)}
          nota={e.crm.rotulo}
        />
      </GradeIndicadores>
    </Painel>
  )
}

/**
 * O aviso de que o Gerente é leitura.
 *
 * Fica na tela, e não só no código, porque a expectativa de quem conversa com
 * um assistente é que ele faça — e descobrir o limite depois de pedir uma
 * alteração é a pior hora de descobrir.
 */
export function ModoDeOperacao({ escrita }: { escrita: boolean }) {
  return (
    <Destaque
      tom={escrita ? 'atencao' : 'info'}
      icone={escrita ? 'cadeado' : 'escudo'}
      titulo={escrita ? 'Ações de escrita liberadas' : 'Modo somente leitura'}
    >
      <span
        className="font-sans"
        style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.68)', textWrap: 'pretty' }}
      >
        {escrita
          ? 'O Gerente pode executar ações registradas, sempre com prévia, confirmação e registro em auditoria.'
          : 'O Gerente consulta, cruza e recomenda — não altera nenhum registro. A trava é arquitetural: não existe ferramenta de escrita disponível para ele, e a política do ERP recusaria a chamada mesmo que existisse.'}
      </span>
    </Destaque>
  )
}
