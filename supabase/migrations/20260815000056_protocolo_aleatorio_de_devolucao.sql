-- O protocolo deixa de ser um contador.
--
-- "DEV-1003" contava duas histórias que não são do cliente: quantas
-- devoluções a loja já teve, e qual é o protocolo do vizinho (DEV-1002,
-- DEV-1004). O portal identifica o caso por protocolo + e-mail/CPF, então
-- adivinhar o primeiro é meio caminho — e o número de casos é informação de
-- negócio que não deveria viajar em cada e-mail.
--
-- O novo formato é aleatório e legível ao telefone: 8 caracteres em dois
-- blocos, tipo "K7QM-4XT9". O alfabeto exclui os pares que confundem quem
-- lê em voz alta ou digita do print: I e 1, O e 0, além de U (para não
-- formar palavra por acaso).
create or replace function gerar_protocolo_devolucao()
returns text
language plpgsql
as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTVWXYZ';
  v_codigo text;
  v_tentativa int := 0;
begin
  loop
    v_codigo := '';
    for i in 1..8 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
      if i = 4 then
        v_codigo := v_codigo || '-';
      end if;
    end loop;

    exit when not exists (
      select 1 from solicitacoes_devolucao where protocolo = v_codigo
    );

    -- 31^8 combinações: colidir é raro, mas "raro" não é "nunca" — e um
    -- protocolo repetido daria o caso de outro cliente a quem digitasse.
    v_tentativa := v_tentativa + 1;
    if v_tentativa > 20 then
      raise exception 'não foi possível gerar um protocolo único';
    end if;
  end loop;

  return v_codigo;
end;
$$;

comment on function gerar_protocolo_devolucao is
  'Protocolo aleatório de 8 caracteres em dois blocos, sem caracteres ambíguos';

create or replace function abrir_solicitacao_devolucao(
  p_pedido_id text,
  p_tipo text,
  p_motivo text,
  p_comentario text,
  p_itens jsonb,
  p_fotos jsonb
) returns text
language plpgsql
as $$
declare
  v_protocolo text;
begin
  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'pedido % não existe', p_pedido_id;
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'escolha ao menos um item para devolver';
  end if;

  -- Caso aberto para o mesmo pedido devolve o protocolo existente em vez de
  -- criar outro. O índice único garante o mesmo do lado do banco.
  select protocolo into v_protocolo
    from solicitacoes_devolucao
   where pedido_id = p_pedido_id
     and status not in ('Concluída', 'Recusada');
  if found then
    return v_protocolo;
  end if;

  v_protocolo := gerar_protocolo_devolucao();

  insert into solicitacoes_devolucao (
    protocolo, pedido_id, tipo, motivo, comentario, itens, fotos
  ) values (
    v_protocolo, p_pedido_id, p_tipo, coalesce(p_motivo, ''),
    coalesce(p_comentario, ''), coalesce(p_itens, '[]'::jsonb),
    coalesce(p_fotos, '{}'::jsonb)
  );

  return v_protocolo;
end;
$$;

-- A sequence some: mantê-la seria deixar o contador vivo sem ninguém olhando.
drop sequence if exists solicitacoes_devolucao_id_seq;
