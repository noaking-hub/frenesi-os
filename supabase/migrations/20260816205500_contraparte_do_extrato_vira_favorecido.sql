-- O nome de quem recebeu desce do extrato para o lançamento.
--
-- `chaveDoMovimento`, no motor de classificação, usa o FAVORECIDO como
-- identidade e só cai na descrição quando ele falta. Com favorecido vazio,
-- trinta e nove movimentos do Mercado Pago compartilham duas descrições
-- genéricas — "Compra paga pela conta" e "Crédito a classificar" — e o
-- histórico não consegue distinguir o motoboy do imposto: tudo colide na
-- mesma chave, e a sugestão sai sem confiança nenhuma.
--
-- A conversão do extrato já monta a descrição com a contraparte quando ela
-- existe, mas roda ANTES do enriquecimento. Quem foi convertido com o campo
-- vazio nunca mais recebe o nome — daí esta função, que pode rodar quantas
-- vezes for preciso.
create or replace function public.propagar_contraparte_para_lancamentos()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update lancamentos l
     set favorecido = btrim(e.contraparte),
         -- A descrição genérica ganha o nome atrás de um travessão, no mesmo
         -- formato que a conversão usaria se soubesse na hora.
         descricao = case
           when l.descricao like '%–%' then l.descricao
           else l.descricao || ' – ' || btrim(e.contraparte)
         end,
         atualizado_em = now()
    from extrato_linhas e
   where e.lancamento_id = l.id
     and coalesce(btrim(e.contraparte), '') <> ''
     and coalesce(btrim(l.favorecido), '') = ''
     and l.cancelado_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;
