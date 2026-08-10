import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { emailConfigurado, credenciaisEmail } from '@/data/email'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, competenciaAtual, nomeDaCompetencia, pct, plural } from '@/domain'

import { FechamentoCliente } from './FechamentoCliente'

export const dynamic = 'force-dynamic'

interface EnvioLinha {
  id: string
  quando: string
  arquivo: string
  conteudo: string
  registros: number
  tamanho: string
  estado: 'Aceito' | 'Processando' | 'Recusado'
  nota: string
}

const TOM_ESTADO: Record<EnvioLinha['estado'], Tom> = {
  Aceito: 'ok',
  Processando: 'info',
  Recusado: 'erro',
}

/**
 * Financeiro → Integração contábil.
 *
 * O ERP não emite nota — quem emite é o Olist, já ligado à Yampi. O que esta
 * tela faz é o que cabe a ele: apurar o mês a partir dos pedidos pagos e dos
 * lançamentos classificados, amarrar cada categoria a uma conta do plano do
 * escritório, e produzir o arquivo que o contador lê.
 */
export default async function IntegracaoContabil() {
  const competencia = competenciaAtual()
  const [categorias, parametros, apuracao, envios] = await Promise.all([
    repositorio().categorias(),
    repositorio().parametros(),
    apurarResumo(competencia),
    lerEnvios(),
  ])

  const contas = await contasContabeis()
  const semConta = categorias.filter((c) => !contas[c.nome])
  const ultimo = envios[0]

  const kpis: Kpi[] = [
    {
      label: 'Competência aberta',
      valor: nomeDaCompetencia(competencia).replace(/ de \d+$/, ''),
      hint: `${plural(apuracao.pedidos, 'pedido pago', 'pedidos pagos')} no mês`,
    },
    {
      label: 'Receita bruta',
      valor: brl(apuracao.receita),
      hint: 'Soma dos pedidos pagos da competência',
      tom: 'ok',
    },
    {
      label: 'Imposto provisionado',
      valor: brl(apuracao.receita * (parametros.impostoPct / 100)),
      // O percentual vem dos parâmetros de precificação — mesma fonte do preço.
      hint: `${pct(parametros.impostoPct, 0)} sobre a receita apurada`,
      tom: 'erro',
    },
    {
      label: 'Saídas sem categoria',
      valor: String(apuracao.semCategoria),
      hint: apuracao.semCategoria
        ? 'O contador não tem onde lançar estas linhas'
        : 'Toda saída do mês está classificada',
      tom: apuracao.semCategoria ? 'atencao' : 'ok',
    },
    {
      label: 'Categorias sem conta',
      valor: String(semConta.length),
      hint: semConta.length
        ? `Falta amarrar: ${semConta
            .slice(0, 3)
            .map((c) => c.nome)
            .join(', ')}`
        : 'Plano de contas completo',
      tom: semConta.length ? 'atencao' : 'ok',
    },
    {
      label: 'Último envio',
      valor: ultimo?.quando ?? '—',
      hint: ultimo ? `${ultimo.arquivo} · ${ultimo.estado}` : 'Nenhum arquivo gerado ainda',
      tom: ultimo?.estado === 'Aceito' ? 'ok' : ultimo ? 'info' : 'atencao',
    },
  ]

  const colunas: Coluna<EnvioLinha>[] = [
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '112px',
      render: (e) => (
        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
          {e.quando}
        </span>
      ),
    },
    {
      chave: 'arquivo',
      titulo: 'Arquivo',
      largura: 'minmax(0,1.3fr)',
      render: (e) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span
            className="font-mono"
            style={{
              fontWeight: 500,
              fontSize: 11,
              color: 'var(--color-ouro)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {e.arquivo}
          </span>
          {e.nota && (
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.4, color: COR.atencao, textWrap: 'pretty' }}>
              {e.nota}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'conteudo',
      titulo: 'Conteúdo',
      largura: 'minmax(0,1fr)',
      render: (e) => (
        <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-secundario)', textWrap: 'pretty' }}>
          {e.conteudo}
        </span>
      ),
    },
    {
      chave: 'registros',
      titulo: 'Registros',
      largura: '82px',
      alinhamento: 'right',
      render: (e) => (
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-secundario)' }}>
          {e.registros}
        </span>
      ),
    },
    {
      chave: 'tamanho',
      titulo: 'Tamanho',
      largura: '82px',
      alinhamento: 'right',
      render: (e) => (
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
          {e.tamanho}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '112px',
      render: (e) => <Badge tom={TOM_ESTADO[e.estado]}>{e.estado}</Badge>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <FechamentoCliente
        competenciaInicial={competencia}
        emailLigado={emailConfigurado()}
        destinatarioSugerido={credenciaisEmail().responder}
        categorias={categorias.map((c) => ({
          nome: c.nome,
          natureza: c.natureza,
          contaContabil: contas[c.nome] ?? '',
          valorMes: c.valorMes,
        }))}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Arquivos gerados</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}>
          O conteúdo de cada arquivo fica guardado — reabrir em dezembro o que o contador recebeu em
          agosto devolve o arquivo daquela época, não uma nova apuração.
        </span>
      </div>

      <Tabela
        colunas={colunas}
        itens={envios}
        chaveDe={(e) => e.id}
        bandeiraDe={(e) => (e.estado === 'Recusado' ? 'erro' : null)}
        vazio="Nenhum fechamento gerado ainda. Apure o mês acima."
      />
    </div>
  )
}

async function contasContabeis(): Promise<Record<string, string>> {
  if (!supabaseConfigurado()) return {}
  const { data } = await supabaseServer().from('categorias_financeiras').select('nome, conta_contabil')
  return Object.fromEntries(
    (data ?? [])
      .filter((c) => String(c.conta_contabil ?? '').trim().length > 0)
      .map((c) => [c.nome as string, c.conta_contabil as string]),
  )
}

/** Números da competência aberta, direto do banco — sem passar pelo CSV. */
async function apurarResumo(competencia: string): Promise<{
  pedidos: number
  receita: number
  semCategoria: number
}> {
  if (!supabaseConfigurado()) return { pedidos: 0, receita: 0, semCategoria: 0 }

  const sb = supabaseServer()
  const inicio = `${competencia}-01`
  const [ano, mes] = competencia.split('-').map(Number)
  const fim = new Date(ano, mes, 1).toISOString().slice(0, 10)

  const [{ data: pedidos }, { data: lancs }] = await Promise.all([
    sb
      .from('pedidos')
      .select('valor')
      .eq('pagamento', 'pago')
      .gte('comprado_em', `${inicio}T00:00:00Z`)
      .lt('comprado_em', `${fim}T00:00:00Z`)
      .limit(5000),
    sb
      .from('lancamentos')
      .select('categoria, tipo')
      .gte('ocorrido_em', inicio)
      .lt('ocorrido_em', fim)
      .limit(5000),
  ])

  return {
    pedidos: (pedidos ?? []).length,
    receita: (pedidos ?? []).reduce((a, p) => a + Number(p.valor), 0),
    semCategoria: (lancs ?? []).filter((l) => l.tipo === 'saida' && !l.categoria).length,
  }
}

async function lerEnvios(): Promise<EnvioLinha[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('envios_contabeis')
    .select('id, arquivo, conteudo, registros, bytes, estado, nota, enviado_em')
    .order('enviado_em', { ascending: false })
    .limit(50)

  return (data ?? []).map((e) => ({
    id: String(e.id),
    quando: new Date(e.enviado_em as string).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    arquivo: e.arquivo as string,
    conteudo: e.conteudo as string,
    registros: Number(e.registros),
    tamanho: tamanhoLegivel(Number(e.bytes)),
    estado: e.estado as EnvioLinha['estado'],
    nota: (e.nota as string) ?? '',
  }))
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
