'use server'

import { acharRelatorio, rodarRelatorio } from '@/data/relatorios'
import { hojeEmSaoPaulo, relatorioParaCsv } from '@/domain'
import type { FiltrosRelatorio } from '@/domain'

/**
 * Gera o CSV do relatório com os MESMOS filtros da tela.
 *
 * Roda a consulta de novo em vez de receber as linhas do navegador: o que a
 * tela tem é o recorte de 500 linhas, e exportar o recorte com nome de
 * relatório completo é o tipo de mentira que só se descobre depois da
 * campanha enviada.
 */
export async function csvDoRelatorio(
  id: string,
  filtros: Omit<FiltrosRelatorio, 'limite'>,
): Promise<{ ok: true; csv: string; arquivo: string } | { ok: false; erro: string }> {
  const definicao = acharRelatorio(id)
  if (!definicao) return { ok: false, erro: 'Relatório não encontrado.' }

  const resultado = await rodarRelatorio(id, {
    de: filtros.de ?? null,
    ate: filtros.ate ?? null,
    uf: filtros.uf ?? null,
    q: filtros.q ?? null,
    // Sem teto: a planilha leva o relatório inteiro.
    limite: Infinity,
  })
  if (!resultado.linhas.length) {
    return { ok: false, erro: resultado.vazioPorque ?? 'Não há linhas para exportar.' }
  }

  return {
    ok: true,
    csv: relatorioParaCsv(resultado),
    arquivo: `${id}-${hojeEmSaoPaulo()}.csv`,
  }
}
