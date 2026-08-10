-- ═══════════════════════════════════════════════════════════════════════════
-- Ocorrências de entrega: o pedido que parou no caminho.
--
-- Diferente do envio, que é derivado do pedido, a ocorrência é um FATO NOVO:
-- alguém abriu um chamado com a transportadora e alguém precisa acompanhar.
-- Por isso ela tem tabela — não dá para derivar de nada que já exista.
-- ═══════════════════════════════════════════════════════════════════════════

create sequence ocorrencias_id_seq start 1;

create table ocorrencias (
  id          text primary key,
  pedido_id   text not null references pedidos (id) on delete cascade,
  tipo        text not null check (tipo in (
                'extravio', 'avaria', 'atraso', 'endereco-insuficiente',
                'sem-movimentacao', 'entrega-nao-efetuada')),
  estado      text not null default 'aberta' check (estado in (
                'aberta', 'aguardando-cliente', 'em-indenizacao', 'resolvida')),
  aberta_em   timestamptz not null default now(),
  -- Prazo combinado com a transportadora para responder. É o que separa
  -- "aberta ontem" de "aberta e estourada há uma semana".
  prazo       date,
  responsavel text not null default '',
  acao        text not null default '',
  resolvida_em timestamptz,
  desfecho    text not null default '',
  -- Como a linha nasceu: à mão ou pela varredura automática.
  origem      text not null default 'Manual'
);

create index on ocorrencias (pedido_id);
create index on ocorrencias (estado);

-- Um pedido não pode ter duas ocorrências ABERTAS do mesmo tipo: a varredura
-- roda todo dia, e sem isto ela empilharia a mesma reclamação. O índice é
-- parcial porque o histórico PODE ter várias resolvidas.
create unique index ocorrencias_abertas_unicas
  on ocorrencias (pedido_id, tipo)
  where estado <> 'resolvida';

comment on table ocorrencias is
  'Chamados de entrega. Uma aberta por pedido e tipo — a varredura diária não empilha a mesma reclamação.';

create function abrir_ocorrencia(
  p_pedido_id   text,
  p_tipo        text,
  p_acao        text,
  p_prazo_dias  integer,
  p_responsavel text,
  p_origem      text
) returns text
language plpgsql
as $$
declare
  v_id text;
begin
  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'pedido % não existe', p_pedido_id;
  end if;

  select id into v_id from ocorrencias
   where pedido_id = p_pedido_id and tipo = p_tipo and estado <> 'resolvida';
  if found then
    -- Devolve a que já existe em vez de falhar: quem clicou duas vezes quer
    -- a ocorrência aberta, não uma mensagem de erro.
    return v_id;
  end if;

  v_id := 'OC-' || lpad(nextval('ocorrencias_id_seq')::text, 5, '0');

  insert into ocorrencias (id, pedido_id, tipo, acao, prazo, responsavel, origem)
  values (
    v_id, p_pedido_id, p_tipo, coalesce(p_acao, ''),
    current_date + coalesce(p_prazo_dias, 5),
    coalesce(p_responsavel, ''), coalesce(nullif(p_origem, ''), 'Manual')
  );

  return v_id;
end;
$$;

create function mover_ocorrencia(
  p_id       text,
  p_estado   text,
  p_acao     text,
  p_desfecho text
) returns void
language plpgsql
as $$
begin
  update ocorrencias
     set estado = p_estado,
         acao = coalesce(nullif(trim(p_acao), ''), acao),
         desfecho = case when p_estado = 'resolvida'
                         then coalesce(nullif(trim(p_desfecho), ''), desfecho)
                         else desfecho end,
         resolvida_em = case when p_estado = 'resolvida' then now() else null end
   where id = p_id;

  if not found then
    raise exception 'ocorrência % não existe', p_id;
  end if;
end;
$$;

/**
 * Abre as ocorrências que os próprios dados já denunciam.
 *
 * Dois recortes deliberados:
 *
 *  - Só pedido que ENTROU no fluxo de envio (aguardando envio ou enviado).
 *    Pedido pago que nunca começou a ser separado é outra falha — nossa, não
 *    da transportadora —, e misturar as duas encheria a fila de chamados que
 *    ninguém vai abrir com os Correios.
 *  - Só os últimos `p_janela_dias`. Sem isso a primeira varredura abriria
 *    ocorrência para todo pedido antigo do histórico importado, e a tela
 *    nasceria com centenas de chamados que ninguém vai tratar — o jeito mais
 *    rápido de fazer um alerta virar ruído.
 */
create function varrer_ocorrencias(
  p_dias        integer default 15,
  p_responsavel text default '',
  p_janela_dias integer default 90
) returns integer
language plpgsql
as $$
declare
  v_pedido record;
  v_novas  integer := 0;
begin
  for v_pedido in
    select p.id
      from pedidos p
     where p.pagamento = 'pago'
       and p.envio in ('aguardando_envio', 'enviado')
       and p.comprado_em < now() - (p_dias || ' days')::interval
       and p.comprado_em > now() - (p_janela_dias || ' days')::interval
       and not exists (
         select 1 from ocorrencias o
          where o.pedido_id = p.id and o.estado <> 'resolvida'
       )
     order by p.comprado_em
  loop
    perform abrir_ocorrencia(
      v_pedido.id, 'sem-movimentacao', 'Cobrar posição da transportadora',
      5, p_responsavel, 'Varredura'
    );
    v_novas := v_novas + 1;
  end loop;

  return v_novas;
end;
$$;

comment on function varrer_ocorrencias is
  'Abre ocorrência para pedido em trânsito há dias sem entrega, dentro da janela recente. Idempotente.';

alter table ocorrencias enable row level security;
create policy erp_leitura on ocorrencias for select to authenticated using (true);
