import { assinaturaConfere, estaDescadastrado } from '@/data/descadastro'

import { ConfirmarDescadastro } from './ConfirmarDescadastro'

export const dynamic = 'force-dynamic'

/**
 * "Cancelar inscrição" — a página que o rodapé dos e-mails prometia e não
 * existia.
 *
 * É PÚBLICA por definição: quem quer sair da lista não vai criar conta para
 * isso. O que a protege é a assinatura no link — sem ela, saber o e-mail de
 * alguém bastaria para descadastrá-lo.
 *
 * O visual é o do portal de devoluções, e não o do ERP: é a mesma pessoa do
 * outro lado, e ela precisa reconhecer a marca em vez de achar que caiu num
 * site aleatório que pediu o e-mail dela.
 */
export default async function Descadastrar({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string; ok?: string }>
}) {
  const { e, t } = await searchParams
  const email = (e ?? '').trim().toLowerCase()
  const valido = Boolean(email && t && assinaturaConfere(email, t))
  const jaSaiu = valido ? await estaDescadastrado(email) : false

  return (
    <div
      className="portal"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#EDE6DA',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#FFFDF9',
          border: '1px solid rgba(36,31,24,.12)',
          borderRadius: 16,
          padding: '34px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 1px 2px rgba(36,31,24,.05), 0 14px 34px -16px rgba(36,31,24,.22)',
        }}
      >
        <span
          className="font-sans"
          style={{
            fontSize: 10,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: '#8A6A2F',
          }}
        >
          FRENESI Perfumes
        </span>

        {!valido ? (
          <>
            <h1
              className="font-display"
              style={{ margin: 0, fontSize: 24, lineHeight: 1.2, color: '#241F18' }}
            >
              Este link não confere
            </h1>
            <p
              className="font-sans"
              style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'rgba(36,31,24,.62)' }}
            >
              Abra o link direto do e-mail que você recebeu — copiar e colar às vezes corta um
              pedaço do endereço. Se preferir, responda àquele e-mail pedindo o descadastro e nós
              fazemos por você.
            </p>
          </>
        ) : (
          <ConfirmarDescadastro email={email} assinatura={t!} jaSaiu={jaSaiu} />
        )}

        <span
          className="font-sans"
          style={{ fontSize: 11, lineHeight: 1.6, color: 'rgba(36,31,24,.45)', textWrap: 'pretty' }}
        >
          Avisos sobre pedidos que você já fez — pagamento, envio, entrega e devolução — continuam
          sendo enviados. Eles não são divulgação: são o andamento da sua compra.
        </span>
      </div>
    </div>
  )
}
