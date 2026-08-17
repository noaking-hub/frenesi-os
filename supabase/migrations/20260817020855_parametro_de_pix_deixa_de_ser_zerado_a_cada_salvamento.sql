-- O desconto de Pix era zerado toda vez que alguém salvava os parâmetros.
--
-- `parametros_precificacao` guarda o histórico: cada alteração INSERE uma
-- linha nova e a mais recente é a vigente. Três funções escrevem nela
-- (`salvar_parametros` em duas sobrecargas e `ajustar_ads_parametro`), e
-- NENHUMA lista `desconto_pix_pct`/`fatia_pix_pct` no INSERT. Como as colunas
-- têm `default 0`, cada salvamento nascia com Pix zerado.
--
-- O efeito no preço é grande: o desconto de Pix é o MAIOR custo de receber da
-- operação — 10% do preço, em três quartos das vendas, contra 0,43% de tarifa
-- do gateway. Com ele em zero, a margem exibida fica otimista em cerca de
-- vinte pontos, e produto vendido no negativo aparece como lucrativo.
--
-- Consertar as três funções resolveria hoje e falharia na quarta: a próxima
-- sobrecarga nasceria com o mesmo esquecimento. A trava certa fica na TABELA.
--
-- O truque é tirar o `default 0`. Sem default, a coluna omitida chega ao
-- trigger como NULL — o que finalmente distingue "não informei" de "quero
-- zero". O trigger herda da linha anterior no primeiro caso e respeita o zero
-- no segundo, que é como `ajustar_pix_parametro` continua conseguindo zerar
-- de propósito. O `not null` é conferido DEPOIS dos triggers BEFORE, então a
-- coluna segue obrigatória sem atrapalhar.
alter table public.parametros_precificacao
  alter column desconto_pix_pct drop default,
  alter column fatia_pix_pct drop default;

create or replace function public.herdar_parametros_nao_informados()
returns trigger
language plpgsql
as $function$
declare v_anterior parametros_precificacao%rowtype;
begin
  if new.desconto_pix_pct is null or new.fatia_pix_pct is null then
    select * into v_anterior
      from parametros_precificacao
     order by vigente_desde desc
     limit 1;

    new.desconto_pix_pct := coalesce(new.desconto_pix_pct, v_anterior.desconto_pix_pct, 0);
    new.fatia_pix_pct := coalesce(new.fatia_pix_pct, v_anterior.fatia_pix_pct, 0);
  end if;
  return new;
end;
$function$;

drop trigger if exists parametros_herdam_pix on public.parametros_precificacao;
create trigger parametros_herdam_pix
  before insert on public.parametros_precificacao
  for each row execute function public.herdar_parametros_nao_informados();

comment on trigger parametros_herdam_pix on public.parametros_precificacao is
  'Coluna de Pix omitida no INSERT herda a linha vigente. Zero explícito é '
  'respeitado — só o NULL (coluna não listada) é que herda.';

-- Restaura os números reais, que a migration 20260810112317 já tinha gravado
-- e que os salvamentos seguintes apagaram: 10% de desconto no checkout, em
-- 74,9% das vendas (fatia medida no extrato do gateway).
update public.parametros_precificacao
   set desconto_pix_pct = 10, fatia_pix_pct = 74.9
 where id = (select id from parametros_precificacao order by vigente_desde desc limit 1);
