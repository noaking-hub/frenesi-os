import 'server-only'

import { supabaseConfigurado, supabaseServer, tudoDe } from '@/data/supabase'
import { brl, hojeEmSaoPaulo, identificarFrete, num, pct } from '@/domain'
import type {
  DefinicaoRelatorio,
  FiltrosRelatorio,
  LinhaRelatorio,
  ResultadoRelatorio,
} from '@/domain'

/**
 * O catálogo de relatórios.
 *
 * Cada entrada é uma pergunta que a operação faz e uma consulta que responde.
 * A tela é uma só — `/relatorios/[id]` — porque filtro, ordenação, exportação
 * e estado vazio não mudam de relatório para relatório. O que muda é a
 * pergunta, e é só isso que mora aqui.
 *
 * REGRA DA CASA: nenhum número inventado. Quando a fonte não tem o dado, o
 * relatório devolve `vazioPorque` explicando de onde ele viria — tabela vazia
 * sem explicação é indistinguível de tela quebrada, e foi assim que a versão
 * antiga desta tela mostrava "relatórios" que eram botões sem função.
 */

const vazio = (porque: string): ResultadoRelatorio => ({
  colunas: [],
  linhas: [],
  kpis: [],
  vazioPorque: porque,
})

const SEM_BANCO = 'O Supabase precisa estar configurado para os relatórios lerem o banco.'

/** Recorta a lista no limite pedido, guardando quantas linhas existiam. */
function cortar(
  linhas: LinhaRelatorio[],
  f: FiltrosRelatorio,
): { linhas: LinhaRelatorio[]; totalAntesDoCorte: number } {
  const teto = Number.isFinite(f.limite) ? f.limite : linhas.length
  return { linhas: linhas.slice(0, teto), totalAntesDoCorte: linhas.length }
}

/**
 * A janela aplicada a uma coluna `timestamptz`.
 *
 * `ate` vira "até o fim daquele dia": filtrar `<= '2026-08-17'` num timestamp
 * corta às 00:00 e perde o dia inteiro que o operador acabou de escolher.
 */
interface ConsultaFiltravel {
  gte: (coluna: string, valor: string) => ConsultaFiltravel
  lte: (coluna: string, valor: string) => ConsultaFiltravel
  range: (de: number, ate: number) => unknown
}

function janela(consulta: unknown, coluna: string, f: FiltrosRelatorio): ConsultaFiltravel {
  let atual = consulta as ConsultaFiltravel
  if (f.de) atual = atual.gte(coluna, `${f.de}T00:00:00`)
  if (f.ate) atual = atual.lte(coluna, `${f.ate}T23:59:59.999`)
  return atual
}

/**
 * O cast que o `tudoDe` exige.
 *
 * O cliente do Supabase tipa `select(string)` como resposta genérica, e cada
 * chamada precisaria repetir `as unknown as PromiseLike<{data, error}>`. Uma
 * função nomeada diz o que está acontecendo e não espalha `unknown` pelo
 * arquivo.
 */
function comoPagina<T>(consulta: unknown): PromiseLike<{ data: T[] | null; error: unknown }> {
  return consulta as PromiseLike<{ data: T[] | null; error: unknown }>
}

const numeroDe = (v: unknown) => Number(v ?? 0)
const media = (total: number, qtd: number) => (qtd > 0 ? total / qtd : 0)

// ── Leituras compartilhadas ────────────────────────────────────────────────

interface PedidoBruto {
  id: string
  cliente_id: string | null
  canal: string | null
  gateway: string | null
  valor: number | string
  frete: number | string | null
  pagamento: string
  envio: string | null
  comprado_em: string
  entregue_em: string | null
  entrega_prevista_em: string | null
  destino: string | null
  servico_frete: string | null
  rastreio: string | null
}

const CAMPOS_PEDIDO =
  'id, cliente_id, canal, gateway, valor, frete, pagamento, envio, comprado_em, ' +
  'entregue_em, entrega_prevista_em, destino, servico_frete, rastreio'

/** Pedidos PAGOS da janela. É a base de quase todo relatório de venda. */
async function pedidosPagos(f: FiltrosRelatorio): Promise<PedidoBruto[]> {
  return tudoDe<PedidoBruto>('pedidos', (de, ate) =>
    comoPagina<PedidoBruto>(
      janela(
        supabaseServer().from('pedidos').select(CAMPOS_PEDIDO).eq('pagamento', 'pago'),
        'comprado_em',
        f,
      ).range(de, ate),
    ),
  )
}

interface ClienteBruto {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  uf: string | null
  aniversario: string | null
  criado_em: string | null
}

async function clientes(): Promise<ClienteBruto[]> {
  return tudoDe<ClienteBruto>('clientes', (de, ate) =>
    comoPagina<ClienteBruto>(
      supabaseServer()
        .from('clientes')
        .select('id, nome, email, telefone, cidade, uf, aniversario, criado_em')
        .range(de, ate),
    ),
  )
}

/** O que cada cliente comprou, na janela — a espinha dos relatórios de CRM. */
interface ResumoDoCliente {
  pedidos: number
  receita: number
  primeiro: string
  ultimo: string
}

function resumirPorCliente(ps: PedidoBruto[]): Map<string, ResumoDoCliente> {
  const mapa = new Map<string, ResumoDoCliente>()
  for (const p of ps) {
    if (!p.cliente_id) continue
    const r = mapa.get(p.cliente_id) ?? {
      pedidos: 0,
      receita: 0,
      primeiro: p.comprado_em,
      ultimo: p.comprado_em,
    }
    r.pedidos += 1
    r.receita += numeroDe(p.valor)
    if (p.comprado_em < r.primeiro) r.primeiro = p.comprado_em
    if (p.comprado_em > r.ultimo) r.ultimo = p.comprado_em
    mapa.set(p.cliente_id, r)
  }
  return mapa
}

const soData = (iso: string | null) => (iso ? iso.slice(0, 10) : null)

function passaNaBusca(q: string | null, ...campos: (string | null)[]): boolean {
  if (!q) return true
  const alvo = q.trim().toLowerCase()
  return campos.some((c) => (c ?? '').toLowerCase().includes(alvo))
}

// ── Clientes ───────────────────────────────────────────────────────────────

async function clientesPorCidade(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [cs, ps] = await Promise.all([clientes(), pedidosPagos(f)])
  const porCliente = resumirPorCliente(ps)

  const cidades = new Map<string, { cidade: string; uf: string; clientes: number; pedidos: number; receita: number }>()
  for (const c of cs) {
    if (!c.cidade) continue
    if (f.uf && (c.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c.cidade, c.uf)) continue
    const compra = porCliente.get(c.id)
    // Sem compra na janela o cliente não entra: o relatório é "onde estão os
    // clientes que compraram neste período", e não um censo do cadastro.
    if (!compra) continue
    const chave = `${c.cidade}|${c.uf ?? ''}`
    const linha = cidades.get(chave) ?? {
      cidade: c.cidade,
      uf: c.uf ?? '—',
      clientes: 0,
      pedidos: 0,
      receita: 0,
    }
    linha.clientes += 1
    linha.pedidos += compra.pedidos
    linha.receita += compra.receita
    cidades.set(chave, linha)
  }

  const linhas = [...cidades.values()]
    .sort((a, b) => b.receita - a.receita)
    .map((l) => ({ ...l, ticket: media(l.receita, l.pedidos) }))

  const receita = linhas.reduce((a, l) => a + l.receita, 0)
  return {
    colunas: [
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'clientes', rotulo: 'Clientes', tipo: 'numero' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Cidades', valor: num(linhas.length) },
      { rotulo: 'Clientes', valor: num(linhas.reduce((a, l) => a + l.clientes, 0)) },
      { rotulo: 'Receita', valor: brl(receita) },
      {
        rotulo: 'Concentração',
        valor: pct(receita > 0 ? (linhas.slice(0, 5).reduce((a, l) => a + l.receita, 0) / receita) * 100 : 0),
        nota: 'nas 5 primeiras cidades',
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Nenhum cliente com compra paga nesta janela. A cidade vem do destino do pedido — pedido sem endereço importado não entra.',
  }
}

async function clientesPorEstado(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [cs, ps] = await Promise.all([clientes(), pedidosPagos(f)])
  const porCliente = resumirPorCliente(ps)

  const ufs = new Map<string, { uf: string; cidades: Set<string>; clientes: number; pedidos: number; receita: number }>()
  for (const c of cs) {
    if (!c.uf) continue
    if (f.uf && c.uf !== f.uf) continue
    const compra = porCliente.get(c.id)
    if (!compra) continue
    const linha = ufs.get(c.uf) ?? {
      uf: c.uf,
      cidades: new Set<string>(),
      clientes: 0,
      pedidos: 0,
      receita: 0,
    }
    if (c.cidade) linha.cidades.add(c.cidade)
    linha.clientes += 1
    linha.pedidos += compra.pedidos
    linha.receita += compra.receita
    ufs.set(c.uf, linha)
  }

  const total = [...ufs.values()].reduce((a, l) => a + l.receita, 0)
  const linhas = [...ufs.values()]
    .sort((a, b) => b.receita - a.receita)
    .map((l) => ({
      uf: l.uf,
      cidades: l.cidades.size,
      clientes: l.clientes,
      pedidos: l.pedidos,
      receita: l.receita,
      ticket: media(l.receita, l.pedidos),
      participacao: total > 0 ? (l.receita / total) * 100 : 0,
    }))

  return {
    colunas: [
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'clientes', rotulo: 'Clientes', tipo: 'numero' },
      { chave: 'cidades', rotulo: 'Cidades', tipo: 'numero', secundaria: true },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'participacao', rotulo: '% da receita', tipo: 'percentual' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Estados', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(total) },
      {
        rotulo: 'Estado líder',
        valor: linhas[0]?.uf ?? '—',
        nota: linhas[0] ? `${pct(linhas[0].participacao)} da receita` : undefined,
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum cliente com compra paga nesta janela.',
  }
}

async function clientesNovos(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  // O "primeiro pedido" tem que ser medido contra o histórico INTEIRO, não
  // contra a janela: quem comprou em maio e voltou agora não é cliente novo.
  const [cs, naJanela, todos] = await Promise.all([
    clientes(),
    pedidosPagos(f),
    pedidosPagos({ de: null, ate: null, uf: null, q: null, limite: Infinity }),
  ])
  const historico = resumirPorCliente(todos)
  const daJanela = resumirPorCliente(naJanela)
  const porId = new Map(cs.map((c) => [c.id, c]))

  const linhas: LinhaRelatorio[] = []
  for (const [id, r] of daJanela) {
    const h = historico.get(id)
    if (!h || soData(h.primeiro) !== soData(r.primeiro)) continue
    const c = porId.get(id)
    if (f.uf && (c?.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c?.nome ?? null, c?.email ?? null, c?.cidade ?? null)) continue
    linhas.push({
      cliente: c?.nome ?? '(sem nome)',
      email: c?.email ?? null,
      cidade: c?.cidade ?? null,
      uf: c?.uf ?? null,
      primeiraCompra: soData(r.primeiro),
      pedidos: r.pedidos,
      receita: r.receita,
    })
  }
  linhas.sort((a, b) => Number(b.receita) - Number(a.receita))

  const receita = linhas.reduce((a, l) => a + Number(l.receita), 0)
  return {
    colunas: [
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', secundaria: true },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto' },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'primeiraCompra', rotulo: 'Primeira compra', tipo: 'data' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Clientes novos', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(receita) },
      { rotulo: 'Ticket médio', valor: brl(media(receita, linhas.length)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Ninguém comprou pela primeira vez nesta janela.',
  }
}

async function clientesRecorrentes(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [cs, ps] = await Promise.all([clientes(), pedidosPagos(f)])
  const porCliente = resumirPorCliente(ps)
  const porId = new Map(cs.map((c) => [c.id, c]))

  const linhas: LinhaRelatorio[] = []
  for (const [id, r] of porCliente) {
    if (r.pedidos < 2) continue
    const c = porId.get(id)
    if (f.uf && (c?.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c?.nome ?? null, c?.email ?? null, c?.cidade ?? null)) continue
    linhas.push({
      cliente: c?.nome ?? '(sem nome)',
      email: c?.email ?? null,
      cidade: c?.cidade ?? null,
      uf: c?.uf ?? null,
      pedidos: r.pedidos,
      receita: r.receita,
      ticket: media(r.receita, r.pedidos),
      ultimaCompra: soData(r.ultimo),
    })
  }
  linhas.sort((a, b) => Number(b.receita) - Number(a.receita))

  const compradores = porCliente.size
  const receita = linhas.reduce((a, l) => a + Number(l.receita), 0)
  return {
    colunas: [
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', secundaria: true },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', secundaria: true },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
      { chave: 'ultimaCompra', rotulo: 'Última compra', tipo: 'data' },
    ],
    kpis: [
      { rotulo: 'Recorrentes', valor: num(linhas.length) },
      {
        rotulo: 'Taxa de recompra',
        valor: pct(compradores > 0 ? (linhas.length / compradores) * 100 : 0),
        nota: `${num(compradores)} compradores na janela`,
      },
      { rotulo: 'Receita', valor: brl(receita) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Ninguém comprou duas vezes dentro desta janela. Janelas curtas quase sempre respondem isso — experimente 12 meses.',
  }
}

async function clientesInativos(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  // Inatividade não é filtrável por janela — ela É a janela. Aqui a data
  // escolhida vira o corte: "quem não compra desde <de>".
  const hoje = hojeEmSaoPaulo()
  const corte = f.de ?? new Date(new Date(`${hoje}T12:00:00`).getTime() - 90 * 86_400_000).toISOString().slice(0, 10)

  const [cs, todos] = await Promise.all([
    clientes(),
    pedidosPagos({ de: null, ate: null, uf: null, q: null, limite: Infinity }),
  ])
  const porCliente = resumirPorCliente(todos)
  const porId = new Map(cs.map((c) => [c.id, c]))

  const linhas: LinhaRelatorio[] = []
  for (const [id, r] of porCliente) {
    const ultimo = soData(r.ultimo)!
    if (ultimo >= corte) continue
    const c = porId.get(id)
    if (f.uf && (c?.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c?.nome ?? null, c?.email ?? null, c?.cidade ?? null)) continue
    const dias = Math.floor(
      (Date.parse(`${hoje}T12:00:00`) - Date.parse(`${ultimo}T12:00:00`)) / 86_400_000,
    )
    linhas.push({
      cliente: c?.nome ?? '(sem nome)',
      email: c?.email ?? null,
      telefone: c?.telefone ?? null,
      cidade: c?.cidade ?? null,
      uf: c?.uf ?? null,
      ultimaCompra: ultimo,
      diasSemComprar: dias,
      pedidos: r.pedidos,
      receita: r.receita,
    })
  }
  linhas.sort((a, b) => Number(b.receita) - Number(a.receita))

  return {
    colunas: [
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
      { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto', secundaria: true },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', secundaria: true },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'ultimaCompra', rotulo: 'Última compra', tipo: 'data' },
      { chave: 'diasSemComprar', rotulo: 'Dias parado', tipo: 'numero' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero', secundaria: true },
      { chave: 'receita', rotulo: 'Já gastou', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Clientes parados', valor: num(linhas.length), nota: `sem comprar desde ${corte.slice(8, 10)}/${corte.slice(5, 7)}` },
      { rotulo: 'Receita histórica', valor: brl(linhas.reduce((a, l) => a + Number(l.receita), 0)) },
      {
        rotulo: 'Ticket médio deles',
        valor: brl(
          media(
            linhas.reduce((a, l) => a + Number(l.receita), 0),
            linhas.reduce((a, l) => a + Number(l.pedidos), 0),
          ),
        ),
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Todo mundo comprou depois desta data.',
  }
}

async function aniversariantes(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [cs, todos] = await Promise.all([
    clientes(),
    pedidosPagos({ de: null, ate: null, uf: null, q: null, limite: Infinity }),
  ])
  const porCliente = resumirPorCliente(todos)

  // A janela aqui é sobre o DIA E MÊS do aniversário, ignorando o ano — é o
  // único jeito de "os aniversariantes de setembro" fazer sentido.
  const dentro = (aniversario: string) => {
    if (!f.de && !f.ate) return true
    const mmdd = aniversario.slice(5, 10)
    const deMmdd = f.de?.slice(5, 10) ?? '01-01'
    const ateMmdd = f.ate?.slice(5, 10) ?? '12-31'
    // Janela que cruza o ano ("15/12 a 15/01") vira dois trechos.
    return deMmdd <= ateMmdd
      ? mmdd >= deMmdd && mmdd <= ateMmdd
      : mmdd >= deMmdd || mmdd <= ateMmdd
  }

  const linhas: LinhaRelatorio[] = []
  for (const c of cs) {
    if (!c.aniversario || !dentro(c.aniversario)) continue
    if (f.uf && (c.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c.nome, c.email, c.cidade)) continue
    const r = porCliente.get(c.id)
    linhas.push({
      cliente: c.nome ?? '(sem nome)',
      email: c.email ?? null,
      aniversario: `${c.aniversario.slice(8, 10)}/${c.aniversario.slice(5, 7)}`,
      cidade: c.cidade ?? null,
      uf: c.uf ?? null,
      pedidos: r?.pedidos ?? 0,
      receita: r?.receita ?? 0,
    })
  }
  linhas.sort((a, b) => String(a.aniversario).slice(3).localeCompare(String(b.aniversario).slice(3)) || String(a.aniversario).localeCompare(String(b.aniversario)))

  return {
    colunas: [
      { chave: 'aniversario', rotulo: 'Aniversário', tipo: 'texto' },
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', secundaria: true },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto', secundaria: true },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Já gastou', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Aniversariantes', valor: num(linhas.length) },
      { rotulo: 'Já compraram', valor: num(linhas.filter((l) => Number(l.pedidos) > 0).length) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Nenhum aniversário cadastrado nesta faixa. A data de nascimento vem da Yampi e só existe em quem preencheu.',
  }
}

async function rankingDeClientes(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [cs, ps] = await Promise.all([clientes(), pedidosPagos(f)])
  const porCliente = resumirPorCliente(ps)
  const porId = new Map(cs.map((c) => [c.id, c]))

  const linhas: LinhaRelatorio[] = []
  for (const [id, r] of porCliente) {
    const c = porId.get(id)
    if (f.uf && (c?.uf ?? '') !== f.uf) continue
    if (!passaNaBusca(f.q, c?.nome ?? null, c?.email ?? null, c?.cidade ?? null)) continue
    linhas.push({
      cliente: c?.nome ?? '(sem nome)',
      email: c?.email ?? null,
      cidade: c?.cidade ?? null,
      uf: c?.uf ?? null,
      pedidos: r.pedidos,
      receita: r.receita,
      ticket: media(r.receita, r.pedidos),
      ultimaCompra: soData(r.ultimo),
    })
  }
  linhas.sort((a, b) => Number(b.receita) - Number(a.receita))

  const receita = linhas.reduce((a, l) => a + Number(l.receita), 0)
  const top20 = linhas.slice(0, Math.max(1, Math.ceil(linhas.length * 0.2)))
  return {
    colunas: [
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', secundaria: true },
      { chave: 'cidade', rotulo: 'Cidade', tipo: 'texto', secundaria: true },
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
      { chave: 'ultimaCompra', rotulo: 'Última compra', tipo: 'data' },
    ],
    kpis: [
      { rotulo: 'Compradores', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(receita) },
      {
        rotulo: 'Peso dos 20% maiores',
        valor: pct(receita > 0 ? (top20.reduce((a, l) => a + Number(l.receita), 0) / receita) * 100 : 0),
        nota: 'da receita da janela',
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhuma compra paga nesta janela.',
  }
}

// ── Cashback ───────────────────────────────────────────────────────────────

interface CashbackBruto {
  customer_id: string
  email: string | null
  nome: string | null
  telefone: string | null
  saldo: number | string | null
  gerado: number | string | null
  usado: number | string | null
  expira_em: string | null
  ultimo_credito_em: string | null
}

async function cashbackTodos(): Promise<CashbackBruto[]> {
  return tudoDe<CashbackBruto>('cashback_yampi', (de, ate) =>
    comoPagina<CashbackBruto>(
      supabaseServer()
        .from('cashback_yampi')
        .select(
          'customer_id, email, nome, telefone, saldo, gerado, usado, expira_em, ultimo_credito_em',
        )
        .range(de, ate),
    ),
  )
}

async function cashbackComSaldo(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const todos = await cashbackTodos()
  const linhas: LinhaRelatorio[] = []
  for (const c of todos) {
    const saldo = numeroDe(c.saldo)
    if (saldo <= 0) continue
    if (!passaNaBusca(f.q, c.nome, c.email, c.telefone)) continue
    // A janela cai sobre a VALIDADE: "quem tem saldo vencendo em setembro".
    const expira = soData(c.expira_em)
    if (f.de && (!expira || expira < f.de)) continue
    if (f.ate && (!expira || expira > f.ate)) continue
    linhas.push({
      cliente: c.nome ?? '(sem nome)',
      email: c.email ?? null,
      telefone: c.telefone ?? null,
      saldo,
      gerado: numeroDe(c.gerado),
      usado: numeroDe(c.usado),
      expiraEm: expira,
      ultimoCredito: soData(c.ultimo_credito_em),
    })
  }
  linhas.sort((a, b) => Number(b.saldo) - Number(a.saldo))

  const saldo = linhas.reduce((a, l) => a + Number(l.saldo), 0)
  return {
    colunas: [
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
      { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto', secundaria: true },
      { chave: 'saldo', rotulo: 'Saldo', tipo: 'dinheiro' },
      { chave: 'gerado', rotulo: 'Já gerado', tipo: 'dinheiro', secundaria: true },
      { chave: 'usado', rotulo: 'Já usado', tipo: 'dinheiro', secundaria: true },
      { chave: 'expiraEm', rotulo: 'Expira em', tipo: 'data' },
      { chave: 'ultimoCredito', rotulo: 'Último crédito', tipo: 'data', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Clientes com saldo', valor: num(linhas.length) },
      { rotulo: 'Saldo em aberto', valor: brl(saldo), nota: 'passivo com o cliente' },
      { rotulo: 'Saldo médio', valor: brl(media(saldo, linhas.length)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Ninguém com saldo de cashback nesta faixa de validade.',
  }
}

async function cashbackAExpirar(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const hoje = hojeEmSaoPaulo()
  const todos = await cashbackTodos()
  const linhas: LinhaRelatorio[] = []
  for (const c of todos) {
    const saldo = numeroDe(c.saldo)
    const expira = soData(c.expira_em)
    if (saldo <= 0 || !expira) continue
    if (f.de && expira < f.de) continue
    if (f.ate && expira > f.ate) continue
    if (!passaNaBusca(f.q, c.nome, c.email, c.telefone)) continue
    const dias = Math.round((Date.parse(`${expira}T12:00:00`) - Date.parse(`${hoje}T12:00:00`)) / 86_400_000)
    linhas.push({
      cliente: c.nome ?? '(sem nome)',
      email: c.email ?? null,
      telefone: c.telefone ?? null,
      saldo,
      expiraEm: expira,
      diasParaExpirar: dias,
    })
  }
  linhas.sort((a, b) => String(a.expiraEm).localeCompare(String(b.expiraEm)))

  const vencido = linhas.filter((l) => Number(l.diasParaExpirar) < 0)
  return {
    colunas: [
      { chave: 'expiraEm', rotulo: 'Expira em', tipo: 'data' },
      { chave: 'diasParaExpirar', rotulo: 'Dias', tipo: 'numero' },
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
      { chave: 'telefone', rotulo: 'Telefone', tipo: 'texto', secundaria: true },
      { chave: 'saldo', rotulo: 'Saldo', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Clientes', valor: num(linhas.length) },
      { rotulo: 'Saldo em risco', valor: brl(linhas.reduce((a, l) => a + Number(l.saldo), 0)) },
      {
        rotulo: 'Já vencido',
        valor: brl(vencido.reduce((a, l) => a + Number(l.saldo), 0)),
        nota: `${num(vencido.length)} clientes`,
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Nenhum saldo vencendo nesta janela. Sem data escolhida, o relatório traz tudo o que tem validade.',
  }
}

async function cashbackUsado(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const [espelho, movimentos] = await Promise.all([
    cashbackTodos(),
    tudoDe<{
      customer_id: string
      tipo: string
      valor: number | string
      usado: number | string | null
      pedido: string | null
      criado_em: string
    }>('cashback_movimentos', (de, ate) =>
      supabaseServer()
        .from('cashback_movimentos')
        .select('customer_id, tipo, valor, usado, pedido, criado_em')
        .range(de, ate),
    ),
  ])

  const porCliente = new Map(espelho.map((c) => [c.customer_id, c]))

  // Duas fontes para a mesma pergunta, e as duas entram: o espelho da Yampi
  // traz o acumulado por cliente (`usado`), e os movimentos trazem o resgate
  // com data e pedido. Quando o movimento existe, ele é mais específico.
  const linhas: LinhaRelatorio[] = []
  for (const m of movimentos) {
    const usado = numeroDe(m.usado) || (m.tipo === 'resgate' ? numeroDe(m.valor) : 0)
    if (usado <= 0) continue
    const dia = soData(m.criado_em)!
    if (f.de && dia < f.de) continue
    if (f.ate && dia > f.ate) continue
    const c = porCliente.get(m.customer_id)
    if (!passaNaBusca(f.q, c?.nome ?? null, c?.email ?? null)) continue
    linhas.push({
      quando: dia,
      cliente: c?.nome ?? m.customer_id,
      email: c?.email ?? null,
      pedido: m.pedido ?? null,
      usado,
    })
  }

  // Sem movimento de resgate, o acumulado do espelho ainda responde "quem já
  // usou alguma vez" — sem data, e a coluna diz isso.
  if (linhas.length === 0) {
    for (const c of espelho) {
      const usado = numeroDe(c.usado)
      if (usado <= 0) continue
      if (!passaNaBusca(f.q, c.nome, c.email)) continue
      linhas.push({
        quando: null,
        cliente: c.nome ?? '(sem nome)',
        email: c.email ?? null,
        pedido: null,
        usado,
      })
    }
  }
  linhas.sort((a, b) => Number(b.usado) - Number(a.usado))

  return {
    colunas: [
      { chave: 'quando', rotulo: 'Quando', tipo: 'data' },
      { chave: 'cliente', rotulo: 'Cliente', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto' },
      { chave: 'pedido', rotulo: 'Pedido', tipo: 'texto', secundaria: true },
      { chave: 'usado', rotulo: 'Cashback usado', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Resgates', valor: num(linhas.length) },
      { rotulo: 'Valor usado', valor: brl(linhas.reduce((a, l) => a + Number(l.usado), 0)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'O ERP ainda não recebeu nenhum resgate de cashback. O espelho da Yampi traz saldo e crédito por cliente, mas o campo "usado" chega zerado e nenhum pedido importado veio com desconto de cashback — enquanto a Yampi for a dona do checkout, o resgate acontece lá e não passa por aqui.',
  }
}

// ── Vendas ─────────────────────────────────────────────────────────────────

async function vendasPorProduto(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const itens = await tudoDe<{
    descricao: string
    variante: number | null
    quantidade: number
    preco: number | string
    pedidos: { comprado_em: string; pagamento: string } | null
  }>('pedido_itens', (de, ate) =>
    comoPagina(
      janela(
        supabaseServer()
          .from('pedido_itens')
          .select('descricao, variante, quantidade, preco, pedidos!inner(comprado_em, pagamento)')
          .eq('pedidos.pagamento', 'pago'),
        'pedidos.comprado_em',
        f,
      ).range(de, ate),
    ),
  )

  const mapa = new Map<string, { produto: string; unidades: number; receita: number; ml5: number; ml10: number }>()
  for (const i of itens) {
    // Agrupa pelo nome SEM o tamanho: a pergunta é qual perfume sustenta o
    // faturamento, não qual frasco.
    const nome = i.descricao.replace(/\s*[-·]?\s*\d+\s*ml.*$/i, '').trim() || i.descricao
    if (!passaNaBusca(f.q, nome)) continue
    const l = mapa.get(nome) ?? { produto: nome, unidades: 0, receita: 0, ml5: 0, ml10: 0 }
    const qtd = i.quantidade || 1
    l.unidades += qtd
    l.receita += numeroDe(i.preco) * qtd
    if (i.variante === 5) l.ml5 += qtd
    if (i.variante === 10) l.ml10 += qtd
    mapa.set(nome, l)
  }

  const ordenadas = [...mapa.values()].sort((a, b) => b.receita - a.receita)
  const total = ordenadas.reduce((a, l) => a + l.receita, 0)
  let acumulado = 0
  const linhas = ordenadas.map((l) => {
    const participacao = total > 0 ? (l.receita / total) * 100 : 0
    acumulado = Math.min(100, acumulado + participacao)
    return {
      ...l,
      participacao,
      acumulado,
      classe: acumulado <= 80 ? 'A' : acumulado <= 95.5 ? 'B' : 'C',
      ticket: media(l.receita, l.unidades),
    }
  })

  return {
    colunas: [
      { chave: 'classe', rotulo: 'Classe', tipo: 'texto' },
      { chave: 'produto', rotulo: 'Perfume', tipo: 'texto' },
      { chave: 'unidades', rotulo: 'Unidades', tipo: 'numero' },
      { chave: 'ml5', rotulo: '5 ml', tipo: 'numero', secundaria: true },
      { chave: 'ml10', rotulo: '10 ml', tipo: 'numero', secundaria: true },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'participacao', rotulo: '% da receita', tipo: 'percentual' },
      { chave: 'acumulado', rotulo: 'Acumulado', tipo: 'percentual', secundaria: true },
      { chave: 'ticket', rotulo: 'Preço médio', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Perfumes vendidos', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(total) },
      {
        rotulo: 'Classe A',
        valor: num(linhas.filter((l) => l.classe === 'A').length),
        nota: 'sustentam 80% da receita',
      },
      { rotulo: 'Unidades', valor: num(linhas.reduce((a, l) => a + l.unidades, 0)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum item vendido em pedido pago nesta janela.',
  }
}

async function vendasPorDia(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ps = await pedidosPagos(f)
  const mapa = new Map<string, { dia: string; pedidos: number; receita: number; frete: number }>()
  for (const p of ps) {
    const dia = soData(p.comprado_em)!
    const l = mapa.get(dia) ?? { dia, pedidos: 0, receita: 0, frete: 0 }
    l.pedidos += 1
    l.receita += numeroDe(p.valor)
    l.frete += numeroDe(p.frete)
    mapa.set(dia, l)
  }
  const linhas = [...mapa.values()]
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .map((l) => ({ ...l, ticket: media(l.receita, l.pedidos) }))

  const receita = linhas.reduce((a, l) => a + l.receita, 0)
  const pedidos = linhas.reduce((a, l) => a + l.pedidos, 0)
  const melhor = [...linhas].sort((a, b) => b.receita - a.receita)[0]
  return {
    colunas: [
      { chave: 'dia', rotulo: 'Dia', tipo: 'data' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro' },
      { chave: 'frete', rotulo: 'Frete cobrado', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Dias com venda', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(receita) },
      { rotulo: 'Receita/dia', valor: brl(media(receita, linhas.length)) },
      {
        rotulo: 'Melhor dia',
        valor: melhor ? `${melhor.dia.slice(8, 10)}/${melhor.dia.slice(5, 7)}` : '—',
        nota: melhor ? `${brl(melhor.receita)} · ${num(melhor.pedidos)} pedidos` : undefined,
      },
      { rotulo: 'Pedidos', valor: num(pedidos) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum pedido pago nesta janela.',
  }
}

async function vendasPorUf(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ps = await pedidosPagos(f)
  const mapa = new Map<string, { uf: string; pedidos: number; receita: number; frete: number; cidades: Set<string> }>()
  for (const p of ps) {
    const partes = (p.destino ?? '').split('·')
    const uf = partes.length > 1 ? partes[1]!.trim().toUpperCase() : ''
    const chave = /^[A-Z]{2}$/.test(uf) ? uf : 'Sem UF'
    if (f.uf && chave !== f.uf) continue
    const l = mapa.get(chave) ?? { uf: chave, pedidos: 0, receita: 0, frete: 0, cidades: new Set<string>() }
    l.pedidos += 1
    l.receita += numeroDe(p.valor)
    l.frete += numeroDe(p.frete)
    if (partes[0]?.trim()) l.cidades.add(partes[0].trim())
    mapa.set(chave, l)
  }

  const total = [...mapa.values()].reduce((a, l) => a + l.receita, 0)
  const linhas = [...mapa.values()]
    .sort((a, b) => b.receita - a.receita)
    .map((l) => ({
      uf: l.uf,
      cidades: l.cidades.size,
      pedidos: l.pedidos,
      receita: l.receita,
      ticket: media(l.receita, l.pedidos),
      frete: l.frete,
      participacao: total > 0 ? (l.receita / total) * 100 : 0,
    }))

  return {
    colunas: [
      { chave: 'uf', rotulo: 'UF', tipo: 'texto' },
      { chave: 'cidades', rotulo: 'Cidades', tipo: 'numero', secundaria: true },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'participacao', rotulo: '% da receita', tipo: 'percentual' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
      { chave: 'frete', rotulo: 'Frete cobrado', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Estados', valor: num(linhas.filter((l) => l.uf !== 'Sem UF').length) },
      { rotulo: 'Receita', valor: brl(total) },
      { rotulo: 'Líder', valor: linhas[0]?.uf ?? '—', nota: linhas[0] ? pct(linhas[0].participacao) : undefined },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum pedido pago nesta janela.',
  }
}

async function vendasPorCanal(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ps = await pedidosPagos(f)
  const mapa = new Map<string, { canal: string; gateway: string; pedidos: number; receita: number }>()
  for (const p of ps) {
    const canal = p.canal === 'yampi' ? 'Yampi (loja)' : p.canal || 'Sem canal'
    const gateway = p.gateway || '—'
    const chave = `${canal}|${gateway}`
    const l = mapa.get(chave) ?? { canal, gateway, pedidos: 0, receita: 0 }
    l.pedidos += 1
    l.receita += numeroDe(p.valor)
    mapa.set(chave, l)
  }

  const total = [...mapa.values()].reduce((a, l) => a + l.receita, 0)
  const linhas = [...mapa.values()]
    .sort((a, b) => b.receita - a.receita)
    .map((l) => ({
      ...l,
      ticket: media(l.receita, l.pedidos),
      participacao: total > 0 ? (l.receita / total) * 100 : 0,
    }))

  return {
    colunas: [
      { chave: 'canal', rotulo: 'Canal', tipo: 'texto' },
      { chave: 'gateway', rotulo: 'Meio de pagamento', tipo: 'texto' },
      { chave: 'pedidos', rotulo: 'Pedidos', tipo: 'numero' },
      { chave: 'receita', rotulo: 'Receita', tipo: 'dinheiro' },
      { chave: 'participacao', rotulo: '% da receita', tipo: 'percentual' },
      { chave: 'ticket', rotulo: 'Ticket médio', tipo: 'dinheiro', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Combinações', valor: num(linhas.length) },
      { rotulo: 'Receita', valor: brl(total) },
      { rotulo: 'Pedidos', valor: num(linhas.reduce((a, l) => a + l.pedidos, 0)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum pedido pago nesta janela.',
  }
}

// ── Financeiro ─────────────────────────────────────────────────────────────

interface LancamentoBruto {
  id: string
  ocorrido_em: string | null
  baixado_em: string | null
  descricao: string
  categoria: string | null
  conta_id: string | null
  tipo: string
  valor: number | string
  favorecido: string | null
  origem: string | null
  transferencia_id: string | null
  cancelado_em: string | null
  categorias_financeiras: { impacta_dre: boolean; impacta_caixa: boolean } | null
}

async function lancamentosDaJanela(f: FiltrosRelatorio): Promise<LancamentoBruto[]> {
  const linhas = await tudoDe<LancamentoBruto>('lancamentos', (de, ate) =>
    comoPagina<LancamentoBruto>(
      janela(
        supabaseServer()
          .from('lancamentos')
          .select(
            'id, ocorrido_em, baixado_em, descricao, categoria, conta_id, tipo, valor, favorecido, ' +
              'origem, transferencia_id, cancelado_em, ' +
              'categorias_financeiras!lancamentos_categoria_id_fkey(impacta_dre, impacta_caixa)',
          )
          .is('cancelado_em', null),
        'ocorrido_em',
        f,
      ).range(de, ate),
    ),
  )
  return linhas
}

async function resultadoPorCategoria(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ls = await lancamentosDaJanela(f)
  const mapa = new Map<string, { categoria: string; entradas: number; saidas: number; lancamentos: number }>()
  for (const l of ls) {
    // Transferência entre contas próprias não é receita nem despesa: contá-la
    // fazia o saque do gateway aparecer como o maior "gasto" do mês.
    if (l.transferencia_id) continue
    if (l.categorias_financeiras && !l.categorias_financeiras.impacta_dre) continue
    const nome = l.categoria ?? 'Sem categoria'
    if (!passaNaBusca(f.q, nome, l.descricao, l.favorecido)) continue
    const item = mapa.get(nome) ?? { categoria: nome, entradas: 0, saidas: 0, lancamentos: 0 }
    if (l.tipo === 'entrada') item.entradas += numeroDe(l.valor)
    else item.saidas += numeroDe(l.valor)
    item.lancamentos += 1
    mapa.set(nome, item)
  }

  const linhas = [...mapa.values()]
    .map((l) => ({ ...l, resultado: l.entradas - l.saidas }))
    .sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado))

  const entradas = linhas.reduce((a, l) => a + l.entradas, 0)
  const saidas = linhas.reduce((a, l) => a + l.saidas, 0)
  return {
    colunas: [
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'entradas', rotulo: 'Entradas', tipo: 'dinheiro' },
      { chave: 'saidas', rotulo: 'Saídas', tipo: 'dinheiro' },
      { chave: 'resultado', rotulo: 'Resultado', tipo: 'dinheiro' },
      { chave: 'lancamentos', rotulo: 'Lançamentos', tipo: 'numero', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Entradas', valor: brl(entradas) },
      { rotulo: 'Saídas', valor: brl(saidas) },
      { rotulo: 'Resultado', valor: brl(entradas - saidas), nota: 'sem transferências entre contas' },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum lançamento com efeito no resultado nesta janela.',
  }
}

async function lancamentosDoPeriodo(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ls = await lancamentosDaJanela(f)
  const linhas: LinhaRelatorio[] = []
  for (const l of ls) {
    if (!passaNaBusca(f.q, l.descricao, l.categoria, l.favorecido, l.conta_id)) continue
    linhas.push({
      dia: soData(l.ocorrido_em),
      descricao: l.descricao,
      categoria: l.categoria ?? 'Sem categoria',
      favorecido: l.favorecido ?? null,
      conta: l.conta_id ?? null,
      tipo: l.tipo === 'entrada' ? 'Entrada' : 'Saída',
      valor: numeroDe(l.valor) * (l.tipo === 'entrada' ? 1 : -1),
      origem: l.origem ?? null,
      baixadoEm: soData(l.baixado_em),
    })
  }
  linhas.sort((a, b) => String(b.dia ?? '').localeCompare(String(a.dia ?? '')))

  const entradas = linhas.filter((l) => Number(l.valor) > 0).reduce((a, l) => a + Number(l.valor), 0)
  const saidas = linhas.filter((l) => Number(l.valor) < 0).reduce((a, l) => a - Number(l.valor), 0)
  return {
    colunas: [
      { chave: 'dia', rotulo: 'Dia', tipo: 'data' },
      { chave: 'descricao', rotulo: 'Descrição', tipo: 'texto' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'favorecido', rotulo: 'Favorecido', tipo: 'texto', secundaria: true },
      { chave: 'conta', rotulo: 'Conta', tipo: 'texto', secundaria: true },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'dinheiro' },
      { chave: 'origem', rotulo: 'Origem', tipo: 'texto', secundaria: true },
      { chave: 'baixadoEm', rotulo: 'Baixado em', tipo: 'data', secundaria: true },
    ],
    kpis: [
      { rotulo: 'Lançamentos', valor: num(linhas.length) },
      { rotulo: 'Entrou', valor: brl(entradas) },
      { rotulo: 'Saiu', valor: brl(saidas) },
      { rotulo: 'Saldo do período', valor: brl(entradas - saidas), nota: 'inclui transferências' },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum lançamento nesta janela.',
  }
}

// ── Logística ──────────────────────────────────────────────────────────────

async function entregasPorTransportadora(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ps = await pedidosPagos(f)

  const mapa = new Map<
    string,
    { transportadora: string; enviados: number; entregues: number; somaDias: number; comPrazo: number; atrasados: number }
  >()
  for (const p of ps) {
    if (p.envio === 'nao_iniciado' || !p.envio) continue
    const { transportadora } = identificarFrete(p.servico_frete, p.rastreio)
    const l = mapa.get(transportadora) ?? {
      transportadora,
      enviados: 0,
      entregues: 0,
      somaDias: 0,
      comPrazo: 0,
      atrasados: 0,
    }
    l.enviados += 1
    if (p.entregue_em) {
      l.entregues += 1
      const dias = Math.round(
        (Date.parse(p.entregue_em) - Date.parse(p.comprado_em)) / 86_400_000,
      )
      if (dias >= 0 && dias < 180) {
        l.somaDias += dias
        l.comPrazo += 1
      }
      if (p.entrega_prevista_em && p.entregue_em > p.entrega_prevista_em) l.atrasados += 1
    }
    mapa.set(transportadora, l)
  }

  const linhas = [...mapa.values()]
    .sort((a, b) => b.enviados - a.enviados)
    .map((l) => ({
      transportadora: l.transportadora,
      enviados: l.enviados,
      entregues: l.entregues,
      emTransito: l.enviados - l.entregues,
      prazoMedio: l.comPrazo > 0 ? Math.round((l.somaDias / l.comPrazo) * 10) / 10 : null,
      atrasados: l.atrasados,
      taxaAtraso: l.entregues > 0 ? (l.atrasados / l.entregues) * 100 : 0,
    }))

  const enviados = linhas.reduce((a, l) => a + l.enviados, 0)
  const entregues = linhas.reduce((a, l) => a + l.entregues, 0)
  return {
    colunas: [
      { chave: 'transportadora', rotulo: 'Transportadora', tipo: 'texto' },
      { chave: 'enviados', rotulo: 'Enviados', tipo: 'numero' },
      { chave: 'entregues', rotulo: 'Entregues', tipo: 'numero' },
      { chave: 'emTransito', rotulo: 'Em trânsito', tipo: 'numero' },
      { chave: 'prazoMedio', rotulo: 'Dias até entregar', tipo: 'numero' },
      { chave: 'atrasados', rotulo: 'Fora do prazo', tipo: 'numero', secundaria: true },
      { chave: 'taxaAtraso', rotulo: '% de atraso', tipo: 'percentual' },
    ],
    kpis: [
      { rotulo: 'Enviados', valor: num(enviados) },
      { rotulo: 'Entregues', valor: num(entregues), nota: pct(enviados > 0 ? (entregues / enviados) * 100 : 0) },
      {
        rotulo: 'Prazo médio',
        valor: (() => {
          const comDias = linhas.filter((l) => l.prazoMedio !== null)
          const soma = comDias.reduce((a, l) => a + (l.prazoMedio ?? 0) * l.entregues, 0)
          const qtd = comDias.reduce((a, l) => a + l.entregues, 0)
          return qtd > 0 ? `${num(Math.round((soma / qtd) * 10) / 10)} dias` : '—'
        })(),
        nota: 'da compra até a entrega',
      },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum pedido enviado nesta janela.',
  }
}

async function devolucoesPorMotivo(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const ds = await tudoDe<{
    protocolo: string
    tipo: string
    motivo: string | null
    status: string
    aberta_em: string
    reembolso_valor: number | string | null
    pedido_id: string
  }>('solicitacoes_devolucao', (de, ate) =>
    comoPagina(
      janela(
        supabaseServer()
          .from('solicitacoes_devolucao')
          .select('protocolo, tipo, motivo, status, aberta_em, reembolso_valor, pedido_id'),
        'aberta_em',
        f,
      ).range(de, ate),
    ),
  )

  const mapa = new Map<string, { motivo: string; tipo: string; casos: number; concluidas: number; recusadas: number; reembolsado: number }>()
  for (const d of ds) {
    const motivo = d.motivo ?? 'Sem motivo'
    if (!passaNaBusca(f.q, motivo, d.tipo, d.status)) continue
    const chave = `${motivo}|${d.tipo}`
    const l = mapa.get(chave) ?? { motivo, tipo: d.tipo, casos: 0, concluidas: 0, recusadas: 0, reembolsado: 0 }
    l.casos += 1
    if (d.status === 'Concluída') l.concluidas += 1
    if (d.status === 'Recusada') l.recusadas += 1
    l.reembolsado += numeroDe(d.reembolso_valor)
    mapa.set(chave, l)
  }
  const linhas = [...mapa.values()].sort((a, b) => b.casos - a.casos)

  return {
    colunas: [
      { chave: 'motivo', rotulo: 'Motivo', tipo: 'texto' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'casos', rotulo: 'Casos', tipo: 'numero' },
      { chave: 'concluidas', rotulo: 'Concluídas', tipo: 'numero', secundaria: true },
      { chave: 'recusadas', rotulo: 'Recusadas', tipo: 'numero', secundaria: true },
      { chave: 'reembolsado', rotulo: 'Reembolsado', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Devoluções', valor: num(linhas.reduce((a, l) => a + l.casos, 0)) },
      { rotulo: 'Reembolsado', valor: brl(linhas.reduce((a, l) => a + l.reembolsado, 0)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length
      ? undefined
      : 'Nenhuma devolução aberta nesta janela — o portal está no ar e ainda não recebeu solicitação.',
  }
}

// ── Estoque ────────────────────────────────────────────────────────────────

async function coberturaDeEstoque(f: FiltrosRelatorio): Promise<ResultadoRelatorio> {
  const bases = await tudoDe<{
    id: string
    nome: string
    marca: string | null
    ativo: boolean
    volume_ml: number | string | null
    reservado_ml: number | string | null
    disponivel_ml: number | string | null
    consumo_diario_ml: number | string | null
    custo_por_ml: number | string | null
  }>('perfumes_base', (de, ate) =>
    supabaseServer()
      .from('perfumes_base')
      .select('id, nome, marca, ativo, volume_ml, reservado_ml, disponivel_ml, consumo_diario_ml, custo_por_ml')
      .range(de, ate),
  )

  const linhas = bases
    .filter((b) => b.ativo && passaNaBusca(f.q, b.nome, b.marca))
    .map((b) => {
      const disponivel = numeroDe(b.disponivel_ml)
      const consumo = numeroDe(b.consumo_diario_ml)
      return {
        perfume: b.nome,
        marca: b.marca ?? null,
        disponivelMl: disponivel,
        reservadoMl: numeroDe(b.reservado_ml),
        consumoDia: consumo,
        // Sem consumo medido não existe cobertura. Escrever "999 dias" seria
        // inventar tranquilidade onde há só falta de histórico.
        diasDeCobertura: consumo > 0 ? Math.floor(disponivel / consumo) : null,
        valorEmEstoque: disponivel * numeroDe(b.custo_por_ml),
      }
    })
    .sort((a, b) => {
      if (a.diasDeCobertura === null) return 1
      if (b.diasDeCobertura === null) return -1
      return a.diasDeCobertura - b.diasDeCobertura
    })

  const critico = linhas.filter((l) => l.diasDeCobertura !== null && l.diasDeCobertura <= 15)
  return {
    colunas: [
      { chave: 'perfume', rotulo: 'Perfume', tipo: 'texto' },
      { chave: 'marca', rotulo: 'Marca', tipo: 'texto', secundaria: true },
      { chave: 'disponivelMl', rotulo: 'Disponível', tipo: 'ml' },
      { chave: 'reservadoMl', rotulo: 'Reservado', tipo: 'ml', secundaria: true },
      { chave: 'consumoDia', rotulo: 'Consumo/dia', tipo: 'ml', secundaria: true },
      { chave: 'diasDeCobertura', rotulo: 'Dias de cobertura', tipo: 'numero' },
      { chave: 'valorEmEstoque', rotulo: 'Valor parado', tipo: 'dinheiro' },
    ],
    kpis: [
      { rotulo: 'Bases ativas', valor: num(linhas.length) },
      { rotulo: 'Cobertura crítica', valor: num(critico.length), nota: 'até 15 dias' },
      { rotulo: 'Valor em estoque', valor: brl(linhas.reduce((a, l) => a + l.valorEmEstoque, 0)) },
    ],
    ...cortar(linhas, f),
    vazioPorque: linhas.length ? undefined : 'Nenhum perfume base ativo no catálogo.',
  }
}

// ── Catálogo ───────────────────────────────────────────────────────────────

type Carregador = (f: FiltrosRelatorio) => Promise<ResultadoRelatorio>

const CARREGADORES: Record<string, Carregador> = {
  'clientes-por-cidade': clientesPorCidade,
  'clientes-por-estado': clientesPorEstado,
  'clientes-novos': clientesNovos,
  'clientes-recorrentes': clientesRecorrentes,
  'clientes-inativos': clientesInativos,
  'ranking-de-clientes': rankingDeClientes,
  aniversariantes,
  'cashback-com-saldo': cashbackComSaldo,
  'cashback-a-expirar': cashbackAExpirar,
  'cashback-usado': cashbackUsado,
  'vendas-por-produto': vendasPorProduto,
  'vendas-por-dia': vendasPorDia,
  'vendas-por-estado': vendasPorUf,
  'vendas-por-canal': vendasPorCanal,
  'resultado-por-categoria': resultadoPorCategoria,
  'lancamentos-do-periodo': lancamentosDoPeriodo,
  'entregas-por-transportadora': entregasPorTransportadora,
  'devolucoes-por-motivo': devolucoesPorMotivo,
  'cobertura-de-estoque': coberturaDeEstoque,
}

export const RELATORIOS: DefinicaoRelatorio[] = [
  {
    id: 'clientes-por-cidade',
    grupo: 'Clientes',
    titulo: 'Clientes por cidade',
    responde: 'Em que cidades estão os clientes que compram — e quanto cada uma vale',
    icone: 'mapa',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'clientes-por-estado',
    grupo: 'Clientes',
    titulo: 'Clientes por estado',
    responde: 'A distribuição por UF, com participação na receita',
    icone: 'mapa',
    usaData: true,
    usaUf: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'ranking-de-clientes',
    grupo: 'Clientes',
    titulo: 'Ranking de clientes',
    responde: 'Quem mais gasta no período, com ticket médio e última compra',
    icone: 'estrela',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'clientes-novos',
    grupo: 'Clientes',
    titulo: 'Clientes novos',
    responde: 'Quem comprou pela primeira vez na janela',
    icone: 'pessoa',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'data da primeira compra',
  },
  {
    id: 'clientes-recorrentes',
    grupo: 'Clientes',
    titulo: 'Clientes recorrentes',
    responde: 'Quem comprou mais de uma vez — e qual a taxa de recompra',
    icone: 'repetir',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'clientes-inativos',
    grupo: 'Clientes',
    titulo: 'Clientes parados',
    responde: 'Quem comprava e sumiu — a lista para reativar',
    icone: 'relogio',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'sem comprar desde esta data (padrão: 90 dias)',
  },
  {
    id: 'aniversariantes',
    grupo: 'Clientes',
    titulo: 'Aniversariantes',
    responde: 'Quem faz aniversário na faixa — a base do giftback',
    icone: 'presente',
    usaData: true,
    usaUf: true,
    usaBusca: true,
    notaDaData: 'dia e mês do aniversário (o ano é ignorado)',
  },
  {
    id: 'cashback-com-saldo',
    grupo: 'Cashback',
    titulo: 'Clientes com cashback',
    responde: 'Quem tem saldo hoje, quanto e até quando',
    icone: 'moeda',
    usaData: true,
    usaBusca: true,
    notaDaData: 'validade do saldo',
  },
  {
    id: 'cashback-a-expirar',
    grupo: 'Cashback',
    titulo: 'Cashback a expirar',
    responde: 'Saldo prestes a virar pó — quem avisar primeiro',
    icone: 'alerta',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data de expiração',
  },
  {
    id: 'cashback-usado',
    grupo: 'Cashback',
    titulo: 'Quem usou cashback',
    responde: 'Os resgates: quem, quando, em qual pedido e quanto',
    icone: 'moeda',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data do resgate',
  },
  {
    id: 'vendas-por-produto',
    grupo: 'Vendas',
    titulo: 'Curva ABC de perfumes',
    responde: 'Quais perfumes sustentam o faturamento, em unidades e receita',
    icone: 'frasco',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'vendas-por-dia',
    grupo: 'Vendas',
    titulo: 'Vendas por dia',
    responde: 'O dia a dia do faturamento, com ticket médio',
    icone: 'calendario',
    usaData: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'vendas-por-estado',
    grupo: 'Vendas',
    titulo: 'Vendas por estado',
    responde: 'Para onde os pedidos vão, e quanto cada UF fatura',
    icone: 'mapa',
    usaData: true,
    usaUf: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'vendas-por-canal',
    grupo: 'Vendas',
    titulo: 'Vendas por canal e meio de pagamento',
    responde: 'De onde vem a venda e por qual gateway o dinheiro entra',
    icone: 'loja',
    usaData: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'resultado-por-categoria',
    grupo: 'Financeiro',
    titulo: 'Resultado por categoria',
    responde: 'Entrou e saiu por categoria — sem transferência entre contas próprias',
    icone: 'balanca',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data do movimento',
  },
  {
    id: 'lancamentos-do-periodo',
    grupo: 'Financeiro',
    titulo: 'Lançamentos do período',
    responde: 'A lista crua de tudo que entrou e saiu, pronta para planilha',
    icone: 'recibo',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data do movimento',
  },
  {
    id: 'entregas-por-transportadora',
    grupo: 'Logística',
    titulo: 'Desempenho das transportadoras',
    responde: 'Quantos dias cada uma leva e quantos pedidos passam do prazo',
    icone: 'caminhao',
    usaData: true,
    notaDaData: 'data da compra',
  },
  {
    id: 'devolucoes-por-motivo',
    grupo: 'Logística',
    titulo: 'Devoluções por motivo',
    responde: 'Por que os clientes devolvem e quanto isso custou em reembolso',
    icone: 'retorno',
    usaData: true,
    usaBusca: true,
    notaDaData: 'data de abertura',
  },
  {
    id: 'cobertura-de-estoque',
    grupo: 'Estoque',
    titulo: 'Cobertura de estoque',
    responde: 'Quantos dias cada perfume base ainda aguenta no ritmo atual',
    icone: 'caixa',
    usaData: false,
    usaBusca: true,
  },
]

/**
 * As UFs que EXISTEM no cadastro, para o seletor da barra de filtros.
 *
 * Lista fixa dos 27 estados ofereceria filtro que devolve tabela vazia em 20
 * deles — controle que existe e não serve para nada.
 */
export async function ufsCadastradas(): Promise<string[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('clientes')
    .select('uf')
    .not('uf', 'is', null)
    .limit(2000)
  if (error) {
    console.error('[relatorios] não consegui listar as UFs:', error.message)
    return []
  }
  const ufs = new Set<string>()
  for (const l of (data ?? []) as { uf: string | null }[]) {
    if (l.uf) ufs.add(l.uf.toUpperCase())
  }
  return [...ufs].sort()
}

export function acharRelatorio(id: string): DefinicaoRelatorio | null {
  return RELATORIOS.find((r) => r.id === id) ?? null
}

export async function rodarRelatorio(
  id: string,
  filtros: FiltrosRelatorio,
): Promise<ResultadoRelatorio> {
  if (!supabaseConfigurado()) return vazio(SEM_BANCO)
  const carregar = CARREGADORES[id]
  if (!carregar) return vazio('Relatório não encontrado.')
  try {
    return await carregar(filtros)
  } catch (e) {
    // Erro engolido vira tabela vazia com cara de "não tem dado" — e foi assim
    // que um indicador ficou zerado por semanas neste ERP. Aqui ele aparece.
    console.error(`[relatorios] ${id} falhou:`, e)
    return vazio(
      `O relatório não pôde ser montado: ${e instanceof Error ? e.message : 'falha ao consultar o banco'}.`,
    )
  }
}
