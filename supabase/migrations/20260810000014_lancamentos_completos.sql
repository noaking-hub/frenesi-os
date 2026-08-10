-- ═══════════════════════════════════════════════════════════════════════════
-- Lançamentos de verdade: editar, receber em partes, repetir no tempo.
--
-- O que existia dava para criar e dar baixa, e só. Três coisas faltavam, e
-- cada uma forçava um contorno que suja o histórico:
--
--   editar          errar a descrição obrigava a criar outro e conviver com o
--                   errado, porque não havia como apagar;
--   receber parcial "Ultima parcela perfumes Barão" existe porque a venda de
--                   R$ 1.299 virou três lançamentos digitados à mão — o ERP
--                   não sabia que eram a mesma venda, e o A RECEBER nunca
--                   mostrou o que faltava entrar;
--   repetir         `recorrente` era um selo azul na tela. Não gerava nada, e
--                   a conta do mês seguinte tinha que ser digitada de novo.
--
-- ── Recebimento em partes ──────────────────────────────────────────────────
--
-- `valor` é o total combinado; `recebido` é o que já entrou. O que falta é a
-- subtração, e não um terceiro campo — dois números que precisam concordar
-- entre si acabam discordando.
--
-- O saldo da conta passa a somar `recebido`, não `valor`. É a correção de um
-- erro que existia em silêncio: um lançamento de R$ 1.299 baixado entrava
-- inteiro no caixa mesmo que só R$ 400 tivessem entrado.
--
-- ── Repetição ──────────────────────────────────────────────────────────────
--
-- As ocorrências futuras são criadas como linhas de verdade, não calculadas
-- na hora de exibir. Linha de verdade pode ter valor ajustado, ser baixada
-- sozinha, ser apagada sem derrubar as outras — que é exatamente o que
-- acontece com aluguel que reajusta e assinatura que cancela no meio.
--
-- `serie_id` liga as ocorrências para que dê para apagar a série inteira sem
-- caçar linha por linha.
-- ═══════════════════════════════════════════════════════════════════════════

alter table lancamentos add column if not exists recebido numeric(12,2) not null default 0;
alter table lancamentos add column if not exists recorrencia text;
alter table lancamentos add column if not exists recorrencia_ate date;
alter table lancamentos add column if not exists serie_id text;

alter table lancamentos drop constraint if exists lancamentos_recorrencia_check;
alter table lancamentos add constraint lancamentos_recorrencia_check
  check (recorrencia is null or recorrencia in ('semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'));

comment on column lancamentos.recebido is
  'Quanto do total já entrou ou saiu de fato. O que falta é valor − recebido.';
comment on column lancamentos.serie_id is
  'Liga as ocorrências de uma repetição. Cada uma é uma linha independente.';

create index if not exists lancamentos_serie on lancamentos (serie_id) where serie_id is not null;

-- Lançamentos já baixados tinham o valor cheio realizado; é o que `recebido`
-- passa a dizer. Sem isto o saldo das contas cairia a zero na próxima leitura.
update lancamentos set recebido = valor where baixado_em is not null and recebido = 0;

-- ── O saldo passa a somar o que de fato entrou ─────────────────────────────

create or replace view contas_saldo as
with do_extrato as (
  select conta_id,
    coalesce(sum(valor) filter (where tipo = 'entrada'), 0) as entradas,
    coalesce(sum(valor) filter (where tipo = 'saida'), 0) as saidas,
    coalesce(sum(valor) filter (where tipo = 'entrada' and ocorrido_em >= date_trunc('month', current_date)), 0) as entradas_mes,
    coalesce(sum(valor) filter (where tipo = 'saida' and ocorrido_em >= date_trunc('month', current_date)), 0) as saidas_mes,
    count(*) as linhas
  from extrato_linhas
  where not ignorado
  group by conta_id
),
manuais as (
  -- `recebido` e não `valor`: o dinheiro que moveu o saldo é o que entrou,
  -- não o que foi combinado. Um recebimento parcial move só a parte recebida.
  select conta_id,
    coalesce(sum(recebido) filter (where tipo = 'entrada'), 0) as entradas,
    coalesce(sum(recebido) filter (where tipo = 'saida'), 0) as saidas,
    coalesce(sum(recebido) filter (where tipo = 'entrada' and baixado_em >= date_trunc('month', current_date)), 0) as entradas_mes,
    coalesce(sum(recebido) filter (where tipo = 'saida' and baixado_em >= date_trunc('month', current_date)), 0) as saidas_mes
  from lancamentos
  where origem not like 'Extrato %'
  group by conta_id
)
select c.id, c.nome, c.tipo, c.banco, c.uso, c.principal, c.ativa,
  coalesce(
    c.saldo_informado,
    coalesce(e.entradas,0) + coalesce(m.entradas,0) - coalesce(e.saidas,0) - coalesce(m.saidas,0)
  ) as saldo,
  c.saldo_informado, c.saldo_a_liberar, c.saldo_informado_em,
  coalesce(e.entradas,0) + coalesce(m.entradas,0) - coalesce(e.saidas,0) - coalesce(m.saidas,0) as movimento_lido,
  coalesce(e.entradas_mes,0) + coalesce(m.entradas_mes,0) as entradas_mes,
  coalesce(e.saidas_mes,0) + coalesce(m.saidas_mes,0) as saidas_mes,
  coalesce(e.linhas,0) as linhas_extrato
from contas_bancarias c
left join do_extrato e on e.conta_id = c.id
left join manuais m on m.conta_id = c.id;

-- ── Criar, agora com repetição ─────────────────────────────────────────────

/**
 * Avança uma data conforme a cadência.
 *
 * `mensal` usa intervalo de mês, que o Postgres já resolve para o fim de mês:
 * 31/01 + 1 mês é 28/02, e não um erro. Contar 30 dias erraria a data de toda
 * conta que vence no fim do mês.
 */
create or replace function proxima_ocorrencia(p_data date, p_cadencia text)
returns date
language sql
immutable
as $$
  select case p_cadencia
    when 'semanal'    then p_data + interval '1 week'
    when 'quinzenal'  then p_data + interval '2 weeks'
    when 'mensal'     then p_data + interval '1 month'
    when 'bimestral'  then p_data + interval '2 months'
    when 'trimestral' then p_data + interval '3 months'
    when 'semestral'  then p_data + interval '6 months'
    when 'anual'      then p_data + interval '1 year'
    else null
  end::date;
$$;

drop function if exists registrar_lancamento(text, text, text, text, numeric, date, date, boolean, boolean, text, text);

create function registrar_lancamento(
  p_descricao text,
  p_categoria text,
  p_conta_id text,
  p_tipo text,
  p_valor numeric,
  p_ocorrido_em date,
  p_vence_em date,
  p_baixado boolean,
  p_recorrente boolean,
  p_origem text,
  p_operador text,
  p_recebido numeric default null,
  p_recorrencia text default null,
  p_recorrencia_ate date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_id        text;
  v_serie     text;
  v_data      date;
  v_vence     date;
  v_criadas   integer := 0;
  v_recebido  numeric;
  v_teto      integer := 60;
begin
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'informe a descrição do lançamento';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'o valor deve ser maior que zero';
  end if;
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;

  -- Baixado é atalho para "recebi tudo". Informar as duas coisas em conflito
  -- (baixado com valor parcial) resolve pelo número, que é o mais específico.
  v_recebido := coalesce(p_recebido, case when p_baixado then p_valor else 0 end);
  if v_recebido < 0 then
    raise exception 'o valor recebido não pode ser negativo';
  end if;
  if v_recebido > p_valor then
    raise exception 'o recebido (%) não pode passar do total (%)', v_recebido, p_valor;
  end if;

  v_data  := coalesce(p_ocorrido_em, current_date);
  v_vence := p_vence_em;
  v_id    := 'LC-' || lpad(nextval('lancamentos_id_seq')::text, 5, '0');
  v_serie := case when p_recorrencia is not null then v_id end;

  insert into lancamentos (
    id, ocorrido_em, descricao, categoria, conta_id, tipo, valor, recebido,
    baixado_em, vence_em, recorrente, recorrencia, recorrencia_ate, serie_id,
    origem, criado_por
  ) values (
    v_id, v_data, trim(p_descricao),
    nullif(trim(p_categoria), ''), nullif(trim(p_conta_id), ''), p_tipo, p_valor,
    v_recebido,
    case when v_recebido >= p_valor then v_data end,
    v_vence,
    coalesce(p_recorrente, false) or p_recorrencia is not null,
    p_recorrencia, p_recorrencia_ate, v_serie,
    coalesce(nullif(trim(p_origem), ''), 'Manual'), p_operador
  );
  v_criadas := 1;

  -- As ocorrências futuras nascem em aberto: repetir a baixa junto afirmaria
  -- que o dinheiro de outubro já entrou.
  if p_recorrencia is not null then
    loop
      v_data := proxima_ocorrencia(v_data, p_recorrencia);
      exit when v_data is null;
      exit when p_recorrencia_ate is not null and v_data > p_recorrencia_ate;
      -- Sem data-limite, um ano à frente. Gerar até o infinito encheria a
      -- tela de previsão que ninguém pediu.
      exit when p_recorrencia_ate is null and v_data > current_date + interval '1 year';
      exit when v_criadas >= v_teto;

      if v_vence is not null then
        v_vence := proxima_ocorrencia(v_vence, p_recorrencia);
      end if;

      insert into lancamentos (
        id, ocorrido_em, descricao, categoria, conta_id, tipo, valor, recebido,
        baixado_em, vence_em, recorrente, recorrencia, recorrencia_ate, serie_id,
        origem, criado_por
      ) values (
        'LC-' || lpad(nextval('lancamentos_id_seq')::text, 5, '0'),
        v_data, trim(p_descricao),
        nullif(trim(p_categoria), ''), nullif(trim(p_conta_id), ''), p_tipo, p_valor,
        0, null, coalesce(v_vence, v_data), true,
        p_recorrencia, p_recorrencia_ate, v_serie,
        coalesce(nullif(trim(p_origem), ''), 'Manual'), p_operador
      );
      v_criadas := v_criadas + 1;
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'criadas', v_criadas, 'serie', v_serie);
end;
$$;

comment on function registrar_lancamento is
  'Cria um lançamento e, quando há recorrência, as ocorrências futuras como linhas próprias.';

-- ── Editar ─────────────────────────────────────────────────────────────────

/**
 * Edita um lançamento.
 *
 * `p_serie` estende a mudança às ocorrências FUTURAS da mesma série — nunca
 * às passadas: reescrever o aluguel de março porque o de setembro reajustou
 * mudaria um fato já ocorrido, e o DRE de março passaria a discordar do que
 * foi pago.
 */
create or replace function editar_lancamento(
  p_id text,
  p_descricao text,
  p_categoria text,
  p_conta_id text,
  p_tipo text,
  p_valor numeric,
  p_ocorrido_em date,
  p_vence_em date,
  p_serie boolean default false
)
returns integer
language plpgsql
as $$
declare
  v_atual lancamentos%rowtype;
  v_n     integer;
begin
  select * into v_atual from lancamentos where id = p_id for update;
  if not found then
    raise exception 'lançamento % não existe', p_id;
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'o valor deve ser maior que zero';
  end if;
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if p_valor < v_atual.recebido then
    raise exception
      'o total (%) ficaria abaixo do que já foi recebido (%). Ajuste o recebimento antes.',
      p_valor, v_atual.recebido;
  end if;

  update lancamentos
     set descricao   = trim(p_descricao),
         categoria   = nullif(trim(p_categoria), ''),
         conta_id    = nullif(trim(p_conta_id), ''),
         tipo        = p_tipo,
         valor       = p_valor,
         ocorrido_em = coalesce(p_ocorrido_em, ocorrido_em),
         vence_em    = p_vence_em,
         -- A baixa acompanha o total: aumentar o valor de um lançamento
         -- quitado reabre a diferença, em vez de deixá-lo "pago" devendo.
         baixado_em  = case when recebido >= p_valor then coalesce(baixado_em, current_date) end
   where id = p_id;
  v_n := 1;

  if p_serie and v_atual.serie_id is not null then
    update lancamentos
       set descricao = trim(p_descricao),
           categoria = nullif(trim(p_categoria), ''),
           conta_id  = nullif(trim(p_conta_id), ''),
           tipo      = p_tipo,
           valor     = p_valor
     where serie_id = v_atual.serie_id
       and ocorrido_em > v_atual.ocorrido_em
       and recebido = 0;
    get diagnostics v_n = row_count;
    v_n := v_n + 1;
  end if;

  return v_n;
end;
$$;

-- ── Receber ou pagar em partes ─────────────────────────────────────────────

/**
 * Registra quanto entrou ou saiu de fato, podendo ser menos que o total.
 *
 * Substitui a baixa de tudo-ou-nada. Passar o valor cheio quita; passar
 * menos deixa o restante em aberto e visível no "a receber", que é o número
 * que sumia quando a venda parcelada virava três lançamentos soltos.
 */
create or replace function registrar_recebimento(
  p_id text,
  p_valor numeric,
  p_quando date,
  p_operador text
)
returns jsonb
language plpgsql
as $$
declare
  v_l     lancamentos%rowtype;
  v_novo  numeric;
begin
  select * into v_l from lancamentos where id = p_id for update;
  if not found then
    raise exception 'lançamento % não existe', p_id;
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'informe quanto entrou, maior que zero';
  end if;

  v_novo := v_l.recebido + p_valor;
  if v_novo > v_l.valor + 0.005 then
    raise exception
      'isso passaria do total: já constam % de % combinados, e faltam apenas %',
      v_l.recebido, v_l.valor, v_l.valor - v_l.recebido;
  end if;

  update lancamentos
     set recebido   = v_novo,
         -- A data da baixa é a da quitação, não a do primeiro pedaço: é ela
         -- que diz em que mês o lançamento parou de ser uma conta em aberto.
         baixado_em = case when v_novo >= v_l.valor then coalesce(p_quando, current_date) end,
         criado_por = coalesce(criado_por, p_operador)
   where id = p_id;

  return jsonb_build_object(
    'recebido', v_novo,
    'falta', greatest(0, v_l.valor - v_novo),
    'quitado', v_novo >= v_l.valor
  );
end;
$$;

/** Desfaz os recebimentos e devolve o lançamento para em aberto. */
create or replace function estornar_recebimento(p_id text)
returns void
language plpgsql
as $$
begin
  update lancamentos set recebido = 0, baixado_em = null where id = p_id;
  if not found then
    raise exception 'lançamento % não existe', p_id;
  end if;
end;
$$;

-- ── Excluir ────────────────────────────────────────────────────────────────

/**
 * Apaga um lançamento — e devolve a linha do extrato para a fila.
 *
 * Um lançamento nascido do extrato tem a linha de origem apontando para ele.
 * Apagar sem soltar essa ponta deixaria o movimento marcado como resolvido e
 * fora de qualquer fila — dinheiro que se moveu e o ERP esqueceu.
 */
create or replace function excluir_lancamento(p_id text, p_serie boolean default false)
returns integer
language plpgsql
as $$
declare
  v_l lancamentos%rowtype;
  v_n integer;
begin
  select * into v_l from lancamentos where id = p_id for update;
  if not found then
    raise exception 'lançamento % não existe', p_id;
  end if;

  if p_serie and v_l.serie_id is not null then
    update extrato_linhas set lancamento_id = null
     where lancamento_id in (
       select id from lancamentos
        where serie_id = v_l.serie_id and (id = p_id or (ocorrido_em >= v_l.ocorrido_em and recebido = 0))
     );
    delete from lancamentos
     where serie_id = v_l.serie_id
       and (id = p_id or (ocorrido_em >= v_l.ocorrido_em and recebido = 0));
    get diagnostics v_n = row_count;
  else
    update extrato_linhas set lancamento_id = null where lancamento_id = p_id;
    delete from lancamentos where id = p_id;
    get diagnostics v_n = row_count;
  end if;

  return v_n;
end;
$$;

comment on function excluir_lancamento is
  'Apaga o lançamento e devolve à fila a linha de extrato que o originou. Com p_serie, alcança as ocorrências futuras ainda não recebidas.';
