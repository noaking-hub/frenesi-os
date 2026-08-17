import { describe, expect, it } from 'vitest'

import {
  CHAVES_DE_FILTRO,
  LANCAMENTOS_POR_PAGINA,
  normalizarFiltroDeLancamentos,
  periodoPorExtenso,
  recuarDia,
} from '../filtro-de-lancamentos'
import { saldoAberto, situacaoDe } from '../financeiro-gerencial'
import type { LancamentoGerencial } from '../financeiro-gerencial'

/**
 * O que estes testes protegem é a migração do filtro de JavaScript para o
 * Postgres.
 *
 * A tela lia 1.268 linhas para desenhar 1 porque `carregarLancamentos()` era
 * chamada sem argumento e todo o filtro rodava em `Array.filter`. Ao empurrar
 * a cláusula para o banco, cada regra que estava escondida no meio do JSX
 * virou parâmetro de RPC — e regra que muda de lugar é regra que pode mudar
 * de valor sem ninguém notar. Cada caso abaixo fixa uma dessas regras.
 */

const HOJE = '2026-08-17'

describe('normalizarFiltroDeLancamentos', () => {
  it('sem período na URL, a janela é o dia de hoje', () => {
    // Abrir a tela em "todo o histórico" era o comportamento antigo: 1.244
    // linhas carregadas para responder uma pergunta que quase sempre é sobre
    // o dia. O padrão "hoje" é o que impede a tela de voltar a nascer lenta.
    const f = normalizarFiltroDeLancamentos({}, HOJE)
    expect(f.atalho).toBe('hoje')
    expect(f.de).toBe(HOJE)
    expect(f.ate).toBe(HOJE)
  })

  it('período "tudo" remove os dois lados da janela', () => {
    // Janela vazia tem de virar "sem cláusula", não `>= ''`: um filtro de data
    // com string vazia devolveria zero linhas e a tela pareceria quebrada.
    const f = normalizarFiltroDeLancamentos({ periodo: 'tudo' }, HOJE)
    expect(f.de).toBe('')
    expect(f.ate).toBe('')
  })

  it('período "7" conta hoje mais os seis anteriores', () => {
    // O botão promete uma semana. Recuar sete dias a partir de hoje daria oito
    // dias na tela, e o total do card não bateria com o rótulo.
    const f = normalizarFiltroDeLancamentos({ periodo: '7' }, HOJE)
    expect(f.de).toBe('2026-08-11')
    expect(f.ate).toBe(HOJE)
  })

  it('período "30" cobre trinta dias, não trinta e um', () => {
    const f = normalizarFiltroDeLancamentos({ periodo: '30' }, HOJE)
    expect(f.de).toBe('2026-07-19')
  })

  it('período "mes" começa no dia 1º do mês corrente', () => {
    const f = normalizarFiltroDeLancamentos({ periodo: 'mes' }, HOJE)
    expect(f.de).toBe('2026-08-01')
    expect(f.ate).toBe(HOJE)
  })

  it('data digitada à mão vence o atalho', () => {
    // Quem escolheu 01/06 quer 01/06. Manter os dois faria a consulta obedecer
    // a um enquanto a barra de filtros exibia o outro aceso — o tipo de
    // divergência que faz o operador desconfiar do número, não da tela.
    const f = normalizarFiltroDeLancamentos({ periodo: 'tudo', de: '2026-06-01' }, HOJE)
    expect(f.atalho).toBeNull()
    expect(f.de).toBe('2026-06-01')
    expect(f.ate).toBe('')
  })

  it('período desconhecido cai no padrão em vez de esvaziar a tela', () => {
    // Link antigo ou digitado errado (`?periodo=semana`) não pode devolver
    // lista vazia sem explicação.
    const f = normalizarFiltroDeLancamentos({ periodo: 'semana' }, HOJE)
    expect(f.atalho).toBe('hoje')
  })

  it('campo vazio na URL vira null, nunca string vazia', () => {
    // `?tipo=` chegava como '' e, empurrado ao banco, viraria `tipo = ''` —
    // que não casa com nada. O filtro que não filtra tem de sumir da cláusula.
    const f = normalizarFiltroDeLancamentos(
      { tipo: '', conta: '   ', q: '  ', categoria: '' },
      HOJE,
    )
    expect(f.tipo).toBeNull()
    expect(f.conta).toBeNull()
    expect(f.q).toBeNull()
    expect(f.categoria).toBeNull()
  })

  it('a busca é aparada antes de virar ILIKE', () => {
    // O JS antigo fazia `.trim().toLowerCase()` antes do `includes`. Sem o
    // trim, colar "Icaro " da planilha passaria a não achar nada.
    expect(normalizarFiltroDeLancamentos({ q: '  Icaro  ' }, HOJE).q).toBe('Icaro')
  })

  it('página nunca é menor que 1, mesmo com lixo na URL', () => {
    // `?pagina=0` viraria offset -50 no Postgres, que é erro de sintaxe em
    // tempo de execução; `?pagina=abc` viraria NaN.
    expect(normalizarFiltroDeLancamentos({ pagina: '0' }, HOJE).pagina).toBe(1)
    expect(normalizarFiltroDeLancamentos({ pagina: '-3' }, HOJE).pagina).toBe(1)
    expect(normalizarFiltroDeLancamentos({ pagina: 'abc' }, HOJE).pagina).toBe(1)
    expect(normalizarFiltroDeLancamentos({ pagina: '3' }, HOJE).pagina).toBe(3)
  })

  it('o teto da página NÃO é decidido aqui', () => {
    // De propósito: só a consulta sabe quantas linhas o filtro devolveu.
    // Grampear no cliente com um total estimado foi o que produziria "página 7
    // de 3" e uma tabela vazia.
    expect(normalizarFiltroDeLancamentos({ pagina: '999' }, HOJE).pagina).toBe(999)
  })

  it('o detalhe aberto viaja no filtro, para sobreviver ao F5', () => {
    const f = normalizarFiltroDeLancamentos({ lancamento: 'LC-00015' }, HOJE)
    expect(f.lancamento).toBe('LC-00015')
  })
})

describe('recuarDia', () => {
  it('atravessa a virada de mês sem escorregar de dia', () => {
    // Somar milissegundos sobre `Date.now()` e cortar o ISO devolvia 31 dias
    // entre as 21h e a meia-noite de São Paulo.
    expect(recuarDia('2026-03-01', 1)).toBe('2026-02-28')
    expect(recuarDia('2026-01-01', 1)).toBe('2025-12-31')
  })

  it('atravessa a virada de horário de verão sem perder um dia', () => {
    expect(recuarDia('2026-10-19', 1)).toBe('2026-10-18')
  })
})

describe('periodoPorExtenso', () => {
  const curto = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

  it('janela aberta dos dois lados diz "todo o histórico"', () => {
    expect(periodoPorExtenso({ de: '', ate: '' }, curto)).toBe('todo o histórico')
  })

  it('janela só com fim começa no "início"', () => {
    expect(periodoPorExtenso({ de: '', ate: '2026-08-17' }, curto)).toBe('início a 17/08')
  })
})

describe('CHAVES_DE_FILTRO', () => {
  it('não conta período nem página como filtro do botão Limpar', () => {
    // Período tem sempre valor (o padrão é "hoje"); contá-lo faria o botão
    // "Limpar 1 filtro" aparecer numa tela sem nenhum filtro aplicado. Página
    // não é filtro, é posição.
    expect(CHAVES_DE_FILTRO).not.toContain('periodo')
    expect(CHAVES_DE_FILTRO).not.toContain('pagina')
    expect(CHAVES_DE_FILTRO).not.toContain('lancamento')
  })
})

/**
 * A tabela-verdade que o SQL tem de repetir.
 *
 * `situacao_do_lancamento` e `saldo_aberto_do_lancamento`, criadas em
 * supabase/migrations/20260817121756_lancamentos_filtram_e_somam_no_banco.sql,
 * são a MESMA regra escrita em plpgsql-SQL — foi preciso duplicá-las porque
 * não dá para filtrar por "vencido" nem somar "o que está em aberto" sem elas,
 * e trazer as 1.268 linhas para o Node só para aplicá-las é exatamente o que
 * se estava consertando.
 *
 * Estes casos existem para que a duplicação seja visível: quem mudar a ordem
 * dos ramos aqui quebra o teste e vai ler a migration; quem mudar só a
 * migration não quebra nada — por isso o comentário está nos dois lugares.
 */
describe('situacaoDe e saldoAberto — o contrato que o Postgres repete', () => {
  function lancamento(over: Partial<LancamentoGerencial> = {}): LancamentoGerencial {
    return {
      id: 'LC-1',
      descricao: 'Conta',
      favorecido: null,
      tipo: 'saida',
      categoriaId: 'aluguel',
      categoria: 'Aluguel',
      natureza: 'despesa_fixa',
      centroCusto: null,
      contaId: 'sicoob',
      conta: 'Sicoob',
      competencia: '2026-08-01',
      ocorridoEm: '2026-08-10',
      venceEm: '2026-08-10',
      baixadoEm: null,
      valor: 1000,
      recebido: 0,
      multa: 0,
      juros: 0,
      desconto: 0,
      parcela: null,
      parcelas: null,
      recorrente: false,
      recorrencia: null,
      origem: 'Manual',
      documento: null,
      observacao: null,
      transferenciaId: null,
      canceladoEm: null,
      impactaDre: true,
      impactaCaixa: true,
      ...over,
    }
  }

  it('cancelado vence tudo, inclusive saldo zerado', () => {
    expect(situacaoDe(lancamento({ canceladoEm: '2026-08-11', recebido: 1000 }), HOJE)).toBe(
      'cancelado',
    )
  })

  it('parcial vence vencido: recebimento parcial em atraso não é inadimplência cheia', () => {
    // A ordem dos ramos É a regra. Com 'vencido' antes de 'parcial', a mesma
    // conta contaria inteira no card de inadimplência depois de já ter sido
    // paga pela metade.
    const l = lancamento({ venceEm: '2026-08-01', recebido: 400 })
    expect(situacaoDe(l, HOJE)).toBe('parcial')
    expect(saldoAberto(l)).toBe(600)
  })

  it('sem vencimento é previsto, nunca vencido', () => {
    expect(situacaoDe(lancamento({ venceEm: null }), HOJE)).toBe('previsto')
  })

  it('vence hoje ainda é agendado', () => {
    // O corte é `venceEm < hoje`. Com `<=`, toda conta do dia nasceria vencida
    // e o alerta do Dashboard acusaria atraso na manhã do vencimento.
    expect(situacaoDe(lancamento({ venceEm: HOJE }), HOJE)).toBe('agendado')
    expect(situacaoDe(lancamento({ venceEm: '2026-08-16' }), HOJE)).toBe('vencido')
  })

  it('encargos e desconto entram no saldo em aberto', () => {
    // O somatório "A pagar em aberto" do rodapé usa exatamente esta conta; se
    // o SQL somasse só `valor - recebido`, os encargos sumiriam do total.
    expect(saldoAberto(lancamento({ multa: 50, juros: 10, desconto: 20 }))).toBe(1040)
  })

  it('baixa maior que o devido não produz saldo negativo', () => {
    // Acontece quando o gateway credita a mais. Saldo negativo viraria "a
    // receber" com sinal trocado dentro do somatório do rodapé.
    expect(saldoAberto(lancamento({ recebido: 1200 }))).toBe(0)
    expect(situacaoDe(lancamento({ recebido: 1200 }), HOJE)).toBe('liquidado')
  })
})

describe('LANCAMENTOS_POR_PAGINA', () => {
  it('é o mesmo número no link da paginação e na consulta', () => {
    // A página vive na URL. Se a consulta trouxesse 50 e o link calculasse o
    // total de páginas com outro tamanho, "Próxima" levaria a uma tela vazia.
    expect(LANCAMENTOS_POR_PAGINA).toBe(50)
  })
})
