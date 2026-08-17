-- `classificar_extrato` está quebrada e nunca gravou um lançamento sequer.
--
-- Ela nasceu em 20260809, antes de `lancamentos.competencia` existir. Quando
-- o Financeiro foi reconstruído sobre caixa × competência, a coluna entrou
-- como NOT NULL sem default — e esta função, que lista as colunas uma a uma,
-- ficou de fora do conserto. Toda chamada morre em
--
--   null value in column "competencia" of relation "lancamentos"
--
-- Quem paga: o botão "Classificar" do Extrato, que devolve erro em vez de
-- lançamento; e `aplicar_regras_categoria`, que chama esta mesma função para
-- cada linha casada — a exceção derruba a rotina inteira das regras, e o
-- `catch` vazio da importação do Mercado Pago engole o erro. As 9 regras
-- cadastradas (Meta ADS, Google ADS, motoboy, imposto, frete, perfume base)
-- nunca categorizaram nada e ninguém foi avisado. Prova no banco: zero
-- lançamentos 'LC-…' com origem 'Extrato %', em 1.233 lançamentos vindos do
-- extrato.
--
-- Além de `competencia`, duas colunas entram junto porque o lançamento tem de
-- ficar igual ao que o conversor produz para a mesma linha:
--
--   recebido       o movimento do extrato é dinheiro que JÁ entrou ou saiu —
--                  a função já carimba `baixado_em`. Deixar `recebido` no
--                  default 0 criaria um lançamento baixado que o caixa lê
--                  como não realizado.
--   chave_externa  é a trava contra duplicidade. `converter_extrato_em_caixa`
--                  arbitra o `on conflict` por ela; com NULL aqui, o conversor
--                  não enxergava este lançamento e criava um SEGUNDO para o
--                  mesmo movimento — a mesma despesa duas vezes no caixa.
--                  Chave nula não conflita com nada. Mesma expressão do
--                  conversor, de propósito.
create or replace function public.classificar_extrato(
  p_origem text,
  p_chave text,
  p_categoria text,
  p_descricao text,
  p_operador text
) returns text
language plpgsql
as $function$
declare
  v_linha extrato_linhas%rowtype;
  v_id    text;
begin
  select * into v_linha from extrato_linhas
   where origem = p_origem and chave = p_chave for update;
  if not found then
    raise exception 'linha % da origem % não existe', p_chave, p_origem;
  end if;
  if v_linha.lancamento_id is not null then
    raise exception 'esta linha já virou o lançamento %', v_linha.lancamento_id;
  end if;
  if v_linha.ignorado then
    raise exception 'esta linha foi dispensada; desfaça antes de classificar';
  end if;

  v_id := 'LC-' || lpad(nextval('lancamentos_id_seq')::text, 5, '0');

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, conta_id, tipo, valor,
    recebido, baixado_em, origem, pedido_id, chave_externa, criado_por
  ) values (
    v_id,
    v_linha.ocorrido_em,
    date_trunc('month', v_linha.ocorrido_em)::date,
    coalesce(nullif(trim(p_descricao), ''), v_linha.descricao),
    nullif(trim(p_categoria), ''),
    v_linha.conta_id,
    v_linha.tipo,
    v_linha.valor,
    v_linha.valor,
    v_linha.ocorrido_em,
    'Extrato ' || v_linha.origem,
    v_linha.pedido_id,
    v_linha.chave,
    p_operador
  );

  update extrato_linhas set lancamento_id = v_id
   where origem = p_origem and chave = p_chave;

  return v_id;
end;
$function$;

comment on function classificar_extrato is
  'Transforma uma linha do extrato no lançamento dela. Grava chave_externa = chave da linha: é o que impede converter_extrato_em_caixa de criar um segundo lançamento para o mesmo movimento.';
