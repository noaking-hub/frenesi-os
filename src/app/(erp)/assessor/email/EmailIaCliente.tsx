'use client'

import Image from 'next/image'
import { useState } from 'react'

import { BotaoSecundario, Losango, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import type { PublicoIa, TipoCampanhaIa } from '@/data/fixtures'
import { CURVA_ABC } from '@/data/fixtures'
import {
  RODIZIO_PADRAO,
  brl,
  calcularPreco,
  montarRodada,
  num,
  pisoMargem,
} from '@/domain'
import type { ItemVitrine, ParametrosPrecificacao, PerfumeBase } from '@/domain'

interface Props {
  campanhas: TipoCampanhaIa[]
  publicos: PublicoIa[]
  vitrine: ItemVitrine[]
  bases: PerfumeBase[]
  parametros: ParametrosPrecificacao
}

interface ProdutoEmail {
  nome: string
  variante: string
  de: number | null
  por: number
  descontoPct: number | null
}

interface Contexto {
  n: number
  descMax: number
  ciclo: number
  menor: string
  publicoN: string
}

interface Variacao {
  rotulo: string
  tom: string
  cta: string
  corpo: string
  aberturaPct: number
  receita: number
  assunto: (c: Contexto) => string
  prechamada: (c: Contexto) => string
}

const EXTENSO: Record<number, string> = {
  1: 'Uma', 2: 'Duas', 3: 'Três', 4: 'Quatro', 5: 'Cinco', 6: 'Seis',
  7: 'Sete', 8: 'Oito', 9: 'Nove', 10: 'Dez', 11: 'Onze', 12: 'Doze',
}

/** Três caminhos por tipo de campanha. O texto é template; os números do
 *  contexto (preços, contagens, descontos) vêm sempre do ERP. */
const TEXTOS: Record<TipoCampanhaIa['id'], Variacao[]> = {
  lancamento: [
    { rotulo: 'Estreia', tom: 'Anúncio seco, foco no produto', cta: 'Conhecer o Layton', corpo: 'Uma imagem grande do frasco, três notas em destaque e a tabela de variantes com preço. Sem promoção.', aberturaPct: 54, receita: 5200, assunto: () => 'Layton chegou · nas cinco variantes', prechamada: (c) => `De 3 a 15 ml · a partir de ${c.menor}` },
    { rotulo: 'Perfil', tom: 'Educativo, ensina a escolher', cta: 'Ver perfil completo', corpo: 'Compara o lançamento com dois perfumes que o cliente já comprou e explica a diferença de projeção e fixação.', aberturaPct: 58, receita: 6100, assunto: () => 'Se você gosta de amadeirado doce, leia isto', prechamada: () => 'O novo Layton e por que ele combina com você' },
    { rotulo: 'Prova', tom: 'Baixa barreira de entrada', cta: 'Começar pelo 3 ml', corpo: 'Argumento do decant: testar antes de investir no frasco cheio, com destaque para as variantes de 3 e 5 ml.', aberturaPct: 51, receita: 4400, assunto: (c) => `Experimente o Layton por ${c.menor}`, prechamada: () => 'Comece pelo menor e decida depois' },
  ],
  ofertas: [
    { rotulo: 'Sóbria', tom: 'Editorial, sem urgência artificial', cta: 'Ver a seleção', corpo: 'Abre com a ideia de redescoberta, apresenta os decants em grade de duas colunas com nota olfativa e preço promocional.', aberturaPct: 46, receita: 3900, assunto: (c) => `${EXTENSO[c.n] ?? c.n} fragrâncias que merecem uma segunda chance`, prechamada: (c) => `Seleção da semana · a partir de ${c.menor}` },
    { rotulo: 'Direta', tom: 'Objetiva, foco em preço e prazo', cta: 'Aproveitar agora', corpo: 'Manchete com o desconto, contagem regressiva do ciclo e lista enxuta com preço de e por.', aberturaPct: 52, receita: 4600, assunto: (c) => `Até ${c.descMax}% off em ${c.n} perfumes · ${c.ciclo} horas`, prechamada: () => 'Depois disso volta ao preço normal' },
    { rotulo: 'Curadoria', tom: 'Pessoal, assinada pela fundadora', cta: 'Conhecer a seleção', corpo: 'Texto em primeira pessoa explicando o critério da seleção, com três destaques comentados.', aberturaPct: 49, receita: 4180, assunto: (c) => `Escolhi estes ${c.n} pensando em você`, prechamada: (c) => `Amadeirados e âmbar · a partir de ${c.menor}` },
  ],
  reativacao: [
    { rotulo: 'Saudade', tom: 'Afetivo, sem cobrança', cta: 'Ver os mais vendidos', corpo: 'Retoma a última fragrância comprada e mostra quatro lançamentos e campeões desde então.', aberturaPct: 38, receita: 2900, assunto: () => 'Faz um tempo que a gente não se vê', prechamada: () => 'Separei o que mais saiu desde a sua última compra' },
    { rotulo: 'Cupom', tom: 'Oferta clara de retorno', cta: 'Usar meu cupom', corpo: 'Cupom VOLTA10 em destaque, prazo curto e grade com os mais vendidos.', aberturaPct: 44, receita: 4300, assunto: () => 'Seu cupom de retorno está esperando', prechamada: () => '10% em qualquer decant, válido por 7 dias' },
    { rotulo: 'Pergunta', tom: 'Abre conversa, coleta motivo', cta: 'Responder em 1 clique', corpo: 'Enquete de um clique com quatro motivos, e ao final o cupom de retorno.', aberturaPct: 41, receita: 1800, assunto: () => 'Foi algo que a gente fez?', prechamada: () => 'Três cliques para nos dizer o motivo' },
  ],
  data: [
    { rotulo: 'Presente certo', tom: 'Resolve a dúvida de quem presenteia', cta: 'Ver kits de presente', corpo: 'Explica o kit descoberta como presente seguro e mostra três combinações prontas.', aberturaPct: 47, receita: 6800, assunto: () => 'Presente de Dia dos Pais sem errar o gosto', prechamada: () => 'Kits de 3 amadeirados para ele escolher' },
    { rotulo: 'Prazo', tom: 'Urgência de logística, não de preço', cta: 'Comprar a tempo', corpo: 'Data limite por região com base no prazo real das transportadoras.', aberturaPct: 53, receita: 5400, assunto: () => 'Últimos dias para chegar antes do Dia dos Pais', prechamada: () => 'Pedidos até quinta com entrega garantida' },
    { rotulo: 'Clássicos', tom: 'Seguro, campeões de venda', cta: 'Ver os clássicos', corpo: 'Curva ABC virando argumento: os quatro mais vendidos com nota e ocasião de uso.', aberturaPct: 45, receita: 5900, assunto: () => 'Os quatro que mais saem como presente', prechamada: (c) => `A partir de ${c.menor}` },
  ],
  vip: [
    { rotulo: 'Antecipado', tom: 'Acesso exclusivo, sem desconto', cta: 'Garantir o meu', corpo: 'Explica que a pré-venda é limitada e mostra o lançamento com estoque reservado.', aberturaPct: 64, receita: 8200, assunto: () => 'Antes de todo mundo: 48 horas de pré-venda', prechamada: (c) => `Reservado para ${c.publicoN} clientes` },
    { rotulo: 'Reconhecimento', tom: 'Agradece o histórico', cta: 'Aproveitar meu benefício', corpo: 'Cita o histórico de compras e libera frete grátis permanente mais acesso antecipado.', aberturaPct: 68, receita: 7400, assunto: (c) => `Você está entre nossos ${c.publicoN} melhores clientes`, prechamada: () => 'Um benefício por conta disso' },
    { rotulo: 'Consultoria', tom: 'Serviço, não venda', cta: 'Falar com a curadoria', corpo: 'Oferece atendimento consultivo pelo WhatsApp com base no histórico olfativo.', aberturaPct: 59, receita: 5100, assunto: () => 'Quer ajuda para escolher o próximo?', prechamada: () => 'Curadoria pessoal por WhatsApp' },
  ],
}

export function EmailIaCliente({ campanhas, publicos, vitrine, bases, parametros }: Props) {
  const [campId, setCampId] = useState<TipoCampanhaIa['id']>('lancamento')
  const [publicoId, setPublicoId] = useState('amadeirados')
  const [variacao, setVariacao] = useState(0)
  const [semente, setSemente] = useState(1)
  const [aprovado, setAprovado] = useState(false)

  const camp = campanhas.find((c) => c.id === campId) ?? campanhas[0]
  const publico = publicos.find((p) => p.id === publicoId) ?? publicos[0]

  // Os produtos do e-mail saem do ERP, nunca da imaginação da IA:
  //  - Coleção Ofertas usa a MESMA rodada do rodízio (piso de margem incluso);
  //  - lançamento/VIP precificam o Layton pelo calcularPreco oficial;
  //  - demais campanhas usam o topo da curva ABC.
  const rodada = montarRodada(vitrine, bases, parametros, RODIZIO_PADRAO, semente)
  const produtos: ProdutoEmail[] =
    camp.id === 'ofertas'
      ? rodada.selecao.map((s) => ({
          nome: s.base.nome,
          variante: `${s.item.variante} ml`,
          de: s.item.preco,
          por: s.preco,
          descontoPct: s.pct,
        }))
      : camp.id === 'lancamento' || camp.id === 'vip'
        ? ([3, 5, 10, 15] as const).map((v) => ({
            nome: 'Layton',
            variante: `${v} ml`,
            de: null,
            por: calcularPreco(3.65, v, parametros).sugerido,
            descontoPct: null,
          }))
        : CURVA_ABC.slice(0, 4).map((a) => {
            const base = bases.find((b) => b.nome === a.produto)
            return {
              nome: a.produto,
              variante: '5 ml',
              de: null,
              por: base ? calcularPreco(base.custoPorMl, 5, parametros).sugerido : 0,
              descontoPct: null,
            }
          })

  const descMax = camp.id === 'ofertas' && rodada.selecao.length
    ? Math.max(...rodada.selecao.map((s) => s.pct))
    : 0
  const contexto: Contexto = {
    n: produtos.length,
    descMax,
    ciclo: RODIZIO_PADRAO.cicloHoras,
    menor: produtos.length ? brl(Math.min(...produtos.map((p) => p.por))) : brl(0),
    publicoN: publico.contatos.toLocaleString('pt-BR'),
  }

  const textos = TEXTOS[camp.id]
  const sel = textos[variacao] ?? textos[0]

  const validacoes = [
    { ok: true, texto: `Os ${produtos.length} produtos têm estoque disponível` },
    {
      ok: true,
      texto:
        camp.id === 'ofertas'
          ? `Nenhum desconto fura o piso de margem de ${num(pisoMargem(parametros))}%`
          : 'Preços de tabela · nenhuma margem comprometida',
    },
    {
      ok: true,
      texto: camp.id === 'reativacao' ? 'Cupom VOLTA10 ativo na Shopify e na Yampi' : 'Cupom não necessário nesta campanha',
    },
    {
      ok: !(camp.id === 'ofertas' && rodada.foraDoPiso.length > 0),
      texto:
        camp.id === 'ofertas' && rodada.foraDoPiso.length > 0
          ? `${rodada.foraDoPiso.length} produtos ficaram de fora: margem abaixo do piso`
          : 'Nenhum produto excluído por margem',
    },
    { ok: true, texto: '312 contatos descadastrados foram removidos do público' },
  ]

  const etapasEnvio = [
    { n: '1', titulo: 'Campanha criada no ESP', desc: 'O ERP envia assunto, HTML e produtos para o Klaviyo por API', feito: aprovado },
    { n: '2', titulo: 'Público sincronizado', desc: `${contexto.publicoN} contatos do segmento "${publico.nome}", já sem descadastrados`, feito: aprovado },
    { n: '3', titulo: 'Teste A/B do assunto', desc: '15% da base recebe as duas melhores versões antes do disparo geral', feito: false },
    { n: '4', titulo: 'Disparo agendado', desc: 'Hoje às 18:00 · horário de maior abertura desta base', feito: false },
    { n: '5', titulo: 'Resultado volta ao ERP', desc: 'Abertura, cliques e receita atribuída aparecem em CRM → E-mails e fluxos', feito: false },
  ]

  const limites = [
    'Publicar sem aprovação humana · todo disparo passa por esta tela',
    'Criar cupom novo · só usa códigos já ativos na Shopify e na Yampi',
    'Incluir produto esgotado ou com margem abaixo do piso',
    'Enviar para quem pediu descadastro ou marcou como spam',
  ]

  const escolher = (id: TipoCampanhaIa['id']) => {
    const alvo = campanhas.find((c) => c.id === id)
    setCampId(id)
    setVariacao(0)
    setAprovado(false)
    if (alvo) setPublicoId(alvo.publicoPadrao)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <Rotulo>Tipo de campanha</Rotulo>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 11 }}>
          {campanhas.map((c) => {
            const ativo = c.id === campId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => escolher(c.id)}
                className="hover:border-ouro/40"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '13px 14px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'rgba(255,255,255,.022)',
                  borderRadius: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: '.16s',
                  minWidth: 0,
                }}
              >
                <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.25, color: ativo ? COR.ouro : 'var(--color-corrente)' }}>
                  {c.nome}
                </span>
                <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}>
                  {c.descricao}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <Rotulo>Para quem</Rotulo>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {publicos.map((p) => {
            const ativo = p.id === publicoId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPublicoId(p.id)
                  setAprovado(false)
                }}
                className="hover:border-ouro/40"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 13px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  borderRadius: 10,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <span className="font-sans" style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.25, color: ativo ? COR.ouro : 'rgba(242,237,227,.66)', whiteSpace: 'nowrap' }}>
                    {p.nome}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
                    {`${p.contatos.toLocaleString('pt-BR')} contatos`}
                  </span>
                </span>
                <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1.3, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}>
                  {p.descricao}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <section
        style={{
          background: 'linear-gradient(160deg,#16141A,#101011)',
          border: '1px solid rgba(239,209,140,.16)',
          borderRadius: 16,
          padding: '19px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Losango />
          <TituloSecao tamanho={15} tom="ouro">
            O que você quer comunicar
          </TituloSecao>
          <div style={{ flex: 1 }} />
          <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.4)', whiteSpace: 'nowrap' }}>
            A IA só usa produtos, preços e públicos que existem no ERP
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 15px',
            borderRadius: 12,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.09)',
          }}
        >
          <span className="font-sans" style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(242,237,227,.85)', flex: 1, textWrap: 'pretty' }}>
            {camp.prompt}
          </span>
          <BotaoSecundario altura={32}>Editar instrução</BotaoSecundario>
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          {(
            [
              { label: 'Campanha', valor: camp.nome, cor: COR.ouro },
              { label: 'Produtos', valor: String(produtos.length), cor: 'var(--color-corrente)' },
              { label: 'Público', valor: `${contexto.publicoN} · ${publico.nome}`, cor: 'var(--color-corrente)' },
              { label: 'Menor preço', valor: contexto.menor, cor: COR.ouro },
              {
                label: 'Desconto máximo',
                valor: descMax ? `${descMax}%` : 'sem desconto',
                cor: descMax ? COR.atencao : 'rgba(242,237,227,.6)',
              },
            ] as const
          ).map((c) => (
            <span key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>{c.label}</Rotulo>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 13, lineHeight: 1, color: c.cor, whiteSpace: 'nowrap' }}>
                {c.valor}
              </span>
            </span>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 384px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TituloSecao tamanho={15.5}>Três caminhos gerados</TituloSecao>
            <div style={{ flex: 1 }} />
            <BotaoSecundario
              altura={32}
              onClick={() => {
                setSemente((s) => s + 1)
                setAprovado(false)
              }}
            >
              Gerar outras
            </BotaoSecundario>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            {textos.map((v, i) => {
              const ativo = i === variacao
              return (
                <button
                  key={v.rotulo}
                  type="button"
                  onClick={() => {
                    setVariacao(i)
                    setAprovado(false)
                  }}
                  className="hover:border-ouro/40"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '15px 16px',
                    border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.08)'}`,
                    background: ativo ? 'rgba(239,209,140,.06)' : 'rgba(255,255,255,.022)',
                    borderRadius: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: '.16s',
                    minWidth: 0,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: '50%',
                        border: `1px solid ${ativo ? COR.ouro : 'rgba(255,255,255,.2)'}`,
                        background: ativo ? COR.ouro : 'transparent',
                        flex: 'none',
                        display: 'block',
                      }}
                    />
                    <span
                      className="font-sans"
                      style={{
                        fontWeight: 600,
                        fontSize: 9.5,
                        lineHeight: 1,
                        letterSpacing: '.11em',
                        textTransform: 'uppercase',
                        color: ativo ? COR.ouro : 'rgba(242,237,227,.55)',
                      }}
                    >
                      {v.rotulo}
                    </span>
                  </span>
                  <span className="font-sans" style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.4, color: 'var(--color-corrente)', textWrap: 'pretty' }}>
                    {v.assunto(contexto)}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
                    {v.prechamada(contexto)}
                  </span>
                  <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}>
                    {v.corpo}
                  </span>
                  <span className="font-mono" style={{ fontWeight: 500, fontSize: 10, lineHeight: 1.3, color: COR.ok }}>
                    {`Abertura prevista ${v.aberturaPct}% · ${brl(v.receita)}`}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <TituloSecao tamanho={15.5}>{`Prévia · versão ${sel.rotulo}`}</TituloSecao>
            <div style={{ flex: 1 }} />
            <BotaoSecundario altura={30}>Ver no celular</BotaoSecundario>
          </div>

          <section
            style={{
              background: '#0B0B0C',
              border: '1px solid var(--color-borda)',
              borderRadius: 'var(--radius-card)',
              padding: 22,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {/* Prévia do e-mail: fundo claro de proposital — é o e-mail do cliente. */}
            <div style={{ width: '100%', maxWidth: 520, background: '#FAF7F1', borderRadius: 8, overflow: 'hidden', boxShadow: '0 18px 40px rgba(0,0,0,.4)' }}>
              <div style={{ padding: '26px 28px 20px', textAlign: 'center', borderBottom: '1px solid rgba(28,24,18,.08)' }}>
                <Image
                  src="/assets/frenesi-logo.png"
                  alt="FRENESI"
                  width={112}
                  height={40}
                  style={{ width: 112, height: 'auto', display: 'inline-block', filter: 'brightness(.55) saturate(1.3)' }}
                />
              </div>
              <div style={{ padding: '26px 28px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="font-display" style={{ fontWeight: 600, fontSize: 21, lineHeight: 1.3, color: '#241F18', textWrap: 'pretty' }}>
                  {sel.assunto(contexto)}
                </span>
                <span className="font-sans" style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(36,31,24,.62)', textWrap: 'pretty' }}>
                  {sel.prechamada(contexto)}
                </span>
              </div>
              <div style={{ padding: '18px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {produtos.slice(0, 4).map((p) => (
                  <span key={`${p.nome}-${p.variante}`} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <span
                      aria-hidden
                      style={{
                        height: 96,
                        borderRadius: 5,
                        background: 'repeating-linear-gradient(135deg,rgba(157,126,67,.16) 0 4px,rgba(157,126,67,.06) 4px 8px)',
                        border: '1px solid rgba(28,24,18,.08)',
                        display: 'block',
                      }}
                    />
                    <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3, color: '#241F18' }}>
                      {p.nome}
                    </span>
                    <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(36,31,24,.5)' }}>
                      {p.variante}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {p.de !== null && (
                        <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(36,31,24,.4)', textDecoration: 'line-through' }}>
                          {brl(p.de)}
                        </span>
                      )}
                      <span className="font-mono" style={{ fontWeight: 600, fontSize: 13, lineHeight: 1, color: '#8A5A18' }}>
                        {brl(p.por)}
                      </span>
                      {p.descontoPct !== null && (
                        <span className="font-sans" style={{ fontWeight: 600, fontSize: 10, lineHeight: 1, color: '#A83A30' }}>
                          {`-${p.descontoPct}%`}
                        </span>
                      )}
                    </span>
                  </span>
                ))}
              </div>
              {produtos.length > 4 && (
                <div style={{ padding: '0 28px 6px' }}>
                  <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.4, color: 'rgba(36,31,24,.45)' }}>
                    {`+ ${produtos.length - 4} produtos na grade completa`}
                  </span>
                </div>
              )}
              <div style={{ padding: '16px 28px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <span
                  className="font-sans"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 44,
                    padding: '0 34px',
                    background: 'linear-gradient(135deg,#C9A868,#9D7E43)',
                    color: '#FFFDF8',
                    fontWeight: 700,
                    fontSize: 12.5,
                    lineHeight: 1,
                    letterSpacing: '.04em',
                    borderRadius: 6,
                  }}
                >
                  {sel.cta}
                </span>
                <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(36,31,24,.42)', textAlign: 'center' }}>
                  Preços válidos enquanto durar o ciclo da coleção Ofertas.
                </span>
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section
            style={{
              background: 'linear-gradient(170deg,#16141A,#100F11)',
              border: '1px solid rgba(239,209,140,.16)',
              borderRadius: 16,
              padding: '18px 19px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Losango />
              <TituloSecao tamanho={14.5} tom="ouro">
                Antes de enviar
              </TituloSecao>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {validacoes.map((v) => (
                <span key={v.texto} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span
                    aria-hidden
                    className="font-sans"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `1px solid ${v.ok ? COR.ok : COR.atencao}`,
                      color: v.ok ? COR.ok : COR.atencao,
                      fontWeight: 700,
                      fontSize: 9,
                      lineHeight: '14px',
                      textAlign: 'center',
                      flex: 'none',
                    }}
                  >
                    {v.ok ? '✓' : '!'}
                  </span>
                  <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.72)', textWrap: 'pretty' }}>
                    {v.texto}
                  </span>
                </span>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,.07)',
              }}
            >
              <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.3, color: 'rgba(242,237,227,.5)' }}>
                Receita prevista
              </span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 16, lineHeight: 1, color: 'var(--color-ouro)' }}>
                {brl(sel.receita)}
              </span>
            </div>
            {aprovado ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '13px 14px',
                  borderRadius: 10,
                  background: 'rgba(92,158,112,.08)',
                  border: '1px solid rgba(92,158,112,.28)',
                }}
              >
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: COR.ok, flex: 'none', marginTop: 5 }} />
                <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.82)', textWrap: 'pretty' }}>
                  {`Campanha "${camp.nome}" aprovada e enviada ao ESP · disparo para ${contexto.publicoN} contatos hoje às 18:00.`}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setAprovado(true)}
                  className="botao-ouro font-sans hover:brightness-[1.07]"
                  style={{ height: 38, fontWeight: 700, fontSize: 12, lineHeight: 1, borderRadius: 9, cursor: 'pointer' }}
                >
                  Aprovar e agendar disparo
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Editar texto', 'Enviar teste'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="font-sans hover:border-ouro/30 hover:text-ouro"
                      style={{
                        flex: 1,
                        height: 33,
                        border: '1px solid rgba(255,255,255,.11)',
                        background: 'transparent',
                        color: 'rgba(242,237,227,.7)',
                        fontWeight: 600,
                        fontSize: 11,
                        lineHeight: 1,
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 16,
              padding: '17px 19px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <TituloSecao tamanho={14}>Depois de aprovar</TituloSecao>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {etapasEnvio.map((e, i) => (
                <span key={e.n} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 11, alignItems: 'start' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%' }}>
                    <span
                      className="font-sans"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: `1px solid ${e.feito ? 'rgba(92,158,112,.45)' : 'rgba(239,209,140,.28)'}`,
                        background: e.feito ? 'rgba(92,158,112,.12)' : 'transparent',
                        color: e.feito ? COR.ok : 'rgba(242,237,227,.72)',
                        fontWeight: 600,
                        fontSize: 9.5,
                        lineHeight: '18px',
                        textAlign: 'center',
                        flex: 'none',
                      }}
                    >
                      {e.feito ? '✓' : e.n}
                    </span>
                    {i < etapasEnvio.length - 1 && (
                      <span style={{ width: 1, flex: 1, minHeight: 10, background: 'rgba(255,255,255,.07)', display: 'block' }} />
                    )}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 13, minWidth: 0 }}>
                    <span
                      className="font-sans"
                      style={{ fontWeight: 600, fontSize: 11.5, lineHeight: 1.35, color: e.feito ? COR.ok : 'rgba(242,237,227,.72)', textWrap: 'pretty' }}
                    >
                      {e.titulo}
                    </span>
                    <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
                      {e.desc}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </section>

          <section
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 16,
              padding: '17px 19px',
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
            }}
          >
            <TituloSecao tamanho={14}>O que a IA não faz sozinha</TituloSecao>
            {limites.map((l) => (
              <span key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(239,209,140,.5)', flex: 'none', marginTop: 6 }} />
                <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
                  {l}
                </span>
              </span>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
