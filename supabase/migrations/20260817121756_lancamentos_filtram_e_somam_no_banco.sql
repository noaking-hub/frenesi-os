-- A tela de Lançamentos lia 1.268 linhas para desenhar 1.
--
-- O sintoma que o dono relatou é o que prova o diagnóstico: com
-- `?periodo=tudo&q=Icaro` o rodapé dizia "1 de 1268" e o Chrome abria "Página
-- sem resposta". Filtrar para uma linha não pode custar nada — a menos que o
-- filtro não esteja sendo feito onde os dados estão. E não estava:
-- `carregarLancamentos()` era chamada SEM argumento, montava um SELECT sem
-- WHERE, e o `?q=` era aplicado em JavaScript depois que as 1.268 linhas
-- (444.783 bytes medidos, 2 requisições PostgREST) já tinham atravessado a
-- rede. A ordenação e a paginação também eram JS.
--
-- O Postgres nunca foi o gargalo: EXPLAIN (ANALYZE, BUFFERS) da consulta da
-- lista mede 4,6 ms com Index Scan Backward em `lancamentos_ocorrido_em_idx`,
-- tudo em shared hit e zero read. O custo era transporte e round-trip. Por
-- isso esta migration NÃO cria índice nenhum: a tabela tem 1.268 linhas em 71
-- páginas que vivem no shared_buffers, já há 11 índices somando quase o
-- tamanho do heap, e o Planning Time medido (2,8 a 5,9 ms) frequentemente
-- SUPERA o Execution Time — um índice a mais deixaria o planejamento mais
-- lento, não a consulta mais rápida. Reavaliar quando a tabela passar de ~100
-- mil linhas; no ritmo atual (253 linhas em jun/2026, 581 em jul, 410 em ago)
-- isso é assunto de anos.
--
-- O que esta migration cria são as DUAS funções que permitem paginar sem
-- mentir nos totais. É o ponto onde é mais fácil errar: assim que a lista vem
-- paginada, somar em JavaScript passaria a somar só as 50 linhas da página, e
-- "A pagar em aberto" viraria um número menor que o verdadeiro — um bug pior
-- que a lentidão, porque é silencioso. Aqui os agregados são calculados sobre
-- o FILTRO INTEIRO (`lancamentos_da_tela`) e sobre a base VIVA inteira
-- (`panorama_dos_lancamentos`), no mesmo lugar em que as linhas são contadas.

-- ── As duas regras derivadas, agora também em SQL ──────────────────────────
--
-- `saldoAberto` e `situacaoDe` moram em src/domain/financeiro-gerencial.ts e
-- continuam sendo a verdade da tela. Estas funções são a MESMA regra escrita
-- na outra linguagem, e existem por um motivo estreito: não dá para filtrar
-- por "vencido" nem somar "o que está em aberto" sem elas, e trazer as linhas
-- para o Node só para aplicá-las é exatamente o que se está consertando.
--
-- Quem mexer numa TEM de mexer na outra. O teste
-- src/domain/__tests__/filtro-de-lancamentos.test.ts fixa a tabela-verdade
-- das seis situações justamente para que a divergência apareça.

create or replace function public.saldo_aberto_do_lancamento(
  p_valor numeric,
  p_multa numeric,
  p_juros numeric,
  p_desconto numeric,
  p_recebido numeric
) returns numeric
language sql
immutable
parallel safe
as $function$
  -- Espelha `Math.max(0, arredonda(valor + multa + juros - desconto - recebido))`.
  -- O `greatest(0, ...)` não é defensivo: baixa maior que o valor acontece
  -- quando o gateway credita a mais, e saldo negativo viraria "a receber"
  -- com sinal trocado nos totais.
  select greatest(
    0,
    round(
      coalesce(p_valor, 0) + coalesce(p_multa, 0) + coalesce(p_juros, 0)
        - coalesce(p_desconto, 0) - coalesce(p_recebido, 0),
      2
    )
  )
$function$;

create or replace function public.situacao_do_lancamento(
  p_cancelado_em timestamptz,
  p_saldo numeric,
  p_recebido numeric,
  p_vence_em date,
  p_hoje date
) returns text
language sql
immutable
parallel safe
as $function$
  -- A ORDEM dos ramos é a regra, não o conjunto deles. Trocar 'parcial' de
  -- lugar com 'vencido' faria uma conta parcialmente paga e atrasada contar
  -- duas vezes no card de inadimplência — é por isso que 'vencido' só vale
  -- para quem ainda não recebeu nada.
  select case
    when p_cancelado_em is not null then 'cancelado'
    when p_saldo <= 0 then 'liquidado'
    when coalesce(p_recebido, 0) > 0 then 'parcial'
    when p_vence_em is null then 'previsto'
    when p_vence_em < p_hoje then 'vencido'
    else 'agendado'
  end
$function$;

-- ── A lista: uma página, um total, e os somatórios do filtro inteiro ───────
--
-- Um jsonb só, e não quatro consultas, porque o custo que se está atacando é
-- de round-trip: eram 12 requisições PostgREST por render (19 com o detalhe
-- aberto) e ~840 KB de JSON. `filtrada` é avaliada uma vez e serve à página,
-- à contagem e aos seis somatórios.
--
-- `p_lancamento` sai FORA do filtro de propósito: o link do Assessor aponta
-- para um lançamento sem saber que filtro está valendo aqui, e um cancelado —
-- que a lista esconde por padrão — continua sendo um registro que alguém
-- precisa abrir para entender o que aconteceu.
create or replace function public.lancamentos_da_tela(
  p_hoje date,
  p_de date default null,
  p_ate date default null,
  p_situacao text default null,
  p_tipo text default null,
  p_categoria text default null,
  p_conta text default null,
  p_centro text default null,
  p_venc text default null,
  p_recorrente text default null,
  p_q text default null,
  p_pagina int default 1,
  p_por_pagina int default 50,
  p_lancamento text default null
) returns jsonb
language sql
stable
as $function$
with marcada as (
  select
    l.id, l.descricao, l.favorecido, l.tipo, l.categoria, l.categoria_id,
    l.centro_custo, l.conta_id, l.competencia, l.ocorrido_em, l.vence_em,
    l.baixado_em, l.valor, l.recebido, l.multa, l.juros, l.desconto,
    l.parcela, l.parcelas, l.recorrente, l.recorrencia, l.origem,
    l.documento, l.observacao, l.transferencia_id, l.cancelado_em,
    c.natureza_gerencial,
    -- Sem categoria, o lançamento conta nos dois regimes: é dinheiro que
    -- andou e ainda não foi explicado. O `true` repete o default que
    -- `lerLancamentos` aplicava no Node.
    coalesce(c.impacta_dre, true) as impacta_dre,
    coalesce(c.impacta_caixa, true) as impacta_caixa,
    b.nome as conta_nome,
    public.saldo_aberto_do_lancamento(l.valor, l.multa, l.juros, l.desconto, l.recebido) as saldo,
    public.situacao_do_lancamento(
      l.cancelado_em,
      public.saldo_aberto_do_lancamento(l.valor, l.multa, l.juros, l.desconto, l.recebido),
      l.recebido,
      l.vence_em,
      p_hoje
    ) as situacao
  from lancamentos l
  -- LEFT, nunca INNER: 101 lançamentos têm `categoria_id` nulo (62 vieram do
  -- extrato do Mercado Pago com o NOME da categoria e sem a chave), e um
  -- INNER os apagaria da tela que existe justamente para classificá-los.
  left join categorias_financeiras c on c.id = l.categoria_id
  left join contas_bancarias b on b.id = l.conta_id
),
filtrada as (
  select *
    from marcada m
   where (case
            -- Sem filtro explícito, cancelado sai da lista: não é trabalho
            -- pendente nem histórico de caixa, é um registro que deixou de
            -- valer. Com filtro, ele é alcançável por `?situacao=cancelado`.
            when p_situacao is null then m.situacao <> 'cancelado'
            else m.situacao = p_situacao
          end)
     and (p_tipo is null or m.tipo = p_tipo)
     -- 'sem' é o filtro que o extrato tornou necessário: quase cem linhas sem
     -- categoria, que a DRE não classifica.
     and (p_categoria is null
          or (p_categoria = 'sem' and m.categoria_id is null)
          or (p_categoria <> 'sem' and m.categoria_id = p_categoria))
     -- Mesma ideia para a projeção de caixa: título sem vencimento não é
     -- posicionado em nenhum dia e some do fluxo.
     and (p_venc is distinct from 'sem' or m.vence_em is null)
     and (p_conta is null or m.conta_id = p_conta)
     and (p_centro is null or m.centro_custo = p_centro)
     -- A janela é pelo DIA DO MOVIMENTO (`ocorrido_em`), não pela
     -- competência: `lerLancamentos` filtrava por `competencia` e a tela
     -- filtrava por `ocorrido_em`, duas colunas diferentes. Ao empurrar o
     -- filtro para cá vale a que a tela realmente aplica — filtrar por
     -- vencimento descartava 1.223 das 1.244 linhas de então.
     and (p_de is null or m.ocorrido_em >= p_de)
     and (p_ate is null or m.ocorrido_em <= p_ate)
     and (p_recorrente is null
          or (p_recorrente = 'sim' and m.recorrente)
          or (p_recorrente = 'nao' and not m.recorrente))
     -- As três colunas concatenadas com espaço, exatamente como o
     -- `${descricao} ${favorecido} ${documento}`.includes() que rodava em JS.
     --
     -- Os escapes não são paranoia: `%` e `_` são literais no `includes` do
     -- JavaScript e curingas no ILIKE. Sem escapar, buscar "50%" passaria a
     -- casar com qualquer coisa começada em "50" e a busca mentiria em
     -- silêncio. A contrabarra vai primeiro, senão ela escaparia os escapes.
     and (p_q is null
          or (coalesce(m.descricao, '') || ' ' || coalesce(m.favorecido, '') || ' '
              || coalesce(m.documento, ''))
             ilike '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
),
resumo as (
  select
    count(*)::int as total,
    -- Movido é o que já foi baixado: previsão somada com realizado daria um
    -- número que não existe em conta nenhuma.
    coalesce(sum(f.recebido) filter (where f.baixado_em is not null and f.tipo = 'entrada'), 0)::numeric(14,2) as entrou,
    coalesce(sum(f.recebido) filter (where f.baixado_em is not null and f.tipo = 'saida'), 0)::numeric(14,2) as saiu,
    count(*) filter (where f.baixado_em is not null and f.tipo = 'entrada')::int as movimentos_entrada,
    count(*) filter (where f.baixado_em is not null and f.tipo = 'saida')::int as movimentos_saida,
    -- "Em aberto" é `situacao not in ('liquidado','cancelado')`, que é o
    -- mesmo que saldo > 0 e não cancelado — escrito pela situação para não
    -- divergir da coluna Status que a mesma linha exibe.
    coalesce(sum(f.saldo) filter (where f.situacao not in ('liquidado', 'cancelado') and f.tipo = 'entrada'), 0)::numeric(14,2) as a_receber_aberto,
    coalesce(sum(f.saldo) filter (where f.situacao not in ('liquidado', 'cancelado') and f.tipo = 'saida'), 0)::numeric(14,2) as a_pagar_aberto
  from filtrada f
),
posicao as (
  -- A página é grampeada AQUI, e não no Node, porque só aqui se sabe o total.
  -- Sem isso, `?pagina=99` num filtro de 1 linha devolveria zero linhas e a
  -- tela pareceria vazia por defeito.
  select
    greatest(1, ceil(r.total::numeric / greatest(p_por_pagina, 1))::int) as paginas,
    least(
      greatest(coalesce(p_pagina, 1), 1),
      greatest(1, ceil(r.total::numeric / greatest(p_por_pagina, 1))::int)
    ) as pagina
  from resumo r
),
listada as (
  select f.*
    from filtrada f
   -- Do mais recente para o mais antigo — a ordem de um extrato. O desempate
   -- por id existe porque o dia tem dezenas de linhas e sem ele a mesma
   -- página devolveria ordens diferentes a cada chamada, duplicando ou
   -- pulando linhas na virada de página.
   order by f.ocorrido_em desc, f.id desc
   limit greatest(p_por_pagina, 1)
  offset ((select p.pagina from posicao p) - 1) * greatest(p_por_pagina, 1)
),
alvo as (
  select m.*
    from marcada m
   where p_lancamento is not null
     and m.id = p_lancamento
)
select jsonb_build_object(
  'linhas', coalesce(
    (select jsonb_agg(to_jsonb(x) order by x.ocorrido_em desc, x.id desc) from listada x),
    '[]'::jsonb
  ),
  'total', (select r.total from resumo r),
  'pagina', (select p.pagina from posicao p),
  'paginas', (select p.paginas from posicao p),
  'resumo', (select to_jsonb(r) from resumo r),
  'alvo', (select to_jsonb(a) from alvo a)
)
$function$;

-- ── O panorama: os números que NÃO dependem do filtro ──────────────────────
--
-- Os cinco cartões do rodapé, o painel "Resumo do período", "Próximos
-- vencimentos" e os avisos de lançamento incompleto sempre falaram da base
-- inteira, não do recorte da tela — eles eram calculados sobre
-- `p.lancamentos` cru. Com a lista paginada essa fonte deixou de existir, e
-- sem esta função os números passariam a descrever as 50 linhas visíveis.
--
-- `vivos` = não cancelado, a mesma definição do Node. Cancelado não é
-- obrigação nem histórico de caixa.
create or replace function public.panorama_dos_lancamentos(p_hoje date)
returns jsonb
language sql
stable
as $function$
with base as (
  -- Inclui CANCELADO de propósito: é o "de 1268" do rodapé ("1 de 1268 no
  -- período") e o que decide entre "Nenhum lançamento cadastrado ainda" e
  -- "Nenhum lançamento atende a este filtro". Contar só os vivos mudaria o
  -- número que o dono lê na tela.
  select count(*)::int as total_da_base from lancamentos
),
vivos as (
  select
    l.id, l.descricao, l.tipo, l.categoria, l.categoria_id, l.valor,
    l.recebido, l.vence_em, l.baixado_em, l.recorrente, l.origem,
    public.saldo_aberto_do_lancamento(l.valor, l.multa, l.juros, l.desconto, l.recebido) as saldo,
    public.situacao_do_lancamento(
      l.cancelado_em,
      public.saldo_aberto_do_lancamento(l.valor, l.multa, l.juros, l.desconto, l.recebido),
      l.recebido,
      l.vence_em,
      p_hoje
    ) as situacao
  from lancamentos l
  where l.cancelado_em is null
),
totais as (
  select
    count(*) filter (where v.tipo = 'saida')::int as qtd_saidas,
    count(*) filter (where v.tipo = 'saida' and v.baixado_em is not null)::int as qtd_pagas,
    -- Dias entre vencimento e baixa efetiva. Negativo é antecipação. Só entra
    -- quem tem as DUAS datas: sem vencimento não há atraso a medir, e incluir
    -- essas linhas como zero puxaria a média para "em dia" sem base.
    avg(v.baixado_em - v.vence_em) filter (
      where v.tipo = 'saida' and v.baixado_em is not null and v.vence_em is not null
    ) as prazo_pagamento,
    avg(v.baixado_em - v.vence_em) filter (
      where v.tipo = 'entrada' and v.baixado_em is not null and v.vence_em is not null
    ) as prazo_recebimento,
    coalesce(sum(v.saldo) filter (where v.tipo = 'saida'), 0)::numeric(14,2) as total_a_pagar,
    coalesce(sum(v.saldo) filter (where v.tipo = 'entrada'), 0)::numeric(14,2) as total_a_receber,
    coalesce(sum(v.saldo) filter (where v.situacao = 'vencido'), 0)::numeric(14,2) as vencidos_valor,
    count(*) filter (where v.situacao = 'vencido')::int as vencidos_qtd,
    coalesce(sum(v.valor) filter (where v.recorrente), 0)::numeric(14,2) as recorrentes_valor,
    count(*) filter (where v.recorrente)::int as recorrentes_qtd,
    -- "Pendências de aprovação": o que veio de integração e ainda não foi
    -- conferido por gente.
    coalesce(sum(v.saldo) filter (where v.origem <> 'Manual' and v.baixado_em is null), 0)::numeric(14,2) as aprovacoes_valor,
    count(*) filter (where v.origem <> 'Manual' and v.baixado_em is null)::int as aprovacoes_qtd,
    -- Sem categoria não há linha na DRE; sem vencimento não há dia na
    -- projeção de caixa. Nos dois casos o número existe no banco e não
    -- aparece em nenhum total — o pior tipo de dado, o que some sem avisar.
    count(*) filter (where v.categoria_id is null)::int as sem_categoria_qtd,
    coalesce(sum(v.valor) filter (where v.categoria_id is null), 0)::numeric(14,2) as sem_categoria_valor,
    count(*) filter (where v.vence_em is null and v.saldo > 0)::int as sem_vencimento_qtd,
    coalesce(sum(v.saldo) filter (where v.vence_em is null and v.saldo > 0), 0)::numeric(14,2) as sem_vencimento_valor,
    (select b.total_da_base from base b) as total_da_base
  from vivos v
),
recorrentes_por_categoria as (
  select coalesce(v.categoria, 'Sem categoria') as rotulo, sum(v.valor)::numeric(14,2) as valor
    from vivos v
   where v.recorrente
   group by 1
   order by 2 desc
),
proximos as (
  select v.id, v.descricao, v.vence_em, v.categoria, v.tipo, v.saldo
    from vivos v
   where v.saldo > 0 and v.vence_em is not null and v.vence_em >= p_hoje
   order by v.vence_em, v.id
   limit 5
)
select jsonb_build_object(
  'totais', (select to_jsonb(t) from totais t),
  'recorrentesPorCategoria', coalesce(
    (select jsonb_agg(to_jsonb(r)) from recorrentes_por_categoria r), '[]'::jsonb
  ),
  'proximos', coalesce(
    (select jsonb_agg(to_jsonb(p) order by p.vence_em, p.id) from proximos p), '[]'::jsonb
  )
)
$function$;

-- ── Categorias: 8 contagens sem trazer 1.229 linhas ────────────────────────
--
-- `lerCategorias` fazia `select categoria_id from lancamentos limit 5000` só
-- para montar um Map de contagem — 1.229 linhas atravessando a rede para
-- produzir 8 números, a cada render, em dois caminhos diferentes. A
-- agregação custa o MESMO tempo no Postgres (1,255 ms contra 1,115 ms, os
-- mesmos 71 buffers) e devolve 8 linhas.
--
-- De quebra some o `limit(5000)`, que era uma bomba-relógio: aos 5.001
-- lançamentos a contagem passaria a mentir sem erro nenhum na tela.
create or replace view public.categorias_em_uso as
  select categoria_id, count(*)::int as em_uso
    from lancamentos
   where categoria_id is not null
   group by categoria_id;

-- View criada por `postgres` roda com os privilégios do DONO, que tem
-- `rolbypassrls` — o RLS das tabelas embaixo seria pulado. As duas travas de
-- 20260817012100 valem para esta também.
alter view public.categorias_em_uso set (security_invoker = on);
revoke select on public.categorias_em_uso from anon, authenticated;

-- As funções são `stable`, não `security definer`, então já respeitam o RLS
-- de quem chama. O revoke é redundante de propósito, na mesma postura de
-- 20260817020515: o ERP inteiro fala com o banco por `supabaseServer()` com
-- service role, e nada aqui precisa ser alcançável pela chave anon — que é
-- pública por construção, já que vive no JavaScript que o navegador baixa.
revoke execute on function public.saldo_aberto_do_lancamento(numeric, numeric, numeric, numeric, numeric) from anon, authenticated, public;
revoke execute on function public.situacao_do_lancamento(timestamptz, numeric, numeric, date, date) from anon, authenticated, public;
revoke execute on function public.lancamentos_da_tela(date, date, date, text, text, text, text, text, text, text, text, int, int, text) from anon, authenticated, public;
revoke execute on function public.panorama_dos_lancamentos(date) from anon, authenticated, public;
