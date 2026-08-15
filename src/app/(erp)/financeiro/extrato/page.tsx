import {
  Comparacao,
  Ferramentas,
  GradeIndicadores,
  Indicador,
  Painel,
  Pilha,
  Pilula,
} from '@/components/erp/ui'
import { lerExtrato, resumoDoExtrato, ultimaAtualizacao } from '@/data/extrato'
import { mercadoPagoConfigurado } from '@/data/mercadopago'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { brl, plural } from '@/domain'

import { ExtratoCliente } from './ExtratoCliente'

export const dynamic = 'force-dynamic'

/**
 * Extrato Inteligente — importação, leitura e classificação do banco.
 *
 * O ERP tinha lançamentos digitados e repasses previstos; faltava o FATO. É
 * aqui que o dinheiro real entra: o Mercado Pago conta quanto sobrou de cada
 * venda depois da tarifa, o banco conta o resto do movimento, e a fila de
 * classificação transforma cada linha em lançamento com categoria.
 */
interface Busca {
  situacao?: string
  tipo?: string
  de?: string
  ate?: string
  busca?: string
}

export default async function Extrato({ searchParams }: { searchParams: Promise<Busca> }) {
  const sp = await searchParams
  const filtro = {
    // Por padrão, só o que precisa de decisão. Crédito de venda já casado com
    // pedido não tem categoria a escolher nem saldo a mover — pedir
    // confirmação para ele era inventar trabalho.
    situacao: sp.situacao === 'todas' ? ('todas' as const) : ('a-decidir' as const),
    tipo: sp.tipo === 'entrada' || sp.tipo === 'saida' ? (sp.tipo as 'entrada' | 'saida') : undefined,
    de: sp.de || undefined,
    ate: sp.ate || undefined,
    busca: sp.busca || undefined,
    limite: 400,
  }

  const [pagina, categorias, resumo, atualizadoEm] = await Promise.all([
    lerExtrato(filtro),
    lerCategorias(),
    resumoDoExtrato(),
    ultimaAtualizacao(),
  ])

  const ligado = mercadoPagoConfigurado()

  return (
    <Pilha gap={16}>

      <Ferramentas
        esquerda={
          <>
            <Pilula icone="elo" tom={ligado ? 'ok' : 'atencao'}>
              {ligado ? 'Mercado Pago conectado' : 'Gateway desconectado'}
            </Pilula>
            {atualizadoEm && (
              <Comparacao texto="última leitura em" alvo={atualizadoEm.slice(0, 16).replace('T', ' ')} />
            )}
          </>
        }
      />

      <GradeIndicadores>
        <Indicador
          icone={resumo.aDecidir ? 'sino' : 'check-circulo'}
          tom={resumo.aDecidir ? 'atencao' : 'ok'}
          rotulo="Precisam de você"
          valor={String(resumo.aDecidir)}
          tomValor={resumo.aDecidir ? 'atencao' : 'ok'}
          nota={
            resumo.aDecidir
              ? 'Despesas a categorizar e entradas sem pedido correspondente'
              : 'Nada pendente de decisão'
          }
          tomNota={resumo.aDecidir ? 'atencao' : 'ok'}
        />
        <Indicador
          icone="check-circulo"
          tom="ok"
          rotulo="Vendas conciliadas"
          valor={String(resumo.conciliadas)}
          nota="Crédito casado com o pedido — nada a fazer nelas"
          tomNota="ok"
        />
        <Indicador
          icone="olho"
          tom="info"
          rotulo="Movimentos lidos"
          valor={String(resumo.linhas)}
          nota={plural(resumo.linhas, 'linha importada do banco', 'linhas importadas do banco')}
        />
        <Indicador
          icone="entrada"
          tom="ok"
          rotulo="Entradas lidas"
          valor={brl(resumo.entradas)}
          nota="Crédito de venda e demais recebimentos"
          tomNota="ok"
        />
        <Indicador
          icone="saida"
          tom="erro"
          rotulo="Saídas lidas"
          valor={brl(resumo.saidas)}
          nota="Tarifas, fornecedores e estornos"
          tomNota="erro"
        />
        <Indicador
          icone="balanca"
          tom={resumo.saldo >= 0 ? 'ouro' : 'erro'}
          rotulo="Movimento líquido"
          valor={brl(resumo.saldo)}
          tomValor={resumo.saldo >= 0 ? 'ok' : 'erro'}
          nota={
            ligado
              ? 'O gateway responde com a tarifa real de cada venda'
              : 'Sem MERCADOPAGO_ACCESS_TOKEN a tarifa real não é lida'
          }
          tomNota={ligado ? 'neutro' : 'atencao'}
        />
      </GradeIndicadores>

      <Painel
        titulo="Fila de tratamento"
        icone="lista"
        nota="cada linha vira lançamento quando ganha categoria"
        padding="16px 17px 17px"
        rodape={{
          nota: 'A classificação automática usa as regras cadastradas em Categorias: o que casar com o padrão vira lançamento sozinho.',
          link: { href: '/financeiro/categorias', texto: 'Gerenciar regras' },
        }}
      >
        <ExtratoCliente
          linhas={pagina.linhas}
          total={pagina.total}
          filtro={{
            situacao: filtro.situacao,
            tipo: filtro.tipo ?? '',
            de: filtro.de ?? '',
            ate: filtro.ate ?? '',
            busca: filtro.busca ?? '',
          }}
          categorias={categorias}
          gatewayLigado={ligado}
          atualizadoEm={atualizadoEm}
        />
      </Painel>
    </Pilha>
  )
}

async function lerCategorias(): Promise<{ nome: string; natureza: string }[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('categorias_financeiras')
    .select('nome, natureza')
    .eq('ativa', true)
    .order('nome')
  return (data ?? []).map((c) => ({ nome: c.nome as string, natureza: c.natureza as string }))
}
