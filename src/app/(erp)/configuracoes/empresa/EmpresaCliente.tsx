'use client'

import { useState, useTransition } from 'react'

import { BotaoSecundario, Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'

import { salvarEmpresa, type DadosEmpresa } from './actions'

const CAMPO = {
  height: 38,
  padding: '0 12px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 9,
  color: 'var(--color-corrente)',
  fontSize: 12.5,
  lineHeight: 1,
  outline: 0,
  width: '100%',
} as const

const BLOCOS: { titulo: string; campos: { chave: keyof DadosEmpresa; rotulo: string; dica?: string }[] }[] = [
  {
    titulo: 'Identificação',
    campos: [
      { chave: 'razaoSocial', rotulo: 'Razão social' },
      { chave: 'nomeFantasia', rotulo: 'Nome fantasia' },
      { chave: 'cnpj', rotulo: 'CNPJ', dica: 'Só os 14 dígitos' },
      { chave: 'inscricao', rotulo: 'Inscrição estadual' },
      { chave: 'regime', rotulo: 'Regime tributário' },
      { chave: 'email', rotulo: 'E-mail fiscal' },
      { chave: 'telefone', rotulo: 'Telefone' },
    ],
  },
  {
    titulo: 'Endereço fiscal',
    campos: [
      { chave: 'cep', rotulo: 'CEP' },
      { chave: 'logradouro', rotulo: 'Logradouro' },
      { chave: 'cidade', rotulo: 'Cidade' },
      { chave: 'uf', rotulo: 'UF' },
    ],
  },
]

export function EmpresaCliente({ inicial }: { inicial: DadosEmpresa }) {
  const [dados, setDados] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, iniciarTransicao] = useTransition()

  const alterado = (Object.keys(dados) as (keyof DadosEmpresa)[]).some(
    (k) => dados[k] !== inicial[k],
  )

  const salvar = () =>
    iniciarTransicao(async () => {
      setErro(null)
      setSalvo(false)
      const r = await salvarEmpresa(dados)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setSalvo(true)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {BLOCOS.map((bloco) => (
        <section
          key={bloco.titulo}
          style={{
            background: 'linear-gradient(170deg,#141315,#101011)',
            border: '1px solid var(--color-borda)',
            borderRadius: 16,
            padding: '19px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 15,
          }}
        >
          <TituloSecao>{bloco.titulo}</TituloSecao>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '14px 18px' }}>
            {bloco.campos.map((c) => (
              <label key={c.chave} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Rotulo>{c.rotulo}</Rotulo>
                <input
                  value={dados[c.chave]}
                  onChange={(e) => {
                    setSalvo(false)
                    setDados((d) => ({ ...d, [c.chave]: e.target.value }))
                  }}
                  className="font-sans focus:border-ouro/45"
                  style={CAMPO}
                />
                {c.dica && (
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, lineHeight: 1.4, color: 'rgba(242,237,227,.4)' }}
                  >
                    {c.dica}
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.42)', textWrap: 'pretty' }}
          >
            O CNPJ e o endereço aparecem no rótulo do decant e na cotação de frete. Alterar aqui
            muda os dois.
          </span>
          {erro && (
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.erro }}>
              {erro}
            </span>
          )}
          {salvo && !alterado && (
            <span className="font-sans" style={{ fontSize: 11.5, lineHeight: 1.5, color: COR.ok }}>
              Dados da empresa salvos.
            </span>
          )}
        </span>
        <BotaoSecundario altura={36} onClick={() => setDados(inicial)}>
          Descartar alterações
        </BotaoSecundario>
        <button
          type="button"
          onClick={salvar}
          disabled={pendente || !alterado}
          className="botao-ouro font-sans hover:brightness-[1.07]"
          style={{
            height: 36,
            padding: '0 18px',
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1,
            borderRadius: 9,
            whiteSpace: 'nowrap',
            cursor: pendente ? 'wait' : alterado ? 'pointer' : 'not-allowed',
            opacity: pendente || !alterado ? 0.5 : 1,
          }}
        >
          {pendente ? 'Salvando…' : alterado ? 'Salvar dados' : 'Nada a salvar'}
        </button>
      </div>
    </div>
  )
}
