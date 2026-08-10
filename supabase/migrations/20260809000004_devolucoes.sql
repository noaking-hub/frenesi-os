-- ═══════════════════════════════════════════════════════════════════════════
-- Devoluções abertas pelo cliente no portal.
--
-- Até aqui o portal terminava com um protocolo escrito no código —
-- "DEV-1042" para todo mundo. O cliente saía achando que tinha aberto uma
-- devolução e não havia nada do outro lado. Esta tabela é esse outro lado.
-- ═══════════════════════════════════════════════════════════════════════════

create sequence solicitacoes_devolucao_id_seq start 1000;

create table solicitacoes_devolucao (
  protocolo   text primary key,
  pedido_id   text not null references pedidos (id) on delete cascade,
  tipo        text not null check (tipo in ('Arrependimento', 'Defeito', 'Erro de envio')),
  motivo      text not null default '',
  comentario  text not null default '',
  -- O que o cliente marcou, do jeito que ele viu na tela. Guardar a escolha
  -- crua é o que permite conferir depois se o que chegou é o que ele pediu
  -- para devolver.
  itens       jsonb not null default '[]'::jsonb,
  -- As fotos obrigatórias: nível do frasco e lacre. Booleanos, não arquivos —
  -- o portal ainda não recebe upload, e fingir que recebe seria pior.
  fotos       jsonb not null default '{}'::jsonb,
  status      text not null default 'Nova' check (status in (
                'Nova', 'Em análise', 'Aguardando fotos', 'Aprovada', 'Recusada',
                'Aguardando postagem', 'Em trânsito reverso', 'Recebida', 'Concluída')),
  aberta_em   timestamptz not null default now(),
  reverso     text not null default '',
  lacre       text not null default 'intacto'
                check (lacre in ('intacto', 'rompido-no-transporte', 'violado')),
  -- A conferência física: volume medido de cada item quando o pacote chega.
  -- Só existe depois de 'Recebida'; antes disso é lista vazia, e a triagem
  -- diz que ainda não há o que decidir.
  conferencia jsonb not null default '[]'::jsonb,
  nota        text not null default '',
  atualizada_em timestamptz not null default now()
);

create index on solicitacoes_devolucao (status);
create index on solicitacoes_devolucao (pedido_id);

comment on table solicitacoes_devolucao is
  'Devoluções abertas no portal do cliente. O protocolo é gerado aqui, não escrito na tela.';

/**
 * Abre a solicitação e devolve o protocolo.
 *
 * Um pedido pode ter mais de uma devolução ao longo do tempo, mas não duas
 * ABERTAS ao mesmo tempo: a segunda seria o cliente clicando de novo por não
 * ter visto a primeira, e duas etiquetas de reverso para o mesmo pacote é
 * frete pago duas vezes.
 */
create function abrir_solicitacao_devolucao(
  p_pedido_id  text,
  p_tipo       text,
  p_motivo     text,
  p_comentario text,
  p_itens      jsonb,
  p_fotos      jsonb
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

  select protocolo into v_protocolo
    from solicitacoes_devolucao
   where pedido_id = p_pedido_id
     and status not in ('Concluída', 'Recusada');
  if found then
    return v_protocolo;
  end if;

  v_protocolo := 'DEV-' || nextval('solicitacoes_devolucao_id_seq')::text;

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

create function mover_solicitacao_devolucao(
  p_protocolo text,
  p_status    text,
  p_nota      text,
  p_reverso   text
) returns void
language plpgsql
as $$
begin
  update solicitacoes_devolucao
     set status = p_status,
         nota = coalesce(nullif(trim(p_nota), ''), nota),
         reverso = coalesce(nullif(trim(p_reverso), ''), reverso),
         atualizada_em = now()
   where protocolo = p_protocolo;

  if not found then
    raise exception 'protocolo % não existe', p_protocolo;
  end if;
end;
$$;

/**
 * Registra a conferência física do que chegou.
 *
 * Cada item: { perfume, variante, medido_ml, observacao }. O volume medido é
 * o que decide se a devolução é aceita — e é medido, não declarado, por isso
 * ele só entra por aqui e nunca pelo portal.
 */
create function conferir_devolucao(
  p_protocolo text,
  p_itens     jsonb,
  p_lacre     text
) returns void
language plpgsql
as $$
begin
  update solicitacoes_devolucao
     set conferencia = coalesce(p_itens, '[]'::jsonb),
         lacre = coalesce(nullif(p_lacre, ''), lacre),
         status = 'Recebida',
         atualizada_em = now()
   where protocolo = p_protocolo;

  if not found then
    raise exception 'protocolo % não existe', p_protocolo;
  end if;
end;
$$;

alter table solicitacoes_devolucao enable row level security;
create policy erp_leitura on solicitacoes_devolucao for select to authenticated using (true);
