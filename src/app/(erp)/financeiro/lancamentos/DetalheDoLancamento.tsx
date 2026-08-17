'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition, type ReactNode } from 'react'

import { Ico } from '@/components/erp/IconesUi'
import { Modal } from '@/components/erp/Modal'
import { TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { Chip, Etiqueta, Num, TINTA, type TomUi } from '@/components/erp/ui'
import type { ExplicacaoLancamento, LancamentoIrmao } from '@/data/financeiro'
import {
  brl,
  competenciaPorExtenso,
  FUSO_DA_OPERACAO,
  parseNum,
  plural,
  ROTULO_NATUREZA,
  ROTULO_SITUACAO_LANCAMENTO,
  saldoAberto,
} from '@/domain'
import type { LancamentoGerencial, SituacaoLancamento } from '@/domain'

import { editarLancamento } from '../acoes-gerenciais'
import { CAMPO, Campo, Erro, Previa, Rodape } from '../Compromissos'
import { useListasDeEdicao } from '../ListasDoFormulario'

/**
 * O detalhe de UM lançamento: o que ele é, de onde veio, e a edição no mesmo
 * lugar.
 *
 * A lista responde "o que entrou e o que saiu". Ela não responde a pergunta
 * seguinte, que é a que trava o trabalho: "Tarifa do gateway – YP-15101907",
 * R$ 0,67, saída, sem categoria — que raio é isso, e por que existe? A
 * resposta está espalhada por quatro tabelas (a linha crua do extrato, o
 * pedido que gerou a venda, o irmão que é o crédito da mesma cobrança, a
 * trilha de auditoria) e não cabia em nenhuma coluna.
 *
 * Duas abas, e a inicial não é escolhida por gosto: lançamento SEM CATEGORIA
 * abre direto em Editar, com o foco na categoria. Sem categoria é a fila de
 * trabalho desta tela — quem clica numa dessas linhas já sabe o que vai fazer,
 * e obrigá-lo a ler o dossiê antes cobra um clique por linha classificada.
 *
 * O estado mora na URL (`?lancamento=<id>`) porque é a regra desta tela: com
 * `useState`, o F5 fecharia o painel, o botão Voltar sairia da lista inteira e
 * o alerta do Assessor não teria como apontar para um lançamento específico.
 */

const TOM_SITUACAO: Record<SituacaoLancamento, TomUi> = {
  previsto: 'info',
  agendado: 'neutro',
  vencido: 'erro',
  parcial: 'ouro',
  liquidado: 'ok',
  cancelado: 'neutro',
}

/** O único painel das abas — as duas trocam o conteúdo dele, não o elemento. */
const PAINEL = 'painel-do-lancamento'

/** dd/mm/aaaa a partir de AAAA-MM-DD, sem passar por `Date` (que desloca fuso). */
function diaPt(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

const MOMENTO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DA_OPERACAO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Instante com hora, no fuso da operação.
 *
 * `criado_em` e `atualizado_em` são `timestamptz` e chegam em UTC: cortar a
 * string jogaria tudo que aconteceu depois das 21h para o dia seguinte, e a
 * linha do histórico contradiria a data do movimento logo acima dela.
 */
function instantePt(ts: string | null | undefined): string | null {
  if (!ts) return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : MOMENTO.format(d).replace(',', ' às')
}

export function DetalheDoLancamento({
  lancamento,
  situacao,
  explicacao,
}: {
  lancamento: LancamentoGerencial
  situacao: SituacaoLancamento
  /** Nulo quando o banco não respondeu — a tela diz isso em vez de fingir vazio. */
  explicacao: ExplicacaoLancamento | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  /**
   * Fechar é tirar a chave da URL, e com `replace`: abrir o detalhe já gastou
   * um passo do histórico (o clique na linha é um `Link`), e fechar com
   * `push` faria o botão Voltar reabrir o que a pessoa acabou de fechar.
   */
  const fechar = useCallback(() => {
    const novo = new URLSearchParams(params.toString())
    novo.delete('lancamento')
    const qs = novo.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  const urlDe = (id: string) => {
    const novo = new URLSearchParams(params.toString())
    novo.set('lancamento', id)
    return `${pathname}?${novo.toString()}`
  }

  const semCategoria = !lancamento.categoriaId
  const [aba, setAba] = useState<'detalhe' | 'editar'>(semCategoria ? 'editar' : 'detalhe')

  const falta = saldoAberto(lancamento)

  return (
    <Modal titulo={`Lançamento ${lancamento.id}`} largura={880} aoFechar={fechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Chip tom={lancamento.tipo === 'entrada' ? 'ok' : 'erro'} contorno>
                {lancamento.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
              </Chip>
              <Chip tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO_LANCAMENTO[situacao]}</Chip>
              <Chip tom={lancamento.origem === 'Manual' ? 'neutro' : 'info'} contorno>
                {lancamento.origem}
              </Chip>
              {lancamento.parcela && lancamento.parcelas && (
                <Chip tom="info" contorno>{`Parcela ${lancamento.parcela} de ${lancamento.parcelas}`}</Chip>
              )}
              {lancamento.recorrente && (
                <Chip tom="roxo" contorno>{lancamento.recorrencia ?? 'Recorrente'}</Chip>
              )}
              {lancamento.transferenciaId && <Chip tom="neutro" contorno>Transferência</Chip>}
            </div>
            <TituloSecao tamanho={17}>{lancamento.descricao}</TituloSecao>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Num tamanho={22} tom={lancamento.tipo === 'entrada' ? 'ok' : 'erro'}>
              {brl(lancamento.valor)}
            </Num>
            {falta > 0 && lancamento.recebido > 0 && (
              <Num tamanho={11} tom="ouro" peso={400}>{`faltam ${brl(falta)}`}</Num>
            )}
          </div>
        </div>

        {/* As faixas ficam ACIMA das abas: elas dizem por que este lançamento
            some de um total, e some dos dois lados — quem estiver lendo o
            dossiê precisa saber tanto quanto quem estiver editando. */}
        {semCategoria && (
          <Faixa>
            Sem categoria, este lançamento não entra em nenhuma linha da DRE — o dinheiro se moveu e
            o resultado do mês não sabe do quê. Escolha a categoria na aba Editar.
          </Faixa>
        )}
        {!lancamento.venceEm && falta > 0 && (
          <Faixa>
            Sem data de vencimento, ele fica fora da projeção de caixa: a projeção posiciona cada
            valor no dia em que ele vence, e o que não tem dia não aparece no fluxo.
          </Faixa>
        )}
        {explicacao?.aguardaDestino && (
          <Faixa>
            Este saque ainda não disse para onde foi. Enquanto ninguém resolver o destino, ele fica
            fora do caixa e fora da DRE — a fila está em Financeiro → Repasses.
          </Faixa>
        )}

        <nav
          role="tablist"
          aria-label="Seções do lançamento"
          style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,.07)' }}
        >
          <AbaBotao chave="detalhe" ativa={aba === 'detalhe'} aoClicar={() => setAba('detalhe')}>
            O que é este lançamento
          </AbaBotao>
          <AbaBotao chave="editar" ativa={aba === 'editar'} aoClicar={() => setAba('editar')}>
            Editar
          </AbaBotao>
        </nav>

        {/* Um painel só, com id fixo: os dois `aria-controls` apontavam para
            `painel-detalhe`/`painel-editar` e só um dos dois existia por vez,
            então a aba inativa anunciava ao leitor de tela um alvo que não
            estava no documento. */}
        <div role="tabpanel" id={PAINEL} aria-labelledby={`aba-${aba}`}>
          {aba === 'detalhe' ? (
            <Dossie
              lancamento={lancamento}
              situacao={situacao}
              explicacao={explicacao}
              urlDe={urlDe}
            />
          ) : (
            <Formulario lancamento={lancamento} aoConcluir={fechar} aoCancelar={fechar} />
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Dossiê ─────────────────────────────────────────────────────────────────

function Dossie({
  lancamento: l,
  situacao,
  explicacao: e,
  urlDe,
}: {
  lancamento: LancamentoGerencial
  situacao: SituacaoLancamento
  explicacao: ExplicacaoLancamento | null
  urlDe: (id: string) => string
}) {
  const falta = saldoAberto(l)
  const encargos = l.multa + l.juros
  const veioDoExtrato = l.origem.startsWith('Extrato')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p
        className="font-sans"
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.62,
          color: 'rgba(242,237,227,.72)',
          textWrap: 'pretty',
        }}
      >
        {comoNasceu(l, e).join(' ')}
      </p>

      {!e && (
        <Nota tom="atencao">
          O ERP não conseguiu ler os dados complementares deste lançamento (linha de extrato, pedido
          e histórico). O que está acima veio da própria lista; o resto ficou de fora desta leitura.
        </Nota>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
        <Bloco titulo="Dinheiro">
          <Dado rotulo="Valor" valor={brl(l.valor)} ausente="o registro está sem valor gravado" mono />
          <Dado
            rotulo="Já movimentado"
            valor={l.recebido > 0 ? brl(l.recebido) : null}
            ausente="nada ainda — nenhuma baixa foi registrada"
            mono
          />
          <Dado
            rotulo="Ainda em aberto"
            valor={falta > 0 ? brl(falta) : null}
            ausente={situacao === 'cancelado' ? 'nada — o lançamento foi cancelado' : 'nada — está liquidado'}
            tom={falta > 0 ? 'ouro' : 'ok'}
            mono
          />
          <Dado
            rotulo="Encargos e desconto"
            valor={
              encargos > 0 || l.desconto > 0
                ? [
                    l.multa > 0 && `multa ${brl(l.multa)}`,
                    l.juros > 0 && `juros ${brl(l.juros)}`,
                    l.desconto > 0 && `desconto ${brl(l.desconto)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : null
            }
            ausente="nenhum — a baixa não lançou multa, juros nem desconto"
          />
        </Bloco>

        <Bloco titulo="Datas">
          <Dado
            rotulo="Dia do movimento"
            valor={diaPt(l.ocorridoEm)}
            ausente="o registro está sem data de movimento"
            mono
          />
          <Dado
            rotulo="Competência"
            valor={competenciaPorExtenso(l.competencia.slice(0, 7))}
            ausente="o registro está sem competência — ele não cai em nenhum mês da DRE"
          />
          <Dado
            rotulo="Vencimento"
            valor={diaPt(l.venceEm)}
            ausente="sem data — fora da projeção de caixa"
            mono
          />
          <Dado
            rotulo="Baixado em"
            valor={diaPt(l.baixadoEm)}
            ausente={
              situacao === 'cancelado'
                ? 'nunca — foi cancelado antes de se movimentar'
                : 'ainda não foi baixado'
            }
            mono
          />
          <Dado
            rotulo="Criado em"
            valor={instantePt(e?.criadoEm)}
            ausente={e ? 'o registro não guarda a data de criação' : 'não lido'}
            mono
          />
          <Dado
            rotulo="Última alteração"
            valor={instantePt(e?.atualizadoEm)}
            ausente={e ? 'nunca foi alterado depois de criado' : 'não lido'}
            mono
          />
        </Bloco>

        <Bloco titulo="Classificação">
          <Dado
            rotulo="Categoria"
            // O nome desnormalizado pode faltar num registro classificado; aí
            // vale o id da categoria, que é fato gravado, e não "sem
            // categoria", que seria mentira sobre a DRE.
            valor={l.categoriaId ? (l.categoria ?? l.categoriaId) : null}
            ausente="sem categoria — fica fora da DRE"
          />
          <Dado
            rotulo="Natureza gerencial"
            valor={l.natureza ? ROTULO_NATUREZA[l.natureza] : null}
            ausente={
              l.categoriaId
                ? 'a categoria deste lançamento não tem natureza definida'
                : 'depende da categoria, que ainda não foi escolhida'
            }
          />
          {/* `impactaDre`/`impactaCaixa` nascem de um `?? true` na leitura:
              sem categoria não há o que juntar, e o padrão otimista serve às
              somas da lista. Aqui ele mentia — a faixa dourada no topo diz
              "não entra em nenhuma linha da DRE" e este campo respondia "Sim"
              logo abaixo, na mesma janela, para os mesmos 39 lançamentos que
              esta tela existe para classificar. Sem categoria, quem responde é
              a ausência dela. */}
          <Dado
            rotulo="Entra no resultado (DRE)"
            valor={
              l.categoriaId
                ? l.impactaDre
                  ? 'Sim'
                  : 'Não — a categoria diz que este movimento não é resultado'
                : null
            }
            ausente="não — sem categoria ele fica fora da DRE; quem decide isso é a categoria que ainda falta"
          />
          <Dado
            rotulo="Entra no caixa"
            valor={
              l.categoriaId
                ? l.impactaCaixa
                  ? 'Sim'
                  : 'Não — dinheiro trocando de bolso, não saindo dele'
                : null
            }
            ausente="depende da categoria, que ainda não foi escolhida"
          />
          <Dado
            rotulo="Conta"
            valor={l.conta === '—' ? null : l.conta}
            ausente="o lançamento não aponta para nenhuma conta — ele não entra em saldo nenhum"
          />
          <Dado
            rotulo="Centro de custo"
            valor={l.centroCusto}
            ausente="sem centro de custo — não é obrigatório"
          />
        </Bloco>

        <Bloco titulo="Procedência">
          <Dado rotulo="Origem" valor={l.origem} ausente="o registro não diz de onde veio" />
          <Dado
            rotulo="Criado por"
            valor={e?.criadoPor ?? null}
            ausente={e ? 'o registro não diz quem o criou' : 'não lido'}
          />
          <Dado
            rotulo="Chave externa"
            valor={e?.chaveExterna ?? null}
            ausente={
              e
                ? 'não tem — foi criado dentro do ERP, sem importação por trás'
                : 'não lido'
            }
            mono
          />
          <Dado
            rotulo="Documento fiscal"
            valor={l.documento}
            ausente={
              veioDoExtrato
                ? 'não informado — o extrato do gateway não traz número de nota'
                : 'não informado no cadastro'
            }
          />
          <Dado rotulo="Observação" valor={l.observacao} ausente="sem observação" />
          <Dado rotulo="Identificador no ERP" valor={l.id} ausente="sem identificador" mono />
        </Bloco>
      </div>

      <Extrato lancamento={l} explicacao={e} />
      <Irmaos irmaos={e?.irmaos ?? []} explicacao={e} lancamento={l} urlDe={urlDe} />
      <Pedido explicacao={e} />
      <Historico explicacao={e} />
    </div>
  )
}

/**
 * As frases que explicam o lançamento em português, e só o que é FATO gravado.
 *
 * O que ficou de fora de propósito: "qual regra classificou este lançamento".
 * A tabela `regras_categoria` existe, mas o lançamento não guarda qual regra o
 * tocou — responder isso exigiria casar o texto da descrição com o padrão da
 * regra, o que é chute com cara de rastreabilidade.
 */
function comoNasceu(l: LancamentoGerencial, e: ExplicacaoLancamento | null): string[] {
  const frases: string[] = []
  const veioDoExtrato = l.origem.startsWith('Extrato')

  if (l.origem === 'Manual') {
    frases.push(
      `Foi digitado à mão no ERP${e?.criadoPor ? ` por ${e.criadoPor}` : ''}${
        instantePt(e?.criadoEm) ? `, em ${instantePt(e?.criadoEm)}` : ''
      }.`,
    )
  } else if (veioDoExtrato && e?.extrato) {
    frases.push(
      `Nasceu de uma linha do ${l.origem}: o ERP leu o arquivo do gateway e converteu essa linha neste lançamento. A linha crua está logo abaixo, do jeito que chegou.`,
    )
  } else if (veioDoExtrato && e?.naoLidas.extrato) {
    // Sem a linha lida não dá para escolher entre "nasceu do extrato" e "é
    // derivado": as duas frases afirmam coisas diferentes sobre a origem.
    frases.push(
      `Veio da leitura do ${l.origem}, mas não foi possível ler a linha de extrato para dizer se ele nasceu de um movimento próprio ou foi derivado de outro.`,
    )
  } else if (veioDoExtrato) {
    frases.push(
      `Veio da leitura do ${l.origem}, mas não é uma linha do extrato: é um lançamento DERIVADO, que o ERP criou a partir de outro movimento. É o caso da tarifa cobrada sobre um crédito e da perna de destino de um saque — o gateway informa o valor junto da operação principal, sem uma linha própria para ele.`,
    )
    if (e?.criadoPor?.startsWith('regra:')) {
      frases.push(`Quem o criou foi uma ${e.criadoPor}.`)
    }
  } else {
    frases.push(`Origem registrada: ${l.origem}.`)
  }

  if (l.transferenciaId) {
    frases.push(
      `É uma das duas pernas de uma transferência entre contas próprias${
        e?.contaDestino ? ` (a outra ponta é ${e.contaDestino})` : ''
      }: dinheiro que muda de conta não é receita nem despesa, então ele move o caixa e não mexe no resultado.`,
    )
  }

  if (e?.pedido) {
    frases.push(
      `Está amarrado ao pedido ${e.pedido.id}${
        e.pedido.cliente ? ` — ${e.pedido.cliente}` : ''
      }, vendido pelo canal ${e.pedido.canal} por ${brl(e.pedido.valor)}.`,
    )
  } else if (e?.pedidoId && e.naoLidas.pedido) {
    frases.push(`Aponta para o pedido ${e.pedidoId}, que não foi possível ler agora.`)
  } else if (e?.pedidoId) {
    frases.push(
      `Aponta para o pedido ${e.pedidoId}, mas esse pedido não está mais na base — ele pode ter sido removido depois da importação.`,
    )
  }

  if (l.parcela && l.parcelas) {
    frases.push(
      `É a parcela ${l.parcela} de ${l.parcelas}; a competência de todas é a mesma, porque o fato aconteceu uma vez só.`,
    )
  }
  if (l.recorrente) {
    frases.push(
      `Se repete${l.recorrencia ? ` (${l.recorrencia})` : ''}${
        diaPt(e?.recorrenciaAte) ? `, até ${diaPt(e?.recorrenciaAte)}` : ', sem data final definida'
      }.`,
    )
  }
  if (e?.serieId) frases.push(`Faz parte da série ${e.serieId}.`)
  if (l.canceladoEm) {
    frases.push(
      `Foi cancelado${instantePt(l.canceladoEm) ? ` em ${instantePt(l.canceladoEm)}` : ''}${
        e?.canceladoMotivo ? `: "${e.canceladoMotivo}"` : ' sem motivo registrado'
      }.`,
    )
  }

  return frases
}

function Extrato({
  lancamento: l,
  explicacao: e,
}: {
  lancamento: LancamentoGerencial
  explicacao: ExplicacaoLancamento | null
}) {
  const linha = e?.extrato ?? null

  if (!linha) {
    if (!e) return null
    // Leitura que falhou não vira "não tem linha de extrato": essa frase é uma
    // afirmação sobre a origem do dinheiro, e ela seria falsa por um timeout.
    if (e.naoLidas.extrato) {
      return (
        <Secao titulo="Linha do extrato">
          <Nota tom="atencao">
            Não foi possível ler a linha de extrato deste lançamento — a consulta ao banco falhou.
            Não dá para dizer daqui se ela existe; recarregue a página para tentar de novo.
          </Nota>
        </Secao>
      )
    }
    return (
      <Secao titulo="Linha do extrato">
        <Nota tom="neutro">
          {l.origem.startsWith('Extrato')
            ? `Este lançamento não tem linha própria no extrato: ele foi derivado de outro movimento da leitura do ${l.origem}.${
                // A promessa só é feita quando há o que mostrar: dizer "veja os
                // irmãos abaixo" e não listar nenhum é mandar procurar o que
                // não existe.
                e.irmaos.length > 0
                  ? ' Os lançamentos ligados a ele, logo abaixo, mostram a operação de onde ele saiu.'
                  : ''
              }`
            : 'Não existe linha de extrato: este lançamento foi criado dentro do ERP, não veio de arquivo de gateway nenhum.'}
        </Nota>
      </Secao>
    )
  }

  return (
    <Secao titulo="Linha do extrato, como o gateway mandou">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0 16px' }}>
        <Dado rotulo="Arquivo de origem" valor={linha.origem} ausente="a linha não diz de qual arquivo veio" mono />
        <Dado rotulo="Chave da linha" valor={linha.chave} ausente="a linha não tem chave de importação" mono />
        <Dado rotulo="Data no extrato" valor={diaPt(linha.ocorridoEm)} ausente="a linha veio sem data" mono />
        <Dado
          rotulo="Valor no extrato"
          valor={`${linha.tipo === 'entrada' ? '↑' : '↓'} ${brl(linha.valor)}`}
          ausente="a linha veio sem valor"
          mono
        />
        <Dado rotulo="Descrição no extrato" valor={linha.descricao} ausente="sem descrição no arquivo" />
        <Dado rotulo="Contraparte" valor={linha.contraparte || null} ausente="o arquivo não informou contraparte" />
        <Dado rotulo="Documento na origem" valor={linha.documento || null} ausente="o arquivo não trouxe documento" mono />
        <Dado rotulo="Lida em" valor={instantePt(linha.lidoEm)} ausente="a importação não gravou a data de leitura" mono />
      </div>

      {linha.detalhesDoGateway.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <Etiqueta>O que o gateway informou junto</Etiqueta>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0 16px' }}>
            {linha.detalhesDoGateway.map((d) => (
              <Dado key={d.rotulo} rotulo={d.rotulo} valor={d.valor} ausente="não informado" mono />
            ))}
          </div>
        </div>
      )}

      {linha.ignorado && (
        <Nota tom="atencao">
          {`Esta linha está marcada como ignorada na conciliação${
            linha.motivoIgnorado ? `: "${linha.motivoIgnorado}"` : ' sem motivo registrado'
          }.`}
        </Nota>
      )}
      {linha.interno && (
        <Nota tom="neutro">
          O extrato marcou esta linha como movimento interno — dinheiro andando entre contas
          próprias, e não venda nem despesa.
        </Nota>
      )}
    </Secao>
  )
}

function Irmaos({
  irmaos,
  explicacao: e,
  lancamento: l,
  urlDe,
}: {
  irmaos: LancamentoIrmao[]
  explicacao: ExplicacaoLancamento | null
  lancamento: LancamentoGerencial
  urlDe: (id: string) => string
}) {
  // Sem pedido e sem transferência não há o que ligar: um lançamento manual
  // avulso não tem irmão nenhum, e uma seção vazia sugeriria que falta dado.
  if (!e || (!e.pedidoId && !l.transferenciaId)) return null

  return (
    <Secao titulo="Lançamentos ligados a este">
      {e.naoLidas.irmaos ? (
        // "Nenhum irmão" e "não consegui perguntar" davam a mesma tela, e a
        // segunda mandava conferir uma importação que pode estar perfeita.
        <Nota tom="atencao">
          Não foi possível ler os lançamentos ligados a este — a consulta ao banco falhou. A lista
          abaixo não está vazia por não existirem: ela está vazia por não ter sido lida.
        </Nota>
      ) : irmaos.length === 0 ? (
        <Nota tom="neutro">
          {e.pedidoId
            ? `Nenhum outro lançamento aponta para o pedido ${e.pedidoId}. Este é o único movimento financeiro registrado para ele.`
            : 'A outra perna desta transferência não foi encontrada — um par incompleto significa saldo consolidado errado, e vale conferir a importação.'}
        </Nota>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {irmaos.map((i) => (
            <Link
              key={i.id}
              href={urlDe(i.id)}
              scroll={false}
              className="font-sans hover:border-ouro/40"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 10,
                textDecoration: 'none',
                background: 'rgba(255,255,255,.015)',
              }}
            >
              <span style={{ color: i.tipo === 'entrada' ? TINTA.ok : TINTA.erro, flex: 'none' }}>
                <Ico n={i.tipo === 'entrada' ? 'entrada' : 'saida'} tamanho={14} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'rgba(242,237,227,.88)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {i.descricao}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(242,237,227,.4)' }}>
                  {[
                    diaPt(i.ocorridoEm),
                    i.conta,
                    i.categoria ?? 'sem categoria',
                    i.vinculo === 'pedido' ? 'mesmo pedido' : 'outra perna da transferência',
                    i.cancelado ? 'cancelado' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Num tamanho={12} tom={i.tipo === 'entrada' ? 'ok' : 'erro'}>
                {brl(i.valor)}
              </Num>
            </Link>
          ))}
        </div>
      )}
    </Secao>
  )
}

function Pedido({ explicacao: e }: { explicacao: ExplicacaoLancamento | null }) {
  if (!e?.pedidoId) return null
  const p = e.pedido

  return (
    <Secao titulo="Pedido que originou este lançamento">
      {e.naoLidas.pedido ? (
        // Dizer "o pedido não está mais na base" quando a consulta caiu é
        // acusar a importação de ter perdido uma venda que está lá.
        <Nota tom="atencao">
          {`Não foi possível ler o pedido ${e.pedidoId} — a consulta ao banco falhou. Isso não quer dizer que ele sumiu; recarregue a página para tentar de novo.`}
        </Nota>
      ) : !p ? (
        <Nota tom="atencao">
          {`O lançamento aponta para o pedido ${e.pedidoId}, mas ele não está mais na base de pedidos.`}
        </Nota>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0 16px' }}>
            <Dado rotulo="Pedido" valor={p.id} ausente="sem número" mono />
            <Dado rotulo="Cliente" valor={p.cliente} ausente="o pedido não tem cliente vinculado" />
            <Dado rotulo="Canal" valor={p.canal} ausente="o pedido não registra canal de venda" />
            <Dado rotulo="Pagamento" valor={p.pagamento} ausente="o pedido não registra estado de pagamento" />
            <Dado rotulo="Situação" valor={p.situacao} ausente="o pedido não tem situação registrada" />
            <Dado rotulo="Gateway" valor={p.gateway} ausente="venda sem gateway integrado" />
            <Dado rotulo="Valor do pedido" valor={brl(p.valor)} ausente="o pedido está sem valor" mono />
            <Dado
              rotulo="Comprado em"
              valor={instantePt(p.compradoEm)}
              ausente="o pedido não registra a data da compra"
              mono
            />
            <Dado rotulo="Frete" valor={p.frete > 0 ? brl(p.frete) : null} ausente="sem frete cobrado" mono />
            <Dado
              rotulo="Cashback usado"
              valor={p.cashback > 0 ? brl(p.cashback) : null}
              ausente="nenhum cashback foi usado"
              mono
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
            <Etiqueta>{`Itens do pedido — ${plural(p.itens.length, 'item', 'itens')}`}</Etiqueta>
            {p.itens.length === 0 ? (
              <Nota tom="neutro">
                O pedido está na base sem itens — a importação trouxe o cabeçalho e não os produtos.
              </Nota>
            ) : (
              p.itens.map((i, idx) => (
                <div
                  key={`${i.descricao}-${idx}`}
                  className="font-sans"
                  style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 11.5 }}
                >
                  <span style={{ color: 'rgba(242,237,227,.75)', flex: 1, minWidth: 0 }}>
                    {`${i.quantidade}× ${i.descricao}${i.variante ? ` · ${i.variante}` : ''}`}
                  </span>
                  <Num tamanho={11.5}>{brl(i.preco)}</Num>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Secao>
  )
}

function Historico({ explicacao: e }: { explicacao: ExplicacaoLancamento | null }) {
  if (!e) return null

  return (
    <Secao titulo="Histórico de alterações">
      {e.naoLidas.historico ? (
        // Trilha de auditoria é o único lugar do ERP onde "nada aconteceu"
        // precisa ser verdade para servir de prova. Se a leitura falhou, ela
        // não prova nada, e tem que dizer isso.
        <Nota tom="atencao">
          Não foi possível ler a trilha de auditoria — a consulta ao banco falhou. Esta seção NÃO
          está dizendo que o lançamento nunca foi alterado; está dizendo que não deu para conferir.
        </Nota>
      ) : e.historico.length === 0 ? (
        <Nota tom="neutro">
          Nenhuma alteração registrada. A trilha de auditoria só grava edição feita por gente dentro
          do ERP — o que veio da importação do extrato entrou direto, sem passar por ela.
        </Nota>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {e.historico.map((h) => (
            <div
              key={h.id}
              className="font-sans"
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 11.5 }}
            >
              <Num tamanho={10.5} peso={400}>
                {instantePt(h.ocorridoEm) ?? h.ocorridoEm}
              </Num>
              <span style={{ color: 'rgba(242,237,227,.75)', flex: 1, minWidth: 0 }}>
                {h.justificativa ?? h.acao}
              </span>
              <span style={{ fontSize: 10.5, color: 'rgba(242,237,227,.42)' }}>
                {h.operador ?? 'operador não registrado'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Secao>
  )
}

// ── Edição ─────────────────────────────────────────────────────────────────

/**
 * A mesma edição do lápis da linha, agora dentro do detalhe — e com a
 * categoria em primeiro lugar.
 *
 * As travas abaixo espelham as regras de `editarLancamento`: a tela não decide
 * nada sozinha, ela só antecipa a recusa do servidor para o campo não parecer
 * editável e recusar depois do clique. Quando o servidor recusa por um motivo
 * que a tela não tem como saber (competência fechada, categoria inativada por
 * outra pessoa), a mensagem dele aparece aqui, inteira.
 */
function Formulario({
  lancamento: l,
  aoConcluir,
  aoCancelar,
}: {
  lancamento: LancamentoGerencial
  aoConcluir: () => void
  aoCancelar: () => void
}) {
  const { contas, categorias, centros } = useListasDeEdicao()

  const [descricao, setDescricao] = useState(l.descricao)
  const [favorecido, setFavorecido] = useState(l.favorecido ?? '')
  const [valor, setValor] = useState(l.valor.toFixed(2).replace('.', ','))
  const [venceEm, setVenceEm] = useState(l.venceEm ?? '')
  const [categoriaId, setCategoriaId] = useState(l.categoriaId ?? '')
  const [contaId, setContaId] = useState(l.contaId)
  const [centroCusto, setCentroCusto] = useState(l.centroCusto ?? '')
  const [documento, setDocumento] = useState(l.documento ?? '')
  const [observacao, setObservacao] = useState(l.observacao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // Cancelado não se edita — a ação recusa, e um formulário que só sabe
  // recusar é botão inerte com campos em volta.
  if (l.canceladoEm) {
    return (
      <Nota tom="atencao">
        Este lançamento está cancelado e não pode ser editado: reabri-lo pela edição devolveria vida
        a um compromisso que alguém encerrou de propósito. Se ele precisa voltar a valer, crie um
        novo compromisso no lugar dele.
      </Nota>
    )
  }

  if (!contas || !categorias) {
    return (
      <Nota tom="atencao">
        As listas de contas e categorias não chegaram a esta tela, então o formulário abriria com
        combos vazios e gravaria classificação errada. Recarregue a página.
      </Nota>
    )
  }

  const ehTransferencia = Boolean(l.transferenciaId)
  const veioDoExtrato = l.origem.startsWith('Extrato ')
  const jaBaixado = Boolean(l.baixadoEm)

  const travaValor = ehTransferencia || jaBaixado
  const motivoValor = ehTransferencia
    ? 'Perna de transferência: mudar só um lado desequilibraria o par'
    : 'Já baixado: o saldo da conta foi calculado com este valor'
  const travaConta = ehTransferencia || veioDoExtrato
  const motivoConta = ehTransferencia
    ? 'Perna de transferência: a conta faz parte do par'
    : `Veio do extrato (${l.origem}) e pertence à conta em que o movimento apareceu`

  // A natureza da categoria decide de que lado ela pode aparecer: despesa
  // classificada como receita não é erro de digitação, é faturamento inventado
  // na DRE. A categoria atual entra na lista mesmo inativa, senão o select
  // trocaria a classificação sozinho ao abrir.
  const disponiveis = categorias.filter((c) => {
    if (!c.ativa && c.id !== l.categoriaId) return false
    if (c.natureza === 'transferencia') return ehTransferencia
    return l.tipo === 'entrada'
      ? c.natureza === 'receita_operacional' || c.natureza === 'aporte_retirada'
      : c.natureza !== 'receita_operacional'
  })
  const escolhida = disponiveis.find((c) => c.id === categoriaId)

  const salvar = () =>
    iniciar(async () => {
      setErro(null)
      setAviso(null)
      const r = await editarLancamento(l.id, {
        descricao,
        favorecido,
        valor: travaValor ? l.valor : parseNum(valor),
        venceEm,
        categoriaId,
        contaId: travaConta ? l.contaId : contaId,
        centroCusto: centroCusto || null,
        documento,
        observacao,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      // "Gravou" e "não mudou nada" são respostas diferentes, e a ação as
      // distingue. Fechar nas duas ensinaria que salvar sempre funciona — e o
      // dia em que o campo não for gravado, ninguém desconfia.
      if (r.alteracoes === 0) {
        setAviso('Nada foi gravado: os campos estão iguais aos que já estavam no lançamento.')
        return
      }
      aoConcluir()
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {disponiveis.length === 0 && (
        <Nota tom="atencao">
          {`Nenhuma categoria cadastrada serve para ${
            l.tipo === 'entrada' ? 'uma entrada' : 'uma saída'
          } deste tipo, então não há o que escolher aqui. Cadastre a categoria em Financeiro → Categorias e volte.`}
        </Nota>
      )}

      {/* A categoria vem primeiro, sozinha na linha e mais alta que os outros
          campos: é ela que traz quem abre este formulário, e era o único campo
          que exigia rolar o diálogo antigo até o meio para achar. */}
      <Campo
        rotulo="Categoria"
        dica={
          escolhida
            ? `${ROTULO_NATUREZA[escolhida.natureza]} · é ela que decide em que linha da DRE este valor entra`
            : categoriaId
              ? // Acontece quando a classificação atual não bate com o tipo do
                // lançamento (receita numa saída, por exemplo): o select não
                // tem essa opção para mostrar, e sem esta linha ele pareceria
                // exibir uma categoria que ninguém escolheu.
                `A categoria gravada (${categoriaId}) não vale para este tipo de lançamento e por isso não aparece na lista. Escolha uma que valha.`
              : 'Sem categoria, o lançamento fica fora da DRE'
        }
      >
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          // Foco na categoria quando ela é o que falta: quem abriu a fila de
          // sem-categoria já pode digitar a primeira letra e seguir.
          autoFocus={!l.categoriaId}
          style={{
            ...CAMPO,
            height: 42,
            fontSize: 13,
            border: categoriaId ? `1px solid ${COR.ouro}44` : `1px solid ${COR.ouro}88`,
            background: categoriaId ? CAMPO.background : 'rgba(233,197,131,.06)',
          }}
        >
          {/* A opção vazia só existe para quem ainda não tem categoria: tirar a
              classificação de um lançamento já classificado o faria sumir da
              DRE, e não há motivo para oferecer isso. */}
          {!l.categoriaId && <option value="">Escolha a categoria…</option>}
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 12 }}>
        <Campo rotulo="Descrição">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} style={CAMPO} />
        </Campo>
        <Campo rotulo="Valor" dica={travaValor ? motivoValor : 'Maior que zero'}>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            disabled={travaValor}
            style={{ ...CAMPO, opacity: travaValor ? 0.5 : 1, cursor: travaValor ? 'not-allowed' : 'text' }}
          />
        </Campo>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
        <Campo rotulo={l.tipo === 'entrada' ? 'Pagador' : 'Favorecido'}>
          <input
            value={favorecido}
            onChange={(e) => setFavorecido(e.target.value)}
            placeholder="Quem recebe ou paga"
            style={CAMPO}
          />
        </Campo>
        <Campo rotulo="Vencimento" dica="A data que a projeção de caixa usa">
          <input
            type="date"
            value={venceEm}
            onChange={(e) => setVenceEm(e.target.value)}
            style={{ ...CAMPO, colorScheme: 'dark' }}
          />
        </Campo>
        <Campo rotulo="Conta" dica={travaConta ? motivoConta : undefined}>
          <select
            value={contaId}
            onChange={(e) => setContaId(e.target.value)}
            disabled={travaConta}
            style={{ ...CAMPO, opacity: travaConta ? 0.5 : 1, cursor: travaConta ? 'not-allowed' : 'pointer' }}
          >
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
        <Campo rotulo="Centro de custo">
          <select value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} style={CAMPO}>
            <option value="">Sem centro de custo</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Documento" dica="NF, boleto ou recibo">
          <input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="NF 1234"
            style={CAMPO}
          />
        </Campo>
        <Campo rotulo="Observação">
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Contexto que ajuda a conferir depois"
            style={CAMPO}
          />
        </Campo>
      </div>

      <Previa
        linhas={[
          {
            rotulo: 'Valor',
            valor: brl(travaValor ? l.valor : parseNum(valor)),
            tom: l.tipo === 'entrada' ? COR.ok : COR.erro,
          },
          {
            rotulo: 'Entra na projeção de caixa em',
            valor: diaPt(venceEm) ?? 'sem data — fica fora da projeção',
            tom: venceEm ? undefined : COR.ouro,
          },
          {
            rotulo: 'Entra na DRE como',
            // Três estados, não dois. `escolhida` é undefined tanto para "não
            // tem categoria" quanto para "tem uma que o select não mostra
            // porque a natureza não bate com o tipo" — e são 62 entradas
            // classificadas hoje como despesa administrativa. Juntar os dois
            // fazia a prévia prometer que a gravação tiraria da DRE um
            // lançamento que continua nela, classificado.
            valor: escolhida
              ? escolhida.nome
              : categoriaId
                ? `${l.categoria ?? categoriaId} — a classificação atual continua valendo se você não trocar`
                : 'sem categoria — fica fora da DRE',
            tom: escolhida ? undefined : COR.ouro,
          },
        ]}
      />

      {aviso && <Nota tom="neutro">{aviso}</Nota>}
      <Erro texto={erro} />
      <Rodape
        rotulo="Salvar alterações"
        aoConfirmar={salvar}
        aoCancelar={aoCancelar}
        pendente={pendente}
      />
    </div>
  )
}

// ── Peças ──────────────────────────────────────────────────────────────────

function AbaBotao({
  chave,
  ativa,
  aoClicar,
  children,
}: {
  chave: string
  ativa: boolean
  aoClicar: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`aba-${chave}`}
      aria-selected={ativa}
      aria-controls={PAINEL}
      onClick={aoClicar}
      className="font-sans"
      style={{
        height: 34,
        padding: '0 12px',
        border: 0,
        background: 'transparent',
        borderBottom: `2px solid ${ativa ? COR.ouro : 'transparent'}`,
        color: ativa ? COR.ouro : 'var(--color-secundario)',
        fontWeight: 600,
        fontSize: 12,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <Etiqueta>{titulo}</Etiqueta>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingTop: 14,
        borderTop: '1px solid rgba(255,255,255,.06)',
        minWidth: 0,
      }}
    >
      <Etiqueta>{titulo}</Etiqueta>
      {children}
    </section>
  )
}

/**
 * Rótulo → valor de leitura.
 *
 * `ausente` é obrigatório e não tem padrão: um campo vazio nesta tela sempre
 * diz POR QUE está vazio. O traço mudo era o pior desfecho possível — ele
 * parece campo previsto que ninguém preencheu, quando quase sempre significa
 * "o extrato do gateway não manda esse dado".
 */
function Dado({
  rotulo,
  valor,
  ausente,
  tom,
  mono,
}: {
  rotulo: string
  valor: ReactNode | null
  ausente: string
  tom?: TomUi
  mono?: boolean
}) {
  const vazio = valor === null || valor === undefined || valor === ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, paddingBottom: 4 }}>
      <Etiqueta style={{ fontSize: 9, letterSpacing: '.1em' }}>{rotulo}</Etiqueta>
      <span
        className={mono && !vazio ? 'font-mono' : 'font-sans'}
        style={{
          fontSize: vazio ? 11 : 12,
          lineHeight: 1.45,
          fontStyle: vazio ? 'italic' : undefined,
          color: vazio
            ? 'rgba(242,237,227,.4)'
            : tom
              ? TINTA[tom]
              : 'rgba(242,237,227,.86)',
          overflowWrap: 'anywhere',
          textWrap: 'pretty',
        }}
      >
        {vazio ? ausente : valor}
      </span>
    </div>
  )
}

/** Faixa dourada: o lançamento está fora de um total, e a tela diz de qual. */
function Faixa({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-sans"
      style={{
        margin: 0,
        padding: '10px 12px',
        border: '1px solid rgba(233,197,131,.28)',
        borderRadius: 10,
        background: 'rgba(233,197,131,.06)',
        fontSize: 11.5,
        lineHeight: 1.5,
        color: COR.ouro,
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  )
}

function Nota({ tom, children }: { tom: 'neutro' | 'atencao'; children: ReactNode }) {
  return (
    <p
      className="font-sans"
      style={{
        margin: 0,
        padding: '9px 11px',
        border: `1px solid ${tom === 'atencao' ? 'rgba(233,197,131,.22)' : 'rgba(255,255,255,.07)'}`,
        borderRadius: 9,
        background: tom === 'atencao' ? 'rgba(233,197,131,.045)' : 'rgba(255,255,255,.015)',
        fontSize: 11.5,
        lineHeight: 1.55,
        color: tom === 'atencao' ? 'rgba(233,197,131,.85)' : 'rgba(242,237,227,.6)',
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  )
}
