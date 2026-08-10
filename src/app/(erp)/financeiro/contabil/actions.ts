'use server'

import { revalidatePath } from 'next/cache'

import { emailConfigurado, entregar, montarHtml } from '@/data/email'
import { OPERADOR } from '@/data/operador'
import { mensagemDe } from '@/data/shopify'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, montarFechamento, nomeDaCompetencia } from '@/domain'
import type { Fechamento, LancamentoContabil, VendaContabil } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/**
 * Reúne o mês e monta o arquivo.
 *
 * Fica separado de gravar e de enviar de propósito: quem fecha o mês precisa
 * VER o que vai no arquivo — quantas linhas, quanto de receita, quais
 * categorias estão sem conta — antes de mandar para o contador. Gerar e
 * enviar num clique só transformaria a conferência em fé.
 */
async function apurar(competencia: string): Promise<Fechamento> {
  const sb = supabaseServer()
  const inicio = `${competencia}-01`
  const [ano, mes] = competencia.split('-').map(Number)
  const fim = new Date(ano, mes, 1).toISOString().slice(0, 10)

  const [{ data: pedidos, error: e1 }, { data: lancs, error: e2 }, { data: cats, error: e3 }] =
    await Promise.all([
      sb
        .from('pedidos')
        .select('id, valor, frete, comprado_em')
        .eq('pagamento', 'pago')
        .gte('comprado_em', `${inicio}T00:00:00Z`)
        .lt('comprado_em', `${fim}T00:00:00Z`)
        .limit(5000),
      sb
        .from('lancamentos')
        .select('id, ocorrido_em, descricao, categoria, tipo, valor, pedido_id, contas_bancarias(nome)')
        .gte('ocorrido_em', inicio)
        .lt('ocorrido_em', fim)
        .limit(5000),
      sb.from('categorias_financeiras').select('nome, conta_contabil'),
    ])

  if (e1) throw new Error(mensagemDe(e1))
  if (e2) throw new Error(mensagemDe(e2))
  if (e3) throw new Error(mensagemDe(e3))

  const vendas: VendaContabil[] = (pedidos ?? []).map((p) => ({
    id: p.id as string,
    data: String(p.comprado_em).slice(0, 10),
    valor: Number(p.valor),
    frete: Number(p.frete ?? 0),
  }))

  const lancamentos: LancamentoContabil[] = (
    (lancs ?? []) as unknown as {
      id: string
      ocorrido_em: string
      descricao: string
      categoria: string | null
      tipo: string
      valor: number | string
      pedido_id: string | null
      contas_bancarias: { nome: string } | null
    }[]
  ).map((l) => ({
    id: l.id,
    data: l.ocorrido_em,
    descricao: l.descricao,
    categoria: l.categoria ?? '',
    tipo: l.tipo === 'saida' ? 'saida' : 'entrada',
    valor: Number(l.valor),
    conta: l.contas_bancarias?.nome ?? '—',
    pedidoId: l.pedido_id,
  }))

  const contaDaCategoria = Object.fromEntries(
    (cats ?? [])
      .filter((c) => String(c.conta_contabil ?? '').trim().length > 0)
      .map((c) => [c.nome as string, c.conta_contabil as string]),
  )

  return montarFechamento(competencia, vendas, lancamentos, contaDaCategoria)
}

export async function gerarFechamento(competencia: string): Promise<Resposta<{ fechamento: Fechamento }>> {
  const bloqueio = exigeSupabase('gerar o fechamento')
  if (bloqueio) return bloqueio
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { ok: false, erro: 'Competência inválida.' }

  try {
    return { ok: true, fechamento: await apurar(competencia) }
  } catch (e) {
    console.error('[contabil] gerar fechamento falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/**
 * Grava o arquivo como enviado e, se o e-mail estiver configurado, entrega ao
 * escritório com o CSV em anexo.
 *
 * O estado gravado é "Processando" quando não houve entrega e "Aceito" só
 * quando o provedor confirmou. Marcar como aceito por otimismo faria a tela
 * afirmar que o contador recebeu algo que ninguém mandou.
 */
export async function enviarAoEscritorio(
  competencia: string,
  destinatario: string,
): Promise<Resposta<{ registros: number; arquivo: string; enviado: boolean; detalhe: string }>> {
  const bloqueio = exigeSupabase('registrar o envio')
  if (bloqueio) return bloqueio

  try {
    const f = await apurar(competencia)
    if (f.registros === 0) {
      return { ok: false, erro: `Não há nada em ${nomeDaCompetencia(competencia)} para enviar.` }
    }

    let enviado = false
    let detalhe = 'Arquivo gerado e registrado. Baixe e envie ao escritório.'

    const para = destinatario.trim()
    if (para && emailConfigurado()) {
      await entregar({
        para,
        assunto: `Frenesi · razão de ${nomeDaCompetencia(competencia)}`,
        html: montarHtml({
          titulo: `Razão de ${nomeDaCompetencia(competencia)}`,
          saudacao: 'Olá,',
          corpo: [
            `Segue o razão analítico de ${nomeDaCompetencia(competencia)}, com ${f.registros} registro(s).`,
            `Receita bruta ${brl(f.receita)} · despesas classificadas ${brl(f.despesa)} · outras entradas ${brl(f.outrasEntradas)}.`,
            // Os avisos vão no corpo, não só na tela: quem recebe o arquivo
            // precisa saber que há linha sem conta contábil ANTES de lançar.
            ...f.avisos,
          ],
        }),
        anexos: [{ nome: f.arquivo, conteudo: f.csv }],
      })
      enviado = true
      detalhe = `Enviado para ${para} com o arquivo em anexo.`
    } else if (para && !emailConfigurado()) {
      detalhe =
        'O arquivo foi registrado, mas o e-mail NÃO saiu: falta RESEND_API_KEY e EMAIL_REMETENTE no ambiente.'
    }

    const { error } = await supabaseServer().rpc('registrar_envio_contabil', {
      p_competencia: competencia,
      p_arquivo: f.arquivo,
      p_conteudo: `Razão analítico de ${nomeDaCompetencia(competencia)}`,
      p_corpo: f.csv,
      p_registros: f.registros,
      p_estado: enviado ? 'Aceito' : 'Processando',
      p_nota: enviado ? '' : detalhe,
      p_operador: OPERADOR,
    })
    if (error) throw new Error(mensagemDe(error))

    revalidatePath('/', 'layout')
    return { ok: true, registros: f.registros, arquivo: f.arquivo, enviado, detalhe }
  } catch (e) {
    console.error('[contabil] enviar ao escritório falhou:', e)
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Amarra a categoria à conta do plano do escritório. */
export async function definirContaContabil(categoria: string, conta: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('editar o plano de contas')
  if (bloqueio) return bloqueio

  const { error } = await supabaseServer().rpc('definir_conta_contabil', {
    p_categoria: categoria,
    p_conta: conta,
  })
  if (error) {
    console.error('[contabil] definir_conta_contabil falhou:', error)
    return { ok: false, erro: mensagemDe(error) }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
