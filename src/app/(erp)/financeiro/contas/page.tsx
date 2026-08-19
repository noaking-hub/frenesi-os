import Link from 'next/link'

import {
  Bolinha,
  Chip,
  Destaque,
  LinkSeta,
  ComTrilha,
  Etiqueta,
  Ferramentas,
  GradeIndicadores,
  Ico,
  Indicador,
  LinhaValor,
  Num,
  Painel,
  Pilha,
  Segmentado,
  TINTA,
  Vazio,
} from '@/components/erp/ui'
import type { NomeIcone } from '@/components/erp/ui'
import { TileMarca } from '@/components/erp/Marcas'
import { Mini, PALETA, RoscaLegenda } from '@/components/erp/Visualizacoes'
import { lerContas, lerLancamentos } from '@/data/financeiro'
import {
  brl,
  concentracao,
  diaCurtoPt,
  divergenciaDeSaldo,
  horasDesdeSincronia,
  plural,
  saldoAberto,
} from '@/domain'
import type { ContaFinanceira, LancamentoGerencial } from '@/domain'

import { EditarConta, InformarSaldo, NovaConta, Transferir } from './Acoes'

/**
 * Contas e Caixas — onde o dinheiro está, e o quanto disso é confiável.
 *
 * A tela responde duas perguntas que andam juntas: quanto tem em cada lugar e
 * DE ONDE veio esse número. Um saldo lido pela API do banco e um saldo somado
 * pelo ERP a partir do extrato têm confiabilidades diferentes — mostrar os
 * dois com a mesma tipografia esconde exatamente o que decide se dá para
 * pagar o boleto hoje.
 */
export const dynamic = 'force-dynamic'

// A ordenação vive na URL para o F5 e o link compartilhado manterem o recorte.
const ORDENS = [
  { id: 'posicao', rotulo: 'Posição' },
  { id: 'saldo', rotulo: 'Saldo' },
  { id: 'nome', rotulo: 'Nome' },
  { id: 'atualizacao', rotulo: 'Atualização' },
] as const

type Ordem = (typeof ORDENS)[number]['id']

export default async function ContasECaixas({
  searchParams,
}: {
  searchParams: Promise<{ ordem?: string }>
}) {
  const sp = await searchParams
  const ordem: Ordem = ORDENS.some((o) => o.id === sp.ordem) ? (sp.ordem as Ordem) : 'posicao'

  const [contas, lancamentos] = await Promise.all([lerContas(), lerLancamentos()])

  if (contas.length === 0) {
    return (
      <Pilha>
        <Ferramentas direita={<NovaConta />} />
        <Painel>
          <Vazio
            icone="banco"
            texto="Nenhuma conta cadastrada. Cadastre a conta bancária e a carteira do gateway para o Financeiro ter onde somar."
          />
        </Painel>
      </Pilha>
    )
  }

  const ativas = contas.filter((c) => c.ativa)
  const consolidado = ativas.reduce((a, c) => a + c.saldoDisponivel, 0)
  const entradas30 = ativas.reduce((a, c) => a + c.entradas30d, 0)
  const saidas30 = ativas.reduce((a, c) => a + c.saidas30d, 0)

  // Comprometido = o que já está nas contas mas não é gastável: bloqueado
  // pelo banco ou aguardando liquidação do gateway. É dinheiro visível no
  // saldo do app que ainda não paga boleto.
  const comprometido = ativas.reduce((a, c) => a + c.saldoALiquidar + c.saldoBloqueado, 0)

  // "Livre depois de pagar" desconta as contas a pagar em aberto: é o único
  // número da linha que autoriza uma decisão, e por isso muda de cor.
  const vivos = lancamentos.filter((l) => !l.canceladoEm && saldoAberto(l) > 0)
  const aPagar = vivos.filter((l) => l.tipo === 'saida').reduce((a, l) => a + saldoAberto(l), 0)
  const livre = consolidado - aPagar

  const conectadas = ativas.filter((c) => c.origemSaldo === 'api').length
  const agora = Date.now()

  const pctDoConsolidado = (parte: number) =>
    `${((parte / consolidado) * 100).toFixed(1).replace('.', ',')}% do saldo consolidado`

  // ── Alertas: só o que os dados sustentam ─────────────────────────────────
  const negativas = ativas.filter((c) => c.saldoDisponivel < 0)

  const divergentes = ativas
    .map((c) => ({ conta: c, dif: divergenciaDeSaldo(c) }))
    .filter((x): x is { conta: ContaFinanceira; dif: number } => x.dif !== null && Math.abs(x.dif) > 0.05)

  const desatualizadas = ativas
    .map((c) => ({ conta: c, horas: horasDesdeSincronia(c, agora) }))
    .filter((x): x is { conta: ContaFinanceira; horas: number } => x.horas !== null && x.horas >= 24)

  const comALiquidar = ativas.filter((c) => c.saldoALiquidar > 0)

  const totalAlertas =
    negativas.length + divergentes.length + desatualizadas.length + comALiquidar.length

  // Movimento diário por conta, para a faixa de tendência de cada linha. Sai
  // dos lançamentos já baixados — é o único histórico que o ERP tem sem
  // guardar snapshot de saldo.
  const serie = serieDiariaPorConta(lancamentos)

  // A ordenação não separa ativas de inativas de propósito: a lista é o
  // inventário completo, e a inativa aparece apagada onde a ordem a colocar.
  const ordenadas = [...contas]
  if (ordem === 'saldo') ordenadas.sort((a, b) => b.saldoDisponivel - a.saldoDisponivel)
  else if (ordem === 'nome') ordenadas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  else if (ordem === 'atualizacao')
    ordenadas.sort((a, b) => (b.sincronizadoEm ?? '').localeCompare(a.sincronizadoEm ?? ''))

  // O carimbo do rodapé usa a leitura mais RECENTE entre as contas: é a
  // resposta honesta para "isso aqui está atualizado?".
  const maisRecente = ativas
    .map((c) => c.sincronizadoEm)
    .filter(Boolean)
    .sort()
    .at(-1)
  // Sempre em Brasília: o servidor roda em UTC e sem o fuso o carimbo
  // mostrava hora do futuro.
  const ultimaLeitura = maisRecente
    ? `${new Date(maisRecente).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${new Date(maisRecente).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
    : null

  // O atalho "Registrar saldo" da trilha age sobre a conta padrão: é a que o
  // dono confere no app do banco todo dia.
  const contaPadrao = ativas.find((c) => c.principal) ?? ativas[0]

  return (
    <Pilha gap={16}>
      <GradeIndicadores>
        <Indicador
          icone="carteira"
          tom="ouro"
          rotulo="Saldo consolidado"
          valor={brl(consolidado)}
          tomValor={consolidado > 0 ? 'ok' : 'erro'}
          nota={plural(ativas.length, 'conta ativa somada', 'contas ativas somadas')}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entradas no período"
          valor={brl(entradas30)}
          nota="Baixado nos últimos 30 dias"
          tomNota="ok"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saídas no período"
          valor={brl(saidas30)}
          nota="Baixado nos últimos 30 dias"
          tomNota="erro"
        />
        <Indicador
          icone="cadeado"
          tom="atencao"
          rotulo="Comprometido"
          valor={brl(comprometido)}
          nota={consolidado > 0 ? pctDoConsolidado(comprometido) : 'Bloqueado ou aguardando liquidação'}
        />
        <Indicador
          icone="escudo"
          tom={livre > 0 ? 'ok' : 'erro'}
          rotulo="Livre depois de pagar"
          valor={brl(livre)}
          tomValor={livre > 0 ? 'ok' : 'erro'}
          nota={
            consolidado > 0
              ? pctDoConsolidado(livre)
              : 'Disponível menos contas a pagar em aberto'
          }
        />
        <Indicador
          icone="elo"
          tom={conectadas === ativas.length ? 'ok' : 'info'}
          rotulo="Contas conectadas"
          valor={`${conectadas} de ${ativas.length}`}
          nota={
            ativas.length > 0
              ? `${Math.round((conectadas / ativas.length) * 100)}% conectadas via API`
              : 'Nenhuma conta ativa'
          }
          tomNota={conectadas === ativas.length ? 'ok' : 'neutro'}
        />
      </GradeIndicadores>

      <Ferramentas direita={<NovaConta />} />

      <ComTrilha
        largura={330}
        trilha={
          <>
            <Painel titulo="Movimentações rápidas" icone="faisca">
              {/* Grade 2×2 como no mockup: duas ações de modal e dois links
                  para as telas que completam o fluxo. Nada aqui é inerte. */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                  gap: 9,
                }}
              >
                <Transferir contas={ativas} atalho />
                {contaPadrao && <InformarSaldo conta={contaPadrao} atalho />}
                <AtalhoLink
                  href="/financeiro/extrato"
                  icone="documento"
                  titulo="Conciliar extrato"
                  sub="Verificar lançamentos pendentes"
                />
                <AtalhoLink
                  href="/financeiro/dre"
                  icone="balanca"
                  titulo="Conferir o resultado"
                  sub="DRE do mês por competência e caixa"
                />
              </div>
            </Painel>

            <Painel titulo="Distribuição do saldo por conta" icone="pizza" tom="ciano">
              {consolidado > 0 ? (
                <>
                  <RoscaLegenda
                    fatias={ativas
                      .filter((c) => c.saldoDisponivel > 0)
                      .map((c, i) => ({
                        rotulo: c.nome,
                        valor: c.saldoDisponivel,
                        cor: c.cor ?? PALETA[i % PALETA.length],
                      }))}
                    total={consolidado}
                    legendaTotal="Caixa total"
                    formatar={brl}
                    tamanho={140}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      paddingTop: 10,
                      borderTop: '1px solid rgba(255,255,255,.05)',
                    }}
                  >
                    <Etiqueta>Total</Etiqueta>
                    <div style={{ flex: 1 }} />
                    <Num tamanho={13} tom="ouro">
                      {brl(consolidado)}
                    </Num>
                  </div>
                </>
              ) : (
                <Vazio icone="pizza" texto="Nenhuma conta com saldo positivo." />
              )}
            </Painel>

            <Painel
              titulo="Alertas das contas"
              icone="sino"
              tom={totalAlertas > 0 ? 'atencao' : 'ok'}
              rodape={
                totalAlertas > 0
                  ? {
                      nota: plural(totalAlertas, 'alerta no total', 'alertas no total'),
                      link: { href: '/financeiro/extrato', texto: 'Abrir extrato' },
                    }
                  : undefined
              }
            >
              {totalAlertas === 0 ? (
                <Vazio icone="check-circulo" texto="Nenhuma conta pede atenção agora." />
              ) : (
                <Pilha gap={0}>
                  {negativas.map((c) => (
                    <LinhaValor
                      key={`n-${c.id}`}
                      icone="alerta-circulo"
                      tomIcone="erro"
                      rotulo={`Saldo negativo em ${c.nome}`}
                      nota="A conta está descoberta"
                      valor={brl(c.saldoDisponivel)}
                      tom="erro"
                    />
                  ))}
                  {divergentes.map(({ conta, dif }) => (
                    <LinhaValor
                      key={`d-${conta.id}`}
                      icone="alerta"
                      tomIcone="erro"
                      rotulo={`${conta.nome}: saldo divergente`}
                      nota="Informado não bate com o somado do extrato"
                      valor={`${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))}`}
                      tom="erro"
                    />
                  ))}
                  {desatualizadas.map(({ conta, horas }) => (
                    <LinhaValor
                      key={`s-${conta.id}`}
                      icone="relogio"
                      tomIcone="atencao"
                      rotulo={`${conta.nome} sem atualização`}
                      nota="O saldo exibido pode estar velho"
                      valor={`há ${horas} h`}
                      tom="atencao"
                    />
                  ))}
                  {comALiquidar.map((c) => (
                    <LinhaValor
                      key={`l-${c.id}`}
                      icone="ampulheta"
                      tomIcone="info"
                      rotulo={`A liquidar em ${c.nome}`}
                      nota="Recebido, mas ainda indisponível para uso"
                      valor={brl(c.saldoALiquidar)}
                      tom="info"
                    />
                  ))}
                </Pilha>
              )}
            </Painel>
          </>
        }
      >
        <Painel
          titulo="Contas e carteiras"
          icone="banco"
          acao={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Etiqueta>Ordenar por</Etiqueta>
              <Segmentado
                opcoes={[...ORDENS]}
                ativo={ordem}
                base="/financeiro/contas"
                chave="ordem"
              />
            </span>
          }
        >
          <Pilha gap={10}>
            {ordenadas.map((c) => (
              <LinhaConta
                key={c.id}
                conta={c}
                contas={ativas}
                agora={agora}
                cor={c.cor ?? PALETA[contas.indexOf(c) % PALETA.length]}
                serie={serie.get(c.id) ?? []}
              />
            ))}
          </Pilha>
        </Painel>
      </ComTrilha>

      <Destaque tom="info" icone="escudo" titulo="Dica de segurança">
        <span
          className="font-sans"
          style={{ fontSize: 11.5, lineHeight: 1.55, color: 'rgba(242,237,227,.6)', textWrap: 'pretty' }}
        >
          Mantenha as contas conectadas e revise os saldos regularmente: a divergência entre o
          informado e o calculado é sempre um lançamento faltando de um lado ou do outro.
        </span>
        <LinkSeta href="/financeiro/extrato">Ver recomendações</LinkSeta>
      </Destaque>

      {ultimaLeitura && (
        <span
          className="font-sans"
          style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'rgba(242,237,227,.34)' }}
        >
          <Ico n="atualizar" tamanho={12} />
          {`Dados atualizados em ${ultimaLeitura}`}
        </span>
      )}
    </Pilha>
  )
}

/**
 * Rótulo relativo da última leitura — "Hoje, 08:32", "Ontem, 22:14",
 * "Há 2 dias". Relativo porque a pergunta da coluna é "posso confiar?", e a
 * distância no tempo responde mais rápido que uma data completa.
 */
function quandoAtualizou(sincronizadoEm: string | null, agora: number): string {
  if (!sincronizadoEm) return 'Nunca sincronizada'
  // Tudo em Brasília: o servidor roda em UTC e, sem o fuso, "Hoje, 18:32"
  // aparecia às 16h — e a virada de dia acontecia às 21h.
  const diaSp = (t: number | Date) =>
    new Date(t).toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' })
  const d = new Date(sincronizadoEm)
  const hora = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
  if (diaSp(d) === diaSp(agora)) return `Hoje, ${hora}`
  if (diaSp(d) === diaSp(agora - 86_400_000)) return `Ontem, ${hora}`
  const dias = Math.max(1, Math.floor((agora - d.getTime()) / 86_400_000))
  return `Há ${plural(dias, 'dia', 'dias')}`
}

/** Como o mockup rotula cada origem de saldo na coluna de atualização. */
const ORIGEM_LINHA: Record<ContaFinanceira['origemSaldo'], { texto: string; cor: string }> = {
  api: { texto: 'Conectada via API', cor: TINTA.ok },
  informado: { texto: 'Registro manual', cor: TINTA.ouro },
  calculado: { texto: 'Calculado pelo ERP', cor: 'rgba(242,237,227,.5)' },
}

/**
 * De onde vem o saldo desta conta, em uma frase.
 *
 * "Registro manual" sozinho não explicava nada — e foi exatamente por isso que
 * um bug grave passou despercebido: a view congelava a conta no valor
 * informado, a tela exibia saídas de 30 dias ao lado dele, e nada na interface
 * dizia que as duas coisas não conversavam. Um número que se explica é um
 * número que denuncia o próprio erro.
 */
function comoOSaldoFoiFeito(conta: ContaFinanceira): string | null {
  if (conta.origemSaldo !== 'informado') return null
  if (!conta.saldoInformadoPara) {
    return 'Saldo informado sem data de referência — informe para o ERP voltar a somar'
  }
  const dia = diaCurtoPt(conta.saldoInformadoPara)
  return conta.movimentosDesdeOInformado === 0
    ? `Saldo de ${dia} · nenhum movimento depois disso`
    : `Saldo de ${dia} + ${plural(conta.movimentosDesdeOInformado, 'movimento', 'movimentos')} desde então`
}

/** A linha-painel de uma conta: marca, saldo, movimento, tendência e origem. */
function LinhaConta({
  conta,
  contas,
  agora,
  cor,
  serie,
}: {
  conta: ContaFinanceira
  contas: ContaFinanceira[]
  agora: number
  cor: string
  serie: number[]
}) {
  const fatia = concentracao(conta, contas)
  const origem = ORIGEM_LINHA[conta.origemSaldo]
  const receita = comoOSaldoFoiFeito(conta)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1.45fr) 132px 112px 112px 100px minmax(0,1.2fr)',
        gap: 12,
        alignItems: 'center',
        padding: '14px 15px',
        border: '1px solid rgba(255,255,255,.06)',
        borderLeft: `3px solid ${conta.ativa ? cor : 'rgba(255,255,255,.08)'}`,
        borderRadius: 12,
        background: conta.ativa ? 'rgba(255,255,255,.014)' : 'transparent',
        opacity: conta.ativa ? 1 : 0.5,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <TileMarca nome={`${conta.nome} ${conta.banco} ${conta.tipo}`} tamanho={44} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: 'rgba(242,237,227,.94)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {conta.nome}
            </span>
            {conta.principal && <Chip tom="ouro">Padrão</Chip>}
            {!conta.ativa && <Chip tom="neutro">Inativa</Chip>}
          </span>
          <span className="font-sans" style={{ fontSize: 10.5, color: 'rgba(242,237,227,.4)' }}>
            {[conta.tipo, conta.banco].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Etiqueta>Saldo atual</Etiqueta>
        <Num tamanho={17} tom={conta.saldoDisponivel < 0 ? 'erro' : undefined}>
          {brl(conta.saldoDisponivel)}
        </Num>
        <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.36)' }}>
          {`${fatia.toFixed(1).replace('.', ',')}% do total`}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Etiqueta>Entradas (30d)</Etiqueta>
        <Num tamanho={12.5} tom="ok" peso={500}>
          {brl(conta.entradas30d)}
        </Num>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Etiqueta>Saídas (30d)</Etiqueta>
        <Num tamanho={12.5} tom="erro" peso={500}>
          {brl(conta.saidas30d)}
        </Num>
      </span>

      <Mini valores={serie.length > 1 ? serie : [0, 0]} largura={96} altura={30} />

      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <Etiqueta>Última atualização</Etiqueta>
          <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.78)' }}>
            {quandoAtualizou(conta.sincronizadoEm, agora)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bolinha cor={origem.cor} tamanho={6} />
            <span className="font-sans" style={{ fontSize: 10, color: origem.cor }}>
              {origem.texto}
            </span>
          </span>
          {receita && (
            <span
              className="font-sans"
              style={{ fontSize: 9.5, lineHeight: 1.4, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
            >
              {receita}
            </span>
          )}
        </span>
        {/* As ações da linha são reais: os dois modais que já existem. O kebab
            do mockup viraria menu inerte, e botão que não faz nada é proibido. */}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <InformarSaldo conta={conta} />
          <EditarConta conta={conta} />
        </span>
      </span>
    </div>
  )
}

/**
 * Saldo acumulado dia a dia por conta, a partir das baixas.
 *
 * É uma reconstrução, não um histórico gravado: o ERP não guarda foto diária
 * de saldo. Serve para a forma da curva — subindo ou descendo —, e por isso a
 * faixa não tem escala nem eixo.
 */
function serieDiariaPorConta(lancamentos: LancamentoGerencial[]): Map<string, number[]> {
  const porConta = new Map<string, Map<string, number>>()
  for (const l of lancamentos) {
    if (!l.baixadoEm || l.canceladoEm) continue
    const dias = porConta.get(l.contaId) ?? new Map<string, number>()
    const delta = l.tipo === 'entrada' ? l.recebido : -l.recebido
    dias.set(l.baixadoEm, (dias.get(l.baixadoEm) ?? 0) + delta)
    porConta.set(l.contaId, dias)
  }

  const saida = new Map<string, number[]>()
  for (const [conta, dias] of porConta) {
    const ordenados = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30)
    let acumulado = 0
    saida.set(
      conta,
      ordenados.map(([, v]) => (acumulado += v)),
    )
  }
  return saida
}

/** Tile de atalho em LINK — o mesmo desenho do tile de ação, para navegar. */
function AtalhoLink({
  href,
  icone,
  titulo,
  sub,
}: {
  href: string
  icone: NomeIcone
  titulo: string
  sub: string
}) {
  return (
    <Link
      href={href}
      className="hover:border-ouro/40"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '11px 12px',
        border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 11,
        background: 'rgba(255,255,255,.015)',
        textDecoration: 'none',
        minWidth: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: 'none',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(233,197,131,.1)',
            border: '1px solid rgba(233,197,131,.24)',
            color: TINTA.ouro,
          }}
        >
          <Ico n={icone} tamanho={14} />
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'rgba(242,237,227,.3)', display: 'grid', placeItems: 'center' }}>
          <Ico n="seta-direita" tamanho={12} />
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="font-sans" style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(242,237,227,.88)' }}>
          {titulo}
        </span>
        <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.35, color: 'rgba(242,237,227,.4)' }}>
          {sub}
        </span>
      </span>
    </Link>
  )
}
