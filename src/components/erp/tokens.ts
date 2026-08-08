/**
 * Tons semânticos do ERP.
 *
 * Um tom nunca é escolhido por gosto: ele vem do estado do dado. Quem decide
 * a severidade é o domínio; os componentes só traduzem em cor.
 */
export type Tom = 'ok' | 'atencao' | 'erro' | 'info' | 'ouro' | 'neutro'

export const COR: Record<Tom, string> = {
  ok: 'var(--color-ok-claro)',
  atencao: 'var(--color-atencao)',
  erro: 'var(--color-erro-claro)',
  info: 'var(--color-info-claro)',
  ouro: 'var(--color-ouro)',
  neutro: 'var(--color-secundario)',
}

/** Fundos de badge, na opacidade do handoff. */
export const FUNDO: Record<Tom, string> = {
  ok: 'rgba(92,158,112,.14)',
  atencao: 'rgba(217,140,63,.14)',
  erro: 'rgba(194,90,80,.14)',
  info: 'rgba(108,140,176,.14)',
  ouro: 'rgba(239,209,140,.12)',
  neutro: 'rgba(255,255,255,.05)',
}

export const BORDA: Record<Tom, string> = {
  ok: 'rgba(92,158,112,.24)',
  atencao: 'rgba(217,140,63,.32)',
  erro: 'rgba(194,90,80,.35)',
  info: 'rgba(108,140,176,.3)',
  ouro: 'rgba(239,209,140,.3)',
  neutro: 'var(--color-borda)',
}

/** Fundo mais forte, usado nos chips de variante da Sincronia. */
export const FUNDO_CHIP: Record<Tom, string> = {
  ok: 'rgba(92,158,112,.1)',
  atencao: 'rgba(217,140,63,.12)',
  erro: 'rgba(194,90,80,.12)',
  info: 'rgba(108,140,176,.12)',
  ouro: 'rgba(239,209,140,.12)',
  neutro: 'rgba(255,255,255,.03)',
}

/** Fundo translúcido de faixa de alerta. */
export const FAIXA: Record<Tom, string> = {
  ok: 'rgba(92,158,112,.07)',
  atencao: 'rgba(217,140,63,.07)',
  erro: 'rgba(194,90,80,.07)',
  info: 'rgba(108,140,176,.07)',
  ouro: 'rgba(239,209,140,.045)',
  neutro: 'rgba(255,255,255,.028)',
}
