-- ═══════════════════════════════════════════════════════════════════════════
-- Extrato: o que de fato entrou e saiu da conta, lido do banco e do gateway.
--
-- Até aqui o financeiro era só o que alguém digitou. Lançamento é intenção
-- registrada; extrato é fato consumado. Separar os dois é o que permite
-- responder "o dinheiro caiu?" sem confiar na memória de quem digitou.
--
-- Um lançamento nasce do extrato (classificar a linha) ou é conferido contra
-- ele (dar baixa). Nunca o contrário: o banco não obedece ao ERP.
-- ═══════════════════════════════════════════════════════════════════════════

create table extrato_linhas (
  -- De onde veio o fato. Não é decoração: cada origem tem uma noção própria
  -- de identidade, e é ela que sustenta a chave.
  origem      text not null check (origem in ('mercadopago', 'sicoob', 'ofx', 'manual')),
  -- Identidade do fato NA ORIGEM: id do pagamento no Mercado Pago, FITID do
  -- OFX, número do documento no Sicoob. Reimportar o mesmo arquivo ou
  -- ressincronizar o mesmo período não pode duplicar dinheiro.
  chave       text not null,
  conta_id    text not null references contas_bancarias (id),
  ocorrido_em date not null,
  descricao   text not null,
  contraparte text not null default '',
  documento   text not null default '',
  tipo        text not null check (tipo in ('entrada', 'saida')),
  valor       numeric(12, 2) not null check (valor > 0),

  -- Ligações, todas opcionais e todas preenchidas depois da leitura.
  pedido_id     text references pedidos (id),
  lancamento_id text references lancamentos (id),
  -- Transferência entre contas próprias, estorno que se anula, aporte do
  -- sócio: linha real que não é receita nem despesa. Sem esta saída, ou ela
  -- entra no DRE mentindo, ou fica para sempre na fila de classificar.
  ignorado    boolean not null default false,
  motivo_ignorado text not null default '',

  -- A resposta crua da origem. Ocupa espaço e vale cada byte: quando um
  -- número não bater, a pergunta vai ser "o que o Mercado Pago mandou?", e
  -- sem isto a resposta é um encolher de ombros.
  bruto       jsonb,
  lido_em     timestamptz not null default now(),

  primary key (origem, chave)
);

create index on extrato_linhas (ocorrido_em desc);
create index on extrato_linhas (conta_id);
create index on extrato_linhas (pedido_id);

comment on table extrato_linhas is
  'Movimento real de banco e gateway. A chave é o id do fato na origem, então reimportar não duplica.';

/** O que já foi lido mas ainda não virou lançamento nem foi dispensado. */
create view extrato_a_classificar as
select e.*, c.nome as conta_nome
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
 where e.lancamento_id is null
   and not e.ignorado
 order by e.ocorrido_em desc, e.valor desc;

/**
 * Registra a conta se ela ainda não existir.
 *
 * A conta do Mercado Pago existe no mundo desde a primeira venda; o ERP só
 * não sabia dela. Exigir cadastro manual antes da primeira sincronia trocaria
 * um fato por um formulário.
 */
create function garantir_conta(
  p_id    text,
  p_nome  text,
  p_tipo  text,
  p_banco text,
  p_uso   text
) returns text
language plpgsql
as $$
begin
  insert into contas_bancarias (id, nome, tipo, banco, uso)
  values (p_id, p_nome, p_tipo, p_banco, coalesce(p_uso, ''))
  on conflict (id) do nothing;
  return p_id;
end;
$$;

/**
 * Grava as linhas lidas de uma origem.
 *
 * `on conflict do nothing` é deliberado: uma linha já classificada carrega
 * trabalho humano (categoria, pedido ligado), e reler o extrato não pode
 * apagar isso. O fato não muda; só a nossa leitura dele evolui.
 *
 * Cada item de `p_linhas`:
 *   { chave, ocorrido_em, descricao, contraparte, documento, tipo, valor,
 *     pedido_id, bruto }
 */
create function importar_extrato(
  p_origem   text,
  p_conta_id text,
  p_linhas   jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item      jsonb;
  v_novas     integer := 0;
  v_repetidas integer := 0;
  v_valor     numeric;
  v_tipo      text;
begin
  if not exists (select 1 from contas_bancarias where id = p_conta_id) then
    raise exception 'a conta % não está cadastrada', p_conta_id;
  end if;
  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'as linhas do extrato precisam vir em uma lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_linhas) loop
    v_valor := (v_item ->> 'valor')::numeric;
    v_tipo  := v_item ->> 'tipo';

    -- Linha de valor zero não é movimento; deixar passar encheria a fila de
    -- classificação com nada.
    if v_valor is null or v_valor = 0 then
      continue;
    end if;
    -- Quem lê o arquivo pode mandar o sinal em vez do tipo. Aceitar os dois
    -- evita que um leitor novo precise repetir a mesma decisão.
    if v_tipo is null then
      v_tipo := case when v_valor < 0 then 'saida' else 'entrada' end;
    end if;
    v_valor := abs(v_valor);

    insert into extrato_linhas (
      origem, chave, conta_id, ocorrido_em, descricao, contraparte, documento,
      tipo, valor, pedido_id, bruto
    ) values (
      p_origem,
      v_item ->> 'chave',
      p_conta_id,
      (v_item ->> 'ocorrido_em')::date,
      coalesce(nullif(trim(v_item ->> 'descricao'), ''), 'Sem descrição'),
      coalesce(v_item ->> 'contraparte', ''),
      coalesce(v_item ->> 'documento', ''),
      v_tipo,
      v_valor,
      -- Só liga ao pedido se o pedido existir de fato: um id vindo do
      -- gateway pode ser de um pedido que nunca chegou ao ERP.
      (select p.id from pedidos p where p.id = v_item ->> 'pedido_id'),
      v_item -> 'bruto'
    )
    on conflict (origem, chave) do nothing;

    if found then
      v_novas := v_novas + 1;
    else
      v_repetidas := v_repetidas + 1;
    end if;
  end loop;

  return jsonb_build_object('novas', v_novas, 'repetidas', v_repetidas);
end;
$$;

comment on function importar_extrato is
  'Grava linhas de extrato de forma idempotente. Linha já conhecida é preservada, não sobrescrita.';

/**
 * Transforma a linha do extrato em lançamento — já baixado.
 *
 * Baixado porque o dinheiro JÁ se moveu: criar como previsão obrigaria a dar
 * baixa em seguida num fato que já é passado, e no intervalo o saldo do ERP
 * discordaria do saldo do banco.
 */
create function classificar_extrato(
  p_origem    text,
  p_chave     text,
  p_categoria text,
  p_descricao text,
  p_operador  text
) returns text
language plpgsql
as $$
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
    id, ocorrido_em, descricao, categoria, conta_id, tipo, valor,
    baixado_em, origem, pedido_id, criado_por
  ) values (
    v_id,
    v_linha.ocorrido_em,
    coalesce(nullif(trim(p_descricao), ''), v_linha.descricao),
    nullif(trim(p_categoria), ''),
    v_linha.conta_id,
    v_linha.tipo,
    v_linha.valor,
    v_linha.ocorrido_em,
    'Extrato ' || v_linha.origem,
    v_linha.pedido_id,
    p_operador
  );

  update extrato_linhas set lancamento_id = v_id
   where origem = p_origem and chave = p_chave;

  return v_id;
end;
$$;

comment on function classificar_extrato is
  'Cria o lançamento correspondente à linha do extrato, já baixado — o dinheiro já se moveu.';

/** Tira da fila o que é real mas não é receita nem despesa. O motivo é obrigatório. */
create function ignorar_extrato(
  p_origem text,
  p_chave  text,
  p_motivo text
) returns void
language plpgsql
as $$
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'diga por que esta linha não vira lançamento';
  end if;

  update extrato_linhas
     set ignorado = true, motivo_ignorado = trim(p_motivo)
   where origem = p_origem and chave = p_chave and lancamento_id is null;

  if not found then
    raise exception 'linha % não existe ou já virou lançamento', p_chave;
  end if;
end;
$$;

-- ── Repasse: o que o gateway diz sobre a própria taxa ───────────────────────

-- A taxa esperada continua vindo do parâmetro de precificação — é ela que
-- entra no preço. Estas colunas guardam o que o gateway COBROU de fato, para
-- que a diferença entre o preço que praticamos e o custo real do dinheiro
-- pare de ser suposição.
alter table repasses add column if not exists gateway_id  text;
alter table repasses add column if not exists bruto_gateway numeric(12, 2);
alter table repasses add column if not exists taxa_real   numeric(12, 2);

comment on column repasses.taxa_real is
  'Tarifa em reais que o gateway informou. A taxa_pct segue sendo a esperada, que é a que entra no preço.';

/**
 * Concilia vários repasses de uma vez, com o que o gateway informou.
 *
 * Devolve também o que NÃO casou: um pagamento sem pedido correspondente é
 * dinheiro que entrou sem venda registrada, e silenciar isso seria esconder
 * exatamente o caso que precisa de gente olhando.
 *
 * Cada item: { pedido_id, recebido, creditado_em, gateway_id, bruto, taxa_real }
 */
create function conciliar_repasses_lote(p_itens jsonb, p_operador text)
returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_conciliados integer := 0;
  v_inalterados integer := 0;
  v_orfaos      jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'os itens da conciliação precisam vir em uma lista';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    update repasses
       set recebido      = (v_item ->> 'recebido')::numeric,
           creditado_em  = coalesce((v_item ->> 'creditado_em')::date, current_date),
           gateway_id    = v_item ->> 'gateway_id',
           bruto_gateway = (v_item ->> 'bruto')::numeric,
           taxa_real     = (v_item ->> 'taxa_real')::numeric,
           conciliado_por = p_operador
     where pedido_id = v_item ->> 'pedido_id'
       -- Não reescreve conciliação idêntica: sem isto toda sincronia diria
       -- que "conciliou" centenas de repasses que já estavam conciliados.
       and (recebido is distinct from (v_item ->> 'recebido')::numeric);

    if found then
      v_conciliados := v_conciliados + 1;
    elsif exists (select 1 from repasses where pedido_id = v_item ->> 'pedido_id') then
      v_inalterados := v_inalterados + 1;
    else
      v_orfaos := v_orfaos || jsonb_build_array(v_item);
    end if;
  end loop;

  return jsonb_build_object(
    'conciliados', v_conciliados,
    'inalterados', v_inalterados,
    'orfaos', v_orfaos
  );
end;
$$;

comment on function conciliar_repasses_lote is
  'Concilia repasses a partir do gateway. Devolve os pagamentos sem pedido em vez de descartá-los.';

alter table extrato_linhas enable row level security;
create policy erp_leitura on extrato_linhas for select to authenticated using (true);

/**
 * Saldo que o ERP conhece contra o movimento que o extrato mostra.
 *
 * A diferença entre os dois é exatamente a fila de classificação: enquanto
 * houver linha lida sem lançamento, o saldo do ERP está atrasado em relação
 * ao banco. Isso precisa aparecer numa coluna, não ser descoberto no
 * fechamento do mês.
 */
create view contas_conferencia as
select
  c.id,
  c.nome,
  c.banco,
  c.saldo,
  coalesce(sum(e.valor) filter (where e.tipo = 'entrada' and not e.ignorado), 0)
    - coalesce(sum(e.valor) filter (where e.tipo = 'saida' and not e.ignorado), 0)
    as saldo_extrato,
  count(e.*) filter (where e.lancamento_id is null and not e.ignorado) as a_classificar,
  count(e.*) as linhas_lidas,
  max(e.ocorrido_em) as ultima_leitura
from contas_saldo c
left join extrato_linhas e on e.conta_id = c.id
group by c.id, c.nome, c.banco, c.saldo;
