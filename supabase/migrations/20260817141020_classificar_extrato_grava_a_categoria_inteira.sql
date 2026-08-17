-- A regra classificou, a tela mostrou "Perfume base", e o lançamento continuou
-- contando como SEM CATEGORIA.
--
-- `lancamentos` guarda a categoria em duas colunas: `categoria` (o nome, para
-- ler) e `categoria_id` (a chave, que amarra natureza gerencial, impacta_dre e
-- impacta_caixa). `classificar_extrato` gravava só a primeira — a lista de
-- colunas do INSERT nunca teve `categoria_id`.
--
-- Ninguém viu porque a função estava quebrada desde a reconstrução do
-- Financeiro (faltava `competencia`, NOT NULL sem default) e nunca chegou a
-- gravar linha nenhuma. Consertada em 20260817121500, passou a gravar — e o
-- defeito seguinte apareceu na primeira compra que ela classificou: as duas do
-- fornecedor SIENO, R$ 1.769,56, com o nome certo na tela e sem chave nenhuma
-- atrás dele. O contador de "lançamentos sem categoria" subiu de 39 para 41
-- graças a duas linhas que ACABARAM de ser categorizadas.
--
-- Efeito real do id ausente: sem ele não há natureza gerencial, então a compra
-- de perfume base — que é CMV — não entra na DRE como custo. O número aparece
-- na tela e some do resultado.
--
-- A resolução aceita nome OU id porque os dois chamadores mandam coisas
-- diferentes: `aplicar_regras_categoria` passa `r.categoria` (o nome), e o
-- botão "Classificar" do Extrato passa o que a tela tiver em mãos. Procurar
-- pelos dois é mais barato que fazer as duas pontas concordarem — e, se não
-- achar, o texto continua sendo gravado como antes: melhor uma categoria sem
-- chave do que recusar a classificação inteira.
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
  v_cat   categorias_financeiras%rowtype;
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

  select * into v_cat from categorias_financeiras
   where id = btrim(p_categoria)
      or lower(nome) = lower(btrim(p_categoria))
   limit 1;

  v_id := 'LC-' || lpad(nextval('lancamentos_id_seq')::text, 5, '0');

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, origem, pedido_id, chave_externa, criado_por
  ) values (
    v_id,
    v_linha.ocorrido_em,
    date_trunc('month', v_linha.ocorrido_em)::date,
    coalesce(nullif(trim(p_descricao), ''), v_linha.descricao),
    coalesce(v_cat.nome, nullif(trim(p_categoria), '')),
    v_cat.id,
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

comment on function public.classificar_extrato is
  'Transforma uma linha do extrato no lançamento dela. Grava chave_externa (trava contra duplicidade) e categoria_id (sem ele não há natureza gerencial, e o lançamento fica fora da DRE mostrando categoria na tela).';

-- Repara as duas linhas que a regra classificou antes deste conserto.
update public.lancamentos l
   set categoria_id = c.id,
       categoria = c.nome,
       atualizado_em = now()
  from public.categorias_financeiras c
 where l.categoria_id is null
   and l.categoria is not null
   and lower(c.nome) = lower(btrim(l.categoria));
