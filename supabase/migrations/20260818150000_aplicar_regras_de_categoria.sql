-- As regras de categoria valem na CONVERSÃO, não só na tela.
--
-- "Compra de etiquetas" entrou duas vezes sem categoria no mesmo dia em que
-- onze iguais tinham sido classificadas à mão — porque nenhuma rotina
-- aplicava as regras que o dono já cadastrou. Esta função fecha o ciclo:
-- todo lançamento sem categoria que casar com uma regra ativa (pela
-- descrição ou pelo favorecido) ganha a categoria dela. Transferência
-- própria, crédito de venda e saque na fila de destino ficam de fora —
-- classificá-los duplicaria o dinheiro.
create or replace function public.aplicar_regras_de_categoria()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_aplicadas int := 0;
begin
  with alvo as (
    select l.id,
           (select r.categoria_id
              from regras_categoria r
             where r.ativa
               and r.categoria_id is not null
               and (l.descricao ilike '%' || r.padrao || '%'
                    or coalesce(l.favorecido, '') ilike '%' || r.padrao || '%')
             -- Padrão mais longo decide o empate: "melhor envio etiqueta"
             -- vence "envio".
             order by r.prioridade desc, length(r.padrao) desc
             limit 1) as categoria_id
      from lancamentos l
     where l.categoria_id is null
       and l.cancelado_em is null
       and not coalesce(l.aguarda_destino, false)
       and l.transferencia_id is null
       and l.pedido_id is null
  )
  update lancamentos l
     set categoria_id = a.categoria_id,
         categoria = c.nome,
         atualizado_em = now()
    from alvo a
    join categorias_financeiras c on c.id = a.categoria_id
   where l.id = a.id
     and a.categoria_id is not null;
  get diagnostics v_aplicadas = row_count;
  return jsonb_build_object('aplicadas', v_aplicadas);
end;
$$;

revoke execute on function public.aplicar_regras_de_categoria() from anon, authenticated;

-- A regra que faltava para o caso que doeu hoje: etiquetas de envio.
insert into regras_categoria (padrao, categoria, categoria_id, ativa, prioridade)
select 'etiqueta', 'Frete', 'frete', true, 0
where not exists (select 1 from regras_categoria where padrao ilike 'etiqueta%');
