'use server'

import { avisarDevolucaoAberta } from '@/data/notificacoes'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import {
  LIMITE_FOTO_BYTES,
  LIMITE_VIDEO_BYTES,
  MOTIVOS,
  TIPOS_DE_IMAGEM,
  TIPOS_DE_VIDEO,
  diasDesdeEntregaDe,
  ehDanificado,
  etapaDe,
  identificarFrete,
  provasCompletas,
  statusDevolucao,
  videoObrigatorio,
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
        devolucaoAberta: null,
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
      'id, comprado_em, valor, situacao, entregue_em, entrega_prevista_em, entrega_shopify_em, ' +
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
    entrega_shopify_em: string | null
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

  // Devolução já aberta bloqueia o pedido: sem isto o cliente refaz o fluxo
  // inteiro e o segundo envio sobrescreve as provas do primeiro.
  const { data: abertas } = await sb
    .from('solicitacoes_devolucao')
    .select('protocolo, pedido_id, status')
    .in('pedido_id', linhas.map((p) => p.id))
    .not('status', 'in', '("Concluída","Recusada")')
  const devolucaoAberta = new Map(
    ((abertas ?? []) as { protocolo: string; pedido_id: string }[]).map((s) => [
      s.pedido_id,
      s.protocolo,
    ]),
  )

  return linhas.map((p): PedidoPortal => {
    return {
      id: p.id,
      data: dataCurtaPt(p.comprado_em),
      valor: Number(p.valor),
      situacao: (p.situacao ?? 'pago') as PedidoPortal['situacao'],
      entregueEm: p.entregue_em,
      // A MESMA função do ERP. Duas cópias da regra é como a data prevista
      // virou relógio e o portal ofereceu 11 dias onde o CDC dá 7.
      diasDesdeEntrega: diasDesdeEntregaDe({
        situacao: p.situacao,
        entregueEm: p.entregue_em,
        entregaShopifyEm: p.entrega_shopify_em,
        entregaPrevistaEm: p.entrega_prevista_em,
      }),
      devolucaoAberta: devolucaoAberta.get(p.id) ?? null,
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

export type CampoDeProva = 'nivel' | 'lacre' | 'video'
const CAMPOS: CampoDeProva[] = ['nivel', 'lacre', 'video']
const BUCKET = 'devolucoes'

function limiteDe(campo: CampoDeProva): number {
  return campo === 'video' ? LIMITE_VIDEO_BYTES : LIMITE_FOTO_BYTES
}
function tiposDe(campo: CampoDeProva): string[] {
  return campo === 'video' ? TIPOS_DE_VIDEO : TIPOS_DE_IMAGEM
}

/** Extensão do nome enviado, saneada — o nome do cliente vira caminho no bucket. */
function extensaoSegura(nome: string, tipo: string): string {
  const daExtensao = nome.split('.').pop()?.toLowerCase()
  if (daExtensao && /^[a-z0-9]{2,5}$/.test(daExtensao)) return daExtensao
  return (tipo.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
}

/**
 * Prepara o envio das provas: URLs assinadas para o navegador subir DIRETO.
 *
 * Antes o arquivo vinha dentro do FormData da server action, ou seja, passava
 * inteiro pela função da Netlify — que recusa requisição acima de ~6 MB. O
 * portal prometia 8 MB por foto e a plataforma cortava antes; duas fotos de
 * celular novo já não cabiam. Vídeo, então, nunca caberia.
 *
 * Agora a função só assina o destino. O byte vai do celular para o Storage,
 * sem intermediário, e o teto passa a ser o do bucket.
 *
 * O endpoint é público, então ele não assina nada sem antes conferir que o
 * pedido existe e está no prazo — a mesma checagem da abertura.
 */
export async function prepararEnvioDeProvas(
  pedidoId: string,
  arquivos: { campo: CampoDeProva; nome: string; tipo: string; tamanho: number }[],
): Promise<
  | { ok: true; rascunho: string; destinos: { campo: CampoDeProva; caminho: string; url: string }[] }
  | { ok: false; erro: string }
> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'Envio indisponível agora. Tente novamente em alguns minutos.' }
  }
  if (!arquivos.length || arquivos.length > CAMPOS.length) {
    return { ok: false, erro: 'Escolha as fotos antes de enviar.' }
  }

  for (const a of arquivos) {
    if (!CAMPOS.includes(a.campo)) return { ok: false, erro: 'Arquivo inválido.' }
    if (!tiposDe(a.campo).includes(a.tipo)) {
      return {
        ok: false,
        erro:
          a.campo === 'video'
            ? 'O vídeo precisa ser MP4, MOV ou WEBM.'
            : 'As fotos precisam ser imagens (JPG, PNG, WEBP ou HEIC).',
      }
    }
    if (a.tamanho <= 0 || a.tamanho > limiteDe(a.campo)) {
      return {
        ok: false,
        erro:
          a.campo === 'video'
            ? 'O vídeo pode ter no máximo 60 MB. Grave uns 15 segundos.'
            : 'Cada foto pode ter no máximo 12 MB.',
      }
    }
  }

  const sb = supabaseServer()
  if (!(await pedidoElegivel(sb, pedidoId))) {
    return { ok: false, erro: 'Pedido não encontrado ou fora do prazo de devolução.' }
  }

  const rascunho = crypto.randomUUID()
  const destinos: { campo: CampoDeProva; caminho: string; url: string }[] = []
  for (const a of arquivos) {
    const caminho = `rascunhos/${rascunho}-${a.campo}.${extensaoSegura(a.nome, a.tipo)}`
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(caminho)
    if (error || !data) {
      console.error('[portal] createSignedUploadUrl falhou:', error)
      return { ok: false, erro: 'Não foi possível preparar o envio. Tente de novo.' }
    }
    destinos.push({ campo: a.campo, caminho, url: data.signedUrl })
  }
  return { ok: true, rascunho, destinos }
}

/**
 * Confere no bucket o que o cliente diz ter enviado.
 *
 * Com upload direto, o servidor não vê o byte passar — então ele confere
 * depois, contra o que o Storage realmente guardou: o caminho tem que
 * pertencer a ESTE rascunho, o objeto tem que existir, e tipo e tamanho têm
 * que respeitar o limite do campo. Sem isso, "o arquivo subiu" seria palavra
 * do navegador, e o navegador é do outro lado.
 */
async function conferirRascunho(
  sb: ReturnType<typeof supabaseServer>,
  rascunho: string,
  caminhos: Record<CampoDeProva, string>,
): Promise<
  { ok: true; provas: Record<CampoDeProva, string | null> } | { ok: false; erro: string }
> {
  const vazio = { nivel: null, lacre: null, video: null } as Record<CampoDeProva, string | null>
  if (!/^[0-9a-f-]{36}$/i.test(rascunho)) {
    return { ok: false, erro: 'Envie as fotos obrigatórias antes de concluir.' }
  }

  const { data: objetos, error } = await sb.storage
    .from(BUCKET)
    .list('rascunhos', { limit: 100, search: rascunho })
  if (error) {
    console.error('[portal] list do rascunho falhou:', error)
    return { ok: false, erro: 'Não foi possível confirmar o envio das fotos. Tente de novo.' }
  }

  const porNome = new Map(
    (objetos ?? []).map((o) => [
      `rascunhos/${o.name}`,
      {
        tamanho: Number(o.metadata?.size ?? 0),
        tipo: String(o.metadata?.mimetype ?? ''),
      },
    ]),
  )

  const provas = { ...vazio }
  for (const campo of CAMPOS) {
    const caminho = caminhos[campo]
    if (!caminho) continue
    if (!caminho.startsWith(`rascunhos/${rascunho}-${campo}.`)) {
      return { ok: false, erro: 'Arquivo inválido. Reenvie as fotos.' }
    }
    const objeto = porNome.get(caminho)
    if (!objeto) {
      return { ok: false, erro: 'O envio não foi concluído. Reenvie as fotos.' }
    }
    if (!tiposDe(campo).includes(objeto.tipo) || objeto.tamanho > limiteDe(campo)) {
      await sb.storage.from(BUCKET).remove([caminho])
      return {
        ok: false,
        erro:
          campo === 'video'
            ? 'O vídeo precisa ser MP4, MOV ou WEBM, com até 60 MB.'
            : 'As fotos precisam ser imagens de até 12 MB.',
      }
    }
    provas[campo] = caminho
  }
  return { ok: true, provas }
}

/** Prazo conferido no servidor, com o mesmo relógio das telas. */
async function pedidoElegivel(
  sb: ReturnType<typeof supabaseServer>,
  pedidoId: string,
): Promise<boolean> {
  if (!pedidoId) return false
  const { data: pedido } = await sb
    .from('pedidos')
    .select('id, situacao, entregue_em, entrega_prevista_em')
    .eq('id', pedidoId)
    .maybeSingle()
  if (!pedido) return false
  const base =
    (pedido.entregue_em as string | null) ??
    (pedido.situacao === 'entregue' ? (pedido.entrega_prevista_em as string | null) : null)
  const dias = base ? Math.floor((Date.now() - Date.parse(base)) / 86_400_000) : null
  return statusDevolucao(dias).elegivel
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

  const sb = supabaseServer()

  // As provas já estão no bucket, sob o rascunho. O que chega aqui é o
  // caminho — e caminho vindo do cliente é palpite até ser conferido contra o
  // rascunho que ESTA sessão assinou.
  const rascunho = String(form.get('rascunho') ?? '')
  const enviados = await conferirRascunho(sb, rascunho, {
    nivel: String(form.get('provaNivel') ?? ''),
    lacre: String(form.get('provaLacre') ?? ''),
    video: String(form.get('provaVideo') ?? ''),
  })
  if (!enviados.ok) return { ok: false, erro: enviados.erro }
  const provas = enviados.provas

  // A MESMA regra da tela (`provasCompletas`). Esta é a barreira que vale: a
  // tela pode ser burlada, o servidor não.
  if (
    !provasCompletas(motivo, {
      nivel: Boolean(provas.nivel),
      lacre: Boolean(provas.lacre),
      video: Boolean(provas.video),
    })
  ) {
    return {
      ok: false,
      erro: videoObrigatorio(motivo)
        ? 'Envie as duas fotos e o vídeo do vazamento antes de concluir.'
        : 'Envie as fotos obrigatórias antes de concluir.',
    }
  }

  if (!(await pedidoElegivel(sb, pedidoId))) {
    return {
      ok: false,
      erro: 'Este pedido está fora do prazo de devolução. Fale com o atendimento.',
    }
  }
  // Uma devolução aberta por pedido. O banco também garante isso por índice,
  // mas a recusa precisa acontecer ANTES do update das provas: a segunda
  // solicitação sobrescrevia a foto da primeira, e trocar a prova depois da
  // análise é justamente o que a triagem não pode permitir.
  const { data: jaAberta } = await sb
    .from('solicitacoes_devolucao')
    .select('protocolo')
    .eq('pedido_id', pedidoId)
    .not('status', 'in', '("Concluída","Recusada")')
    .maybeSingle()
  if (jaAberta?.protocolo) {
    return {
      ok: false,
      erro: `Este pedido já tem a devolução ${jaAberta.protocolo} em andamento. Acompanhe por ela — não é preciso abrir outra.`,
    }
  }

  const fotos = { nivel: Boolean(provas.nivel), lacre: Boolean(provas.lacre) }

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

  // As provas saem do rascunho e passam a morar sob o protocolo. Só depois do
  // protocolo existir: uma falha aqui não desfaz a solicitação — o arquivo
  // segue no rascunho e a triagem o encontra, o registro é o que não pode
  // faltar.
  const mover = async (campo: CampoDeProva) => {
    const origem = provas[campo]
    if (!origem) return null
    const destino = `${protocolo}/${campo}.${origem.split('.').pop()}`
    const { error: erroMove } = await sb.storage.from(BUCKET).move(origem, destino)
    if (erroMove) {
      console.error(`[portal] mover ${campo} de ${protocolo} falhou:`, erroMove)
      return origem
    }
    return destino
  }
  const [caminhoNivel, caminhoLacre, caminhoVideo] = await Promise.all([
    mover('nivel'),
    mover('lacre'),
    mover('video'),
  ])
  await sb
    .from('solicitacoes_devolucao')
    .update({ foto_nivel: caminhoNivel, foto_lacre: caminhoLacre, video: caminhoVideo })
    .eq('protocolo', protocolo)

  // Confirmação por e-mail, atrás da trava AVISOS_DE_DEVOLUCAO:
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
  /** O que a triagem pediu de novo. Só existe em "Aguardando fotos". */
  pedidoDeFotos: string | null
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

  // Dois formatos: o aleatório de hoje ("K7QM-4XT9") e o sequencial antigo
  // ("DEV-1003"), que ainda existe em casos abertos antes da troca. Recusar o
  // antigo deixaria cliente com e-mail na mão sem conseguir consultar.
  const formatoValido = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(protocolo) || /^DEV-\d{1,10}$/.test(protocolo)
  if (!formatoValido || ident.length < 6) return naoEncontrada

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
        pedidoDeFotos: null,
      },
    }
  }

  const sb = supabaseServer()
  const { data } = await sb
    .from('solicitacoes_devolucao')
    .select(
      'protocolo, pedido_id, status, aberta_em, reverso, resolucao, reembolso_valor, ' +
        'reembolso_forma, reembolso_em, comprovante_reembolso, troca_pedido_id, pedido_de_fotos, ' +
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
    pedido_de_fotos: string | null
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
      pedidoDeFotos: s.pedido_de_fotos,
    },
  }
}

/**
 * O cliente responde ao pedido de novas provas.
 *
 * Mesma máquina do envio original — `prepararEnvioDeProvas` assina, o
 * navegador sobe, e aqui os caminhos são conferidos contra o rascunho. O que
 * muda é o destino: em vez de abrir solicitação, troca as provas da que já
 * existe e devolve o caso para análise.
 *
 * A autorização é a mesma da consulta pública: protocolo + e-mail ou CPF da
 * compra. Protocolo sozinho circula em print; a identidade não.
 */
export async function reenviarProvas(
  protocolo: string,
  identificacao: string,
  rascunho: string,
  caminhos: { nivel?: string; lacre?: string; video?: string },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'Envio indisponível agora. Tente novamente em alguns minutos.' }
  }

  const sb = supabaseServer()
  const conferido = await conferirRascunho(sb, rascunho, {
    nivel: caminhos.nivel ?? '',
    lacre: caminhos.lacre ?? '',
    video: caminhos.video ?? '',
  })
  if (!conferido.ok) return { ok: false, erro: conferido.erro }

  const provas = conferido.provas
  if (!provas.nivel && !provas.lacre && !provas.video) {
    return { ok: false, erro: 'Escolha ao menos um arquivo para reenviar.' }
  }

  // As provas vão para debaixo do protocolo com um sufixo de reenvio: o
  // arquivo anterior FICA. Substituir a prova original apagaria o que a
  // triagem já tinha visto, e é justamente o histórico que sustenta a decisão.
  const mover = async (campo: CampoDeProva) => {
    const origem = provas[campo]
    if (!origem) return null
    const destino = `${protocolo}/${campo}-reenvio.${origem.split('.').pop()}`
    const { error } = await sb.storage.from(BUCKET).move(origem, destino)
    if (error) {
      console.error(`[portal] reenvio de ${campo} em ${protocolo} falhou:`, error)
      return origem
    }
    return destino
  }
  const [nivel, lacre, video] = await Promise.all([mover('nivel'), mover('lacre'), mover('video')])

  const { data, error } = await sb.rpc('reenviar_provas_da_devolucao', {
    p_protocolo: protocolo,
    p_identificacao: identificacao,
    p_nivel: nivel,
    p_lacre: lacre,
    p_video: video,
  })
  if (error) {
    console.error('[portal] reenviar_provas_da_devolucao falhou:', error)
    return { ok: false, erro: 'Não foi possível registrar o reenvio. Tente de novo.' }
  }
  if (data !== true) {
    return { ok: false, erro: 'Não encontramos essa devolução aguardando novas fotos.' }
  }

  return { ok: true }
}
