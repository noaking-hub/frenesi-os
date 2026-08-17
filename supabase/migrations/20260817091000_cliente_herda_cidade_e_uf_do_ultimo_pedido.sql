-- `clientes.cidade` e `clientes.uf` existiam vazias nas 696 linhas.
--
-- A informação sempre esteve no ERP, na coluna errada: cada pedido guarda
-- `destino` no formato "Muriaé · MG", vindo da importação. Com as colunas do
-- cliente em branco, qualquer pergunta de geografia — "quantos clientes tenho
-- em Minas?", "vale a pena anunciar em Itaperuna?" — só podia ser respondida
-- varrendo pedidos, e nenhuma tela fazia isso.
--
-- A regra é o ÚLTIMO pedido, não o primeiro: quem mudou de cidade é
-- encontrado onde mora hoje.

create or replace function public.cidade_do_cliente(p_cliente_id uuid)
returns table (cidade text, uf text)
language sql
stable
set search_path = public
as $$
  select
    nullif(btrim(split_part(p.destino, '·', 1)), '') as cidade,
    nullif(upper(btrim(split_part(p.destino, '·', 2))), '') as uf
  from pedidos p
  where p.cliente_id = p_cliente_id
    and p.destino is not null
    and p.destino like '%·%'
  order by p.comprado_em desc
  limit 1;
$$;

revoke execute on function public.cidade_do_cliente(uuid) from anon, authenticated, public;

with ultimo as (
  select distinct on (p.cliente_id)
         p.cliente_id,
         nullif(btrim(split_part(p.destino, '·', 1)), '') as cidade,
         nullif(upper(btrim(split_part(p.destino, '·', 2))), '') as uf
    from pedidos p
   where p.cliente_id is not null
     and p.destino like '%·%'
   order by p.cliente_id, p.comprado_em desc
)
update clientes c
   set cidade = u.cidade, uf = u.uf
  from ultimo u
 where u.cliente_id = c.id
   and u.cidade is not null
   and (c.cidade is null or c.cidade = '' or c.uf is null or c.uf = '');

-- E mantém preenchido: pedido importado é o momento em que a cidade fica
-- conhecida. Um gatilho aqui é o que impede a coluna voltar a esvaziar
-- sozinha — que foi exatamente o que aconteceu até hoje.
create or replace function public.pedido_atualiza_cidade_do_cliente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cliente_id is null or new.destino is null or new.destino not like '%·%' then
    return new;
  end if;

  update clientes
     set cidade = nullif(btrim(split_part(new.destino, '·', 1)), ''),
         uf = nullif(upper(btrim(split_part(new.destino, '·', 2))), '')
   where id = new.cliente_id
     -- Só avança para frente no tempo: reimportar um pedido antigo não pode
     -- devolver o cliente para a cidade onde ele morava ano passado.
     and not exists (
       select 1 from pedidos p
        where p.cliente_id = new.cliente_id
          and p.destino is not null
          and p.comprado_em > new.comprado_em
     );
  return new;
end;
$$;

drop trigger if exists pedido_preenche_cidade on public.pedidos;
create trigger pedido_preenche_cidade
  after insert or update of destino, cliente_id on public.pedidos
  for each row execute function public.pedido_atualiza_cidade_do_cliente();
