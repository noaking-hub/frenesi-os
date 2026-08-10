import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoOuro, FaixaAlerta, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'
import { supabaseConfigurado } from '@/data/supabase'
import {
  ROTULO_ESTADO_OCORRENCIA,
  ROTULO_OCORRENCIA,
  brl,
  diasAlemDoPrazo,
  ocorrenciaAberta,
  pad2,
  plural,
  resumirOcorrencias,
} from '@/domain'
import type { EstadoOcorrencia, Ocorrencia, TipoOcorrencia } from '@/domain'

import { AcoesOcorrencias, MoverOcorrencia } from './Acoes'

const TOM_TIPO: Record<TipoOcorrencia, Tom> = {
  extravio: 'erro',
  avaria: 'erro',
  'entrega-nao-efetuada': 'erro',
  'sem-movimentacao': 'erro',
  atraso: 'atencao',
  'endereco-insuficiente': 'atencao',
}

const TOM_ESTADO: Record<EstadoOcorrencia, Tom> = {
  aberta: 'erro',
  'aguardando-cliente': 'atencao',
  'em-indenizacao': 'info',
  resolvida: 'ok',
}

export const dynamic = 'force-dynamic'

export default async function OcorrenciasDeEntrega() {
  const ocorrencias = await repositorio().ocorrencias()
  const ligado = supabaseConfigurado()
  const r = resumirOcorrencias(ocorrencias)

  const kpis: Kpi[] = [
    {
      label: 'Ocorrências abertas',
      valor: pad2(r.abertas),
      hint: `de ${ocorrencias.length} no período`,
      tom: r.abertas ? 'erro' : 'ok',
    },
    {
      label: 'Aguardando cliente',
      valor: pad2(r.aguardandoCliente),
      hint: 'Dependem de uma resposta para andar',
      tom: r.aguardandoCliente ? 'atencao' : 'ok',
    },
    {
      label: 'Além do prazo',
      valor: pad2(r.atrasadas),
      hint: r.atrasadas
        ? `${plural(r.mediaAtraso, 'dia', 'dias')} de atraso em média`
        : 'Todas dentro do prazo da transportadora',
      tom: r.atrasadas ? 'erro' : 'ok',
    },
    {
      label: 'Valor parado',
      valor: brl(r.valorParado),
      hint: 'Nos pedidos com ocorrência aberta',
      tom: 'ouro',
    },
    {
      label: 'Resolvidas',
      valor: pad2(ocorrencias.length - r.abertas),
      hint: 'Reenvio, indenização ou entrega concluída',
      tom: 'ok',
    },
  ]

  const colunas: Coluna<Ocorrencia>[] = [
    {
      chave: 'id',
      titulo: 'Nº',
      largura: '84px',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Valor tamanho={11} tom="ouro">
            {o.id}
          </Valor>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
          >
            {o.abertura}
          </span>
        </span>
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Pedido e cliente',
      largura: 'minmax(0,1.1fr)',
      render: (o) => (
        <CelulaDupla principal={o.cliente} secundaria={`${o.pedidoId} · ${o.destino}`} />
      ),
    },
    {
      chave: 'tipo',
      titulo: 'Tipo',
      largura: '148px',
      render: (o) => {
        const alem = diasAlemDoPrazo(o)
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 11,
                lineHeight: 1.3,
                color: COR[TOM_TIPO[o.tipo]],
                textWrap: 'pretty',
              }}
            >
              {ROTULO_OCORRENCIA[o.tipo]}
            </span>
            {/* Dias ALÉM do prazo — derivado, não um rótulo fixo. */}
            <span
              className="font-sans"
              style={{
                fontSize: 10,
                lineHeight: 1.25,
                color: alem ? COR.erro : COR.neutro,
                whiteSpace: 'nowrap',
              }}
            >
              {alem
                ? `${plural(alem, 'dia', 'dias')} além do prazo`
                : 'dentro do prazo da transportadora'}
            </span>
          </span>
        )
      },
    },
    {
      chave: 'transportadora',
      titulo: 'Transportadora',
      largura: '152px',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1.3,
              color: 'var(--color-secundario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {o.transportadora}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(239,209,140,.5)' }}
          >
            {o.rastreio}
          </span>
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '120px',
      alinhamento: 'right',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Valor tamanho={12}>{brl(o.valor)}</Valor>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
          >
            {`aberta há ${plural(o.dias, 'dia', 'dias')}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação necessária',
      largura: 'minmax(0,1.2fr)',
      render: (o) => (
        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--color-secundario)', textWrap: 'pretty' }}
        >
          {o.acao}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '152px',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <Badge tom={TOM_ESTADO[o.estado]}>{ROTULO_ESTADO_OCORRENCIA[o.estado]}</Badge>
          {/* Trocar o estado é a ação principal desta tela: quem acompanha
              chamado de transportadora muda o estado o tempo todo. */}
          <MoverOcorrencia id={o.id} estado={o.estado} ligado={ligado} />
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      {r.atrasadas > 0 && (
        <FaixaAlerta
          tom="atencao"
          texto={`${plural(r.atrasadas, 'ocorrência está', 'ocorrências estão')} além do prazo da transportadora, com ${brl(r.valorParado)} em pedidos parados. A média de atraso é de ${plural(r.mediaAtraso, 'dia', 'dias')}.`}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <TituloSecao tamanho={16}>Ocorrências abertas com a transportadora</TituloSecao>
        <div style={{ flex: 1 }} />
        <AcoesOcorrencias ligado={ligado} />
      </div>

      <Tabela
        colunas={colunas}
        itens={ocorrencias}
        chaveDe={(o) => o.id}
        bandeiraDe={(o) =>
          !ocorrenciaAberta(o) ? null : diasAlemDoPrazo(o) ? 'erro' : 'atencao'
        }
        rodape={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 18px',
              borderTop: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span
              aria-hidden
              className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-ok)', flex: 'none' }}
            />
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              A varredura abre ocorrência para pedido em trânsito há mais de 15 dias sem entrega
              confirmada, dentro dos últimos 90 dias — é o que dá para afirmar sem a transportadora
              integrada. Extravio e avaria continuam sendo registro manual, porque só quem falou com
              a transportadora sabe.
            </span>
          </div>
        }
      />
    </div>
  )
}
