'use server'

import { avisarDevolucaoAberta } from '@/data/notificacoes'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import {
  MOTIVOS,
  ehDanificado,
  etapaDe,
  fotosCompletas,
  identificarFrete,
  statusDevolucao,
} from '@/domain'
import type { MotivoDevolucao, PedidoPortal, TipoSolicitacao, VarianteMl } from '@/domain'

const LIMITE_DE_PEDIDOS = 20

function dataCurtaPt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * Busca os pedidos do cliente pelo e-mail ou CPF informado no passo 1.
 *
 * Este endpoint é PÚBLICO: quem souber um e-mail consegue chamá-lo. Por isso
 * ele devolve o recorte `PedidoPortal` — id, itens, valor e prazo, e NUNCA
 * CPF, telefone ou endereço — e consulta o banco já filtrado, em vez de
 * carregar a lista inteira de pedidos para escolher no servidor.
 *
 * A elegibilidade NÃO é decidida aqui: o portal aplica `statusDevolucao`
 * sobre os dias desde a entrega, a mesma função que o ERP usa. Assim o
 * cliente e o operador nunca veem prazos diferentes para o mesmo pedido.
 */
export async function buscarPedidos(
  metodo: 'email' | 'cpf',
  identificacao: string,
): Promise<PedidoPortal[]> {
  const alvo =
    metodo === 'cpf'
      ? identificacao.replace(/\D/g, '')
      : identificacao.trim().toLowerCase()

  // Formato inválido nem chega ao banco — corta tentativa de varredura barata.
  if (metodo === 'cpf' && alvo.length !== 11) return []
  if (metodo === 'email' && (alvo.length < 6 || !alvo.includes('@'))) return []

  // Sem Supabase (desenvolvimento local), as fixtures respondem.
  if (!supabaseConfigurado()) {
    const todos = await repositorio().pedidos()
    return todos
      .filter((p) => (metodo === 'cpf' ? p.cpf === alvo : p.email.toLowerCase() === alvo))
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, LIMITE_DE_PEDIDOS)
      .map((p) => ({
        id: p.id,
        data: p.data,
        valor: p.valor,
        situacao: p.situacao,
        entregueEm: p.entregueEm,
        diasDesdeEntrega: p.diasDesdeEntrega,
        gateway: p.gateway,
        itens: p.itens.map((i) => ({
          perfume: i.perfume,
          marca: i.marca,
          variante: i.variante,
          preco: i.preco,
          imagem: i.imagem ?? null,
        })),
      }))
  }

  const sb = supabaseServer()
  const { data, error } = await sb
    .from('pedidos')
    .select(
      'id, comprado_em, valor, situacao, entregue_em, entrega_prevista_em, ' +
        'servico_frete, rastreio, pedido_itens(descricao, variante, preco, base_id), ' +
        'clientes!inner(email, cpf)',
    )
    .eq(metodo === 'cpf' ? 'clientes.cpf' : 'clientes.email', alvo)
    .order('comprado_em', { ascending: false })
    .limit(LIMITE_DE_PEDIDOS)
  if (error) {
    console.error('[portal] busca de pedidos falhou:', error)
    return []
  }

  const linhas = (data ?? []) as unknown as {
    id: string
    comprado_em: string
    valor: number | string
    situacao: string | null
    entregue_em: string | null
    entrega_prevista_em: string | null
    servico_frete: string | null
    rastreio: string | null
    pedido_itens: { descricao: string; variante: number | null; preco: number | string; base_id: string | null }[]
  }[]
  if (!linhas.length) return []

  // A foto do item vem do catálogo — mesma resolução das telas do ERP: pelo
  // base_id casado na importação ou, sem ele, pelo nome contido na descrição
  // (nomes mais longos primeiro, "Sauvage Elixir" vence "Sauvage").
  const { data: bases } = await sb
    .from('perfumes_base')
    .select('id, nome, imagem_url')
    .not('imagem_url', 'is', null)
  const imagemPorId = new Map<string, string>()
  const porNome: { nome: string; url: string }[] = []
  for (const b of (bases ?? []) as { id: string; nome: string; imagem_url: string }[]) {
    imagemPorId.set(b.id, b.imagem_url)
    porNome.push({ nome: b.nome.toLowerCase(), url: b.imagem_url })
  }
  porNome.sort((a, b) => b.nome.length - a.nome.length)
  const imagemDe = (baseId: string | null, descricao: string): string | null => {
    if (baseId) {
      const direta = imagemPorId.get(baseId)
      if (direta) return direta
    }
    const alvoNome = descricao.toLowerCase()
    return porNome.find((c) => alvoNome.includes(c.nome))?.url ?? null
  }

  const dia = 86_400_000
  return linhas.map((p): PedidoPortal => {
    // Mesmo relógio reserva das telas: sem a entrega real, vale a prometida.
    const base =
      p.entregue_em ?? (p.situacao === 'entregue' ? p.entrega_prevista_em : null)
    return {
      id: p.id,
      data: dataCurtaPt(p.comprado_em),
      valor: Number(p.valor),
      situacao: (p.situacao ?? 'pago') as PedidoPortal['situacao'],
      entregueEm: p.entregue_em,
      diasDesdeEntrega: base ? Math.floor((Date.now() - Date.parse(base)) / dia) : null,
      gateway: identificarFrete(p.servico_frete, p.rastreio).gateway,
      itens: (p.pedido_itens ?? []).map((i) => ({
        perfume: i.descricao,
        marca: '',
        // Kit e frasco lacrado não têm fracionamento. O `?? 5` que ficava
        // aqui dizia ao cliente que o vidro de 100 ml dele era um decant de
        // 5 ml — e a conferência de volume mediria contra esse número.
        variante: (i.variante ?? null) as VarianteMl | null,
        preco: Number(i.preco),
        imagem: imagemDe(i.base_id, i.descricao),
      })),
    }
  })
}

const TIPOS_DE_IMAGEM = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const TAMANHO_MAXIMO = 8 * 1024 * 1024

function extensaoDe(arquivo: File): string {
  const daExtensao = arquivo.name.split('.').pop()?.toLowerCase()
  if (daExtensao && /^[a-z0-9]{2,5}$/.test(daExtensao)) return daExtensao
  return arquivo.type.split('/')[1] ?? 'jpg'
}

/**
 * Abre a devolução de verdade — protocolo do banco e fotos no bucket.
 *
 * Chega por FormData porque agora carrega ARQUIVOS: as fotos do nível e do
 * lacre sobem para um bucket privado e a triagem do ERP as vê por URL
 * assinada — acabou o "confirmo que tirei a foto" com o arquivo preso no
 * celular do cliente.
 *
 * A elegibilidade é reconferida AQUI, no servidor: o endpoint é público, e a
 * checagem do navegador é cortesia de interface, não segurança.
 */
export async function abrirDevolucao(
  form: FormData,
): Promise<{ ok: true; protocolo: string } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação agora. Tente novamente em alguns minutos.',
    }
  }

  const pedidoId = String(form.get('pedidoId') ?? '')
  const motivo = String(form.get('motivo') ?? '') as MotivoDevolucao | ''
  const comentario = String(form.get('comentario') ?? '').slice(0, 2000)
  const itens = form.getAll('item').map(String).filter(Boolean)

  if (!pedidoId) return { ok: false, erro: 'Escolha o pedido.' }
  // O endpoint é público: itens são texto do cliente e entram na ficha da
  // triagem — tamanho e quantidade têm teto para ninguém gravar romance.
  if (!itens.length) return { ok: false, erro: 'Escolha ao menos um item.' }
  if (itens.length > 20 || itens.some((i) => i.length > 160)) {
    return { ok: false, erro: 'Lista de itens inválida.' }
  }
  if (!motivo || !MOTIVOS.some((m) => m.id === motivo)) {
    return { ok: false, erro: 'Informe o motivo da devolução.' }
  }

  // Nível e lacre, sempre — a MESMA regra da tela (`fotosCompletas`). Esta
  // é a barreira que vale: a tela pode ser burlada, o servidor não.
  const arquivoNivel = form.get('fotoNivel')
  const arquivoLacre = form.get('fotoLacre')
  const fotos = {
    nivel: arquivoNivel instanceof File && arquivoNivel.size > 0,
    lacre: arquivoLacre instanceof File && arquivoLacre.size > 0,
  }
  if (!fotosCompletas(motivo, fotos)) {
    return { ok: false, erro: 'Envie as fotos obrigatórias antes de concluir.' }
  }
  for (const arquivo of [arquivoNivel, arquivoLacre]) {
    if (!(arquivo instanceof File) || arquivo.size === 0) continue
    if (!TIPOS_DE_IMAGEM.has(arquivo.type)) {
      return { ok: false, erro: 'As fotos precisam ser imagens (JPG, PNG, WEBP ou HEIC).' }
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      return { ok: false, erro: 'Cada foto pode ter no máximo 8 MB.' }
    }
  }

  const sb = supabaseServer()

  // Reconferência de prazo no servidor, com o mesmo relógio das telas:
  // entrega real e, na falta dela, a prometida no checkout.
  const { data: pedido, error: erroPedido } = await sb
    .from('pedidos')
    .select('id, situacao, entregue_em, entrega_prevista_em')
    .eq('id', pedidoId)
    .maybeSingle()
  if (erroPedido || !pedido) {
    return { ok: false, erro: 'Pedido não encontrado. Confira e tente de novo.' }
  }
  const base =
    (pedido.entregue_em as string | null) ??
    (pedido.situacao === 'entregue' ? (pedido.entrega_prevista_em as string | null) : null)
  const dias = base ? Math.floor((Date.now() - Date.parse(base)) / 86_400_000) : null
  if (!statusDevolucao(dias).elegivel) {
    return {
      ok: false,
      erro: 'Este pedido está fora do prazo de devolução. Fale com o atendimento.',
    }
  }

  const rotulo = MOTIVOS.find((m) => m.id === motivo)
  // O tipo decide a régua da triagem: em arrependimento, volume abaixo do
  // mínimo bloqueia; em defeito e erro de envio a perda é esperada. m2 é
  // "recebi produto diferente" (erro de envio) e m4 é "volume abaixo do que
  // comprei" (defeito de envase) — mapear qualquer um deles como
  // arrependimento faria a triagem recusar cliente com razão.
  const tipo: TipoSolicitacao = ehDanificado(motivo)
    ? 'Defeito'
    : motivo === 'm2'
      ? 'Erro de envio'
      : motivo === 'm4'
        ? 'Defeito'
        : 'Arrependimento'

  const { data, error } = await sb.rpc('abrir_solicitacao_devolucao', {
    p_pedido_id: pedidoId,
    p_tipo: tipo,
    p_motivo: rotulo?.label ?? '',
    p_comentario: comentario,
    p_itens: itens,
    p_fotos: fotos,
  })

  if (error) {
    console.error('[portal] abrir_solicitacao_devolucao falhou:', error)
    // A mensagem crua do banco é interna; o cliente recebe o que dá para agir.
    return {
      ok: false,
      erro: 'Não foi possível registrar a solicitação. Fale com a gente pelo e-mail de contato.',
    }
  }

  const protocolo = String(data)

  // Upload DEPOIS do protocolo existir: o caminho carrega o protocolo, e uma
  // falha aqui não desfaz a solicitação — a foto pode ser reapresentada na
  // análise, o registro não.
  const subir = async (arquivo: unknown, nome: 'nivel' | 'lacre') => {
    if (!(arquivo instanceof File) || arquivo.size === 0) return null
    const caminho = `${protocolo}/${nome}.${extensaoDe(arquivo)}`
    const { error: erroUpload } = await sb.storage
      .from('devolucoes')
      .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
    if (erroUpload) {
      console.error(`[portal] upload da foto ${nome} de ${protocolo} falhou:`, erroUpload)
      return null
    }
    return caminho
  }
  const [caminhoNivel, caminhoLacre] = await Promise.all([
    subir(arquivoNivel, 'nivel'),
    subir(arquivoLacre, 'lacre'),
  ])
  if (caminhoNivel || caminhoLacre) {
    await sb
      .from('solicitacoes_devolucao')
      .update({ foto_nivel: caminhoNivel, foto_lacre: caminhoLacre })
      .eq('protocolo', protocolo)
  }

  // Confirmação por e-mail — pronta, mas atrás da trava AVISOS_DE_PEDIDO:
  // desligada, o fato entra no log como dispensado e nada sai. A função nunca
  // lança; a solicitação registrada é o que importa.
  await avisarDevolucaoAberta(protocolo)

  return { ok: true, protocolo }
}

/**
 * Acompanhamento por protocolo — a devolução vista pelo CLIENTE.
 *
 * A dupla chave (protocolo + e-mail ou CPF da compra) é o que impede curioso
 * com um protocolo alheio de ler o caso: protocolo sozinho circula em print,
 * a identidade não. A resposta é outro recorte mínimo — status, reverso e
 * comprovante — e o comprovante sai por URL assinada de vida curta.
 */
export interface AcompanhamentoDevolucao {
  protocolo: string
  pedidoId: string
  status: string
  /** 0..4 na régua Solicitação → Resolução. */
  etapa: number
  recusada: boolean
  abertaEm: string
  /** Código de postagem reversa, quando já gerado. */
  reverso: string | null
  resolucao: string | null
  reembolsoValor: number | null
  reembolsoForma: 'pix' | 'estorno-cartao' | null
  reembolsoEm: string | null
  comprovanteUrl: string | null
  trocaPedidoId: string | null
}

export async function consultarDevolucao(
  protocoloBruto: string,
  identificacao: string,
): Promise<{ ok: true; devolucao: AcompanhamentoDevolucao } | { ok: false; erro: string }> {
  const protocolo = protocoloBruto.trim().toUpperCase()
  const ident = identificacao.trim()
  const naoEncontrada = {
    ok: false as const,
    erro: 'Não encontramos essa devolução. Confira o protocolo e o e-mail ou CPF da compra.',
  }

  if (!/^DEV-\d{1,10}$/.test(protocolo) || ident.length < 6) return naoEncontrada

  // Só dígitos é CPF; o resto é e-mail — o cliente não precisa escolher.
  const digitos = ident.replace(/\D/g, '')
  const ehCpf = digitos.length === 11 && /^[\d.\-\s]+$/.test(ident)
  const alvo = ehCpf ? digitos : ident.toLowerCase()

  if (!supabaseConfigurado()) {
    // Fixtures (desenvolvimento local): só o caminho por e-mail existe.
    const s = (await repositorio().solicitacoes()).find(
      (x) => x.id === protocolo && !ehCpf && x.email.toLowerCase() === alvo,
    )
    if (!s) return naoEncontrada
    return {
      ok: true,
      devolucao: {
        protocolo: s.id,
        pedidoId: s.pedidoId,
        status: s.status,
        etapa: etapaDe(s.status),
        recusada: s.status === 'Recusada',
        abertaEm: s.abertura,
        reverso: s.reverso || null,
        resolucao: s.resolucao ?? null,
        reembolsoValor: s.reembolsoValor ?? null,
        reembolsoForma: s.reembolsoForma ?? null,
        reembolsoEm: null,
        comprovanteUrl: null,
        trocaPedidoId: s.trocaPedidoId ?? null,
      },
    }
  }

  const sb = supabaseServer()
  const { data } = await sb
    .from('solicitacoes_devolucao')
    .select(
      'protocolo, pedido_id, status, aberta_em, reverso, resolucao, reembolso_valor, ' +
        'reembolso_forma, reembolso_em, comprovante_reembolso, troca_pedido_id, ' +
        'pedidos(clientes(email, cpf))',
    )
    .eq('protocolo', protocolo)
    .maybeSingle()
  const s = data as unknown as {
    protocolo: string
    pedido_id: string
    status: string
    aberta_em: string
    reverso: string
    resolucao: string | null
    reembolso_valor: number | string | null
    reembolso_forma: 'pix' | 'estorno-cartao' | null
    reembolso_em: string | null
    comprovante_reembolso: string | null
    troca_pedido_id: string | null
    pedidos: { clientes: { email: string | null; cpf: string | null } | null } | null
  } | null
  if (!s) return naoEncontrada

  const cliente = s.pedidos?.clientes
  const confere = ehCpf
    ? (cliente?.cpf ?? '').replace(/\D/g, '') === alvo
    : (cliente?.email ?? '').toLowerCase() === alvo
  if (!confere) return naoEncontrada

  // O comprovante só é assinado quando o caso está concluído — antes disso
  // ele nem existe, e a URL assinada tem 1 hora de vida.
  let comprovanteUrl: string | null = null
  if (s.status === 'Concluída' && s.comprovante_reembolso) {
    const { data: assinada } = await sb.storage
      .from('devolucoes')
      .createSignedUrl(s.comprovante_reembolso, 60 * 60)
    comprovanteUrl = assinada?.signedUrl ?? null
  }

  const dataPt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'America/Sao_Paulo',
        })
      : null

  return {
    ok: true,
    devolucao: {
      protocolo: s.protocolo,
      pedidoId: s.pedido_id,
      status: s.status,
      etapa: etapaDe(s.status as Parameters<typeof etapaDe>[0]),
      recusada: s.status === 'Recusada',
      abertaEm: dataPt(s.aberta_em) ?? '',
      reverso: s.reverso || null,
      resolucao: s.resolucao,
      reembolsoValor: s.reembolso_valor === null ? null : Number(s.reembolso_valor),
      reembolsoForma: s.reembolso_forma,
      reembolsoEm: dataPt(s.reembolso_em),
      comprovanteUrl,
      trocaPedidoId: s.troca_pedido_id,
    },
  }
}
