-- Três correções na devolução, todas de regra.
--
-- 1. O PRAZO contava de uma data no futuro.
--
--    `entregue_em` ficava nulo em 348 pedidos entregues, e o cálculo caía na
--    `entrega_prevista_em` como relógio reserva. Quando a entrega acontece
--    ANTES do previsto — que é o caso comum — essa data está no futuro: os
--    dias desde a entrega davam negativo e o prazo aparecia maior que os 7
--    do CDC. Um pedido marcado entregue hoje mostrava "11 dias restantes".
--
--    A data certa estava no banco o tempo todo: `entrega_shopify_em`, o
--    instante em que a plataforma registrou a entrega. Ela nunca está no
--    futuro e nunca é anterior à entrega real — o cliente não perde prazo
--    por falha nossa, e a loja não concede prazo que não deve.
--
-- 2. Dois pedidos de devolução para o mesmo pedido.
--
--    A função já devolvia o protocolo existente em vez de criar outro, mas
--    nada impedia o portal de rodar o fluxo inteiro de novo — e o segundo
--    envio SOBRESCREVIA as provas do primeiro. Quem quisesse trocar a foto
--    depois da análise conseguia. Agora o banco recusa.
--
-- 3. "Pedir mais fotos" não dizia o que faltava.
--
--    O botão mudava o status e parava aí. Sem um texto, nem o cliente sabe o
--    que reenviar, nem a operação lembra o que pediu.

-- ── 1. A entrega real vira o relógio do prazo ──────────────────────────────
update pedidos
   set entregue_em = entrega_shopify_em
 where situacao = 'entregue'
   and entregue_em is null
   and entrega_shopify_em is not null;

-- Sobrou quem nem isso tem: a previsão serve, desde que já tenha passado.
update pedidos
   set entregue_em = entrega_prevista_em
 where situacao = 'entregue'
   and entregue_em is null
   and entrega_prevista_em is not null
   and entrega_prevista_em <= now();

-- Daqui para a frente o dado não nasce torto: virou entregue, carimba.
create or replace function carimbar_entrega()
returns trigger
language plpgsql
as $$
begin
  if new.situacao = 'entregue' and new.entregue_em is null then
    -- A data da plataforma, quando existe; senão agora, que é quando o ERP
    -- soube. Nunca a previsão futura — ela adiantaria o fim do prazo.
    new.entregue_em := coalesce(new.entrega_shopify_em, now());
  end if;
  return new;
end;
$$;

drop trigger if exists carimbar_entrega on pedidos;
create trigger carimbar_entrega
  before insert or update of situacao, entrega_shopify_em on pedidos
  for each row execute function carimbar_entrega();

-- ── 2. Uma devolução aberta por pedido, garantida no banco ─────────────────
create unique index if not exists solicitacao_aberta_unica_por_pedido
  on solicitacoes_devolucao (pedido_id)
  where status not in ('Concluída', 'Recusada');

-- ── 3. O que a operação pediu fica escrito ─────────────────────────────────
alter table solicitacoes_devolucao add column if not exists pedido_de_fotos text;

comment on column solicitacoes_devolucao.pedido_de_fotos is
  'O que a triagem pediu ao cliente quando marcou "Aguardando fotos" — o portal mostra este texto';

-- ── Reenvio de provas pelo cliente, sem reabrir a solicitação ──────────────
--
-- Só troca os caminhos das provas e devolve o caso para análise. A dupla
-- protocolo + e-mail/CPF é a mesma chave da consulta pública: protocolo
-- sozinho circula em print, a identidade não.
create or replace function reenviar_provas_da_devolucao(
  p_protocolo text,
  p_identificacao text,
  p_nivel text,
  p_lacre text,
  p_video text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_digitos text := regexp_replace(coalesce(p_identificacao, ''), '\D', '', 'g');
begin
  select true into v_ok
    from solicitacoes_devolucao s
    join pedidos p on p.id = s.pedido_id
    left join clientes c on c.id = p.cliente_id
   where s.protocolo = p_protocolo
     and s.status = 'Aguardando fotos'
     and (
       lower(coalesce(c.email, '')) = lower(trim(p_identificacao))
       or (length(v_digitos) = 11 and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = v_digitos)
     );
  if not found then
    return false;
  end if;

  update solicitacoes_devolucao
     set foto_nivel = coalesce(p_nivel, foto_nivel),
         foto_lacre = coalesce(p_lacre, foto_lacre),
         video = coalesce(p_video, video),
         status = 'Em análise',
         pedido_de_fotos = null
   where protocolo = p_protocolo;

  return true;
end;
$$;

comment on function reenviar_provas_da_devolucao is
  'Cliente responde ao pedido de novas fotos e o caso volta para análise';
