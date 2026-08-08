import { BotaoOuro, BotaoSecundario, FaixaAlerta, TituloSecao } from '@/components/erp/primitivos'
import { EMPRESA } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { num, plural } from '@/domain'

import { dataBr, diasParaVencer } from '../campos'

interface Campo {
  label: string
  valor: string
}

export default async function Empresa() {
  const parametros = await repositorio().parametros()
  const dias = diasParaVencer(EMPRESA.certificado.validade)

  // A alíquota exibida é o MESMO impostoPct dos parâmetros de precificação —
  // se a faixa do Simples mudar, muda lá e reflete aqui.
  const tributacao: Campo[] = [
    ...EMPRESA.tributacao.slice(0, 2),
    { label: 'Alíquota efetiva', valor: `${num(parametros.impostoPct)}% · usada na precificação` },
    ...EMPRESA.tributacao.slice(2),
  ]

  const certificado: Campo[] = [
    { label: 'Tipo', valor: EMPRESA.certificado.tipo },
    {
      label: 'Validade',
      valor: `${dataBr(EMPRESA.certificado.validade)} · vence em ${plural(dias, 'dia', 'dias')}`,
    },
    { label: 'Responsável', valor: EMPRESA.certificado.responsavel },
    { label: 'Uso', valor: EMPRESA.certificado.uso },
  ]

  const blocos: { titulo: string; campos: Campo[] }[] = [
    { titulo: 'Identificação', campos: EMPRESA.identificacao },
    { titulo: 'Endereço fiscal', campos: EMPRESA.endereco },
    { titulo: 'Tributação', campos: tributacao },
    { titulo: 'Certificado digital', campos: certificado },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1080 }}>
      {dias <= 90 && (
        <FaixaAlerta
          tom="atencao"
          texto={`O certificado A1 vence em ${plural(dias, 'dia', 'dias')}. Sem ele, a emissão de nota fiscal para pedidos e devoluções para.`}
          acao={<BotaoSecundario altura={32}>Renovar certificado</BotaoSecundario>}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14 }}>
        {blocos.map((b) => (
          <section
            key={b.titulo}
            style={{
              background: 'linear-gradient(170deg,#141315,#101011)',
              border: '1px solid var(--color-borda)',
              borderRadius: 'var(--radius-card)',
              padding: '18px 19px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <TituloSecao tamanho={14.5}>{b.titulo}</TituloSecao>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {b.campos.map((c) => (
                <span
                  key={c.label}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 14,
                  }}
                >
                  <span
                    className="font-sans"
                    style={{ fontSize: 11, lineHeight: 1.4, color: 'rgba(242,237,227,.45)', flex: 'none' }}
                  >
                    {c.label}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontWeight: 500,
                      fontSize: 11.5,
                      lineHeight: 1.45,
                      color: 'var(--color-corrente)',
                      textAlign: 'right',
                      textWrap: 'pretty',
                    }}
                  >
                    {c.valor}
                  </span>
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="font-sans"
          style={{ flex: 1, fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
        >
          O CNPJ e o endereço aparecem no rótulo do decant e na cotação de frete da Yampi. Alterar
          aqui muda os dois.
        </span>
        <BotaoOuro altura={36}>Salvar dados</BotaoOuro>
      </div>
    </div>
  )
}
