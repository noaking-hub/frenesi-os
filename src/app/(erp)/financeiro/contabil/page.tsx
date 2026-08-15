import {
  Celula,
  Chip,
  GradeIndicadores,
  Indicador,
  Num,
  Painel,
  Pilha,
  TabelaUi,
  Vazio,
  type ColunaUi,
  type TomUi,
} from '@/components/erp/ui'
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

const TOM_ESTADO: Record<EnvioLinha['estado'], TomUi> = {
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

  const impostoProvisionado = apuracao.receita * (parametros.impostoPct / 100)

  const colunas: ColunaUi<EnvioLinha>[] = [
    {
      chave: 'quando',
      titulo: 'Quando',
      largura: '116px',
      render: (e) => (
        <Num tamanho={11} peso={400} tom="neutro">
          {e.quando}
        </Num>
      ),
    },
    {
      chave: 'arquivo',
      titulo: 'Arquivo',
      largura: 'minmax(0,1.2fr)',
      render: (e) => <Celula principal={e.arquivo} secundaria={e.nota || undefined} tom="ouro" />,
    },
    {
      chave: 'conteudo',
      titulo: 'Conteúdo',
      largura: 'minmax(0,1fr)',
      render: (e) => (
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'rgba(242,237,227,.6)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {e.conteudo}
        </span>
      ),
    },
    {
      chave: 'registros',
      titulo: 'Registros',
      largura: '92px',
      alinhamento: 'right',
      render: (e) => <Num tamanho={11.5}>{String(e.registros)}</Num>,
    },
    {
      chave: 'tamanho',
      titulo: 'Tamanho',
      largura: '92px',
      alinhamento: 'right',
      render: (e) => (
        <Num tamanho={11} peso={400} tom="neutro">
          {e.tamanho}
        </Num>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '112px',
      render: (e) => <Chip tom={TOM_ESTADO[e.estado]}>{e.estado}</Chip>,
    },
  ]

  return (
    <Pilha gap={16}>

      <GradeIndicadores>
        <Indicador
          icone="calendario"
          tom="ouro"
          rotulo="Competência aberta"
          valor={nomeDaCompetencia(competencia).replace(/ de \d+$/, '')}
          nota={`${plural(apuracao.pedidos, 'pedido pago', 'pedidos pagos')} no mês`}
        />
        <Indicador
          icone="cifrao"
          tom="ok"
          rotulo="Receita bruta apurada"
          valor={brl(apuracao.receita)}
          nota="Soma dos pedidos pagos da competência"
          tomNota="ok"
        />
        <Indicador
          icone="documento"
          tom="erro"
          rotulo="Imposto provisionado"
          valor={brl(impostoProvisionado)}
          nota={`${pct(parametros.impostoPct, 0)} sobre a receita apurada`}
        />
        <Indicador
          icone={apuracao.semCategoria ? 'alerta' : 'check-circulo'}
          tom={apuracao.semCategoria ? 'atencao' : 'ok'}
          rotulo="Saídas sem categoria"
          valor={String(apuracao.semCategoria)}
          tomValor={apuracao.semCategoria ? 'atencao' : 'ok'}
          nota={
            apuracao.semCategoria
              ? 'O contador não tem onde lançar estas linhas'
              : 'Toda saída do mês está classificada'
          }
          tomNota={apuracao.semCategoria ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="elo"
          tom={semConta.length ? 'atencao' : 'ok'}
          rotulo="Categorias sem conta contábil"
          valor={String(semConta.length)}
          tomValor={semConta.length ? 'atencao' : 'ok'}
          nota={
            semConta.length
              ? `Falta amarrar: ${semConta.slice(0, 3).map((c) => c.nome).join(', ')}`
              : 'Plano de contas completo'
          }
          tomNota={semConta.length ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="enviar"
          tom={ultimo?.estado === 'Aceito' ? 'ok' : ultimo ? 'info' : 'atencao'}
          rotulo="Último envio"
          valor={ultimo?.quando ?? '—'}
          nota={ultimo ? `${ultimo.arquivo} · ${ultimo.estado}` : 'Nenhum arquivo gerado ainda'}
          tomNota={ultimo?.estado === 'Aceito' ? 'ok' : 'neutro'}
        />
      </GradeIndicadores>

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

      <Painel
        titulo="Arquivos gerados"
        icone="documento"
        nota="o conteúdo de cada envio fica guardado"
        rodape={{
          nota: 'Reabrir em dezembro o que o contador recebeu em agosto devolve o arquivo daquela época, não uma nova apuração.',
        }}
      >
        <TabelaUi
          colunas={colunas}
          itens={envios}
          chaveDe={(e) => e.id}
          larguraMinima={800}
          faixaDe={(e) => (e.estado === 'Recusado' ? 'erro' : null)}
          vazio={<Vazio icone="documento" texto="Nenhum fechamento gerado ainda. Apure o mês acima." />}
        />
      </Painel>
    </Pilha>
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
