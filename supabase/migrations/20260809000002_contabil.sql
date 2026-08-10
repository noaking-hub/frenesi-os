-- ═══════════════════════════════════════════════════════════════════════════
-- Plano de contas e fechamento da competência.
--
-- O ERP não emite nota fiscal — quem emite é o Olist, já ligado à Yampi. O
-- que cabe a ele é apurar o mês a partir dos pedidos pagos e dos lançamentos
-- classificados, e produzir o arquivo que o escritório lê.
-- ═══════════════════════════════════════════════════════════════════════════

-- A conta contábil vive junto da categoria porque é ela que traduz o nosso
-- vocabulário para o do escritório. Num mapa fixo no código, categoria nova
-- nasce sem conta e ninguém descobre até o contador reclamar.
alter table categorias_financeiras add column if not exists conta_contabil text not null default '';

comment on column categorias_financeiras.conta_contabil is
  'Conta do plano do escritório. Vazia significa que o fechamento vai acusar a falta, não inventar uma.';

update categorias_financeiras set conta_contabil = v.conta
from (values
  ('Perfume base',       '1.1.03.001 · estoque de perfume base'),
  ('Frascos e insumos',  '1.1.03.002 · materiais de embalagem'),
  ('Frete',              '3.1.02.004 · fretes e carretos'),
  ('Taxas de pagamento', '3.1.02.001 · despesas financeiras'),
  ('Imposto',            '3.1.04.001 · tributos sobre venda'),
  ('Marketing e ADS',    '3.1.03.002 · marketing e publicidade'),
  ('Pró-labore',         '3.1.01.001 · remuneração e pró-labore'),
  ('Ocupação',           '3.1.01.004 · ocupação e despesas gerais'),
  ('Ferramentas e SaaS', '3.1.03.005 · softwares e assinaturas'),
  ('Diversos',           '3.1.03.008 · serviços de terceiros')
) as v(nome, conta)
where categorias_financeiras.nome = v.nome
  and categorias_financeiras.conta_contabil = '';

create function definir_conta_contabil(p_categoria text, p_conta text)
returns void
language plpgsql
as $$
begin
  update categorias_financeiras
     set conta_contabil = coalesce(trim(p_conta), '')
   where nome = p_categoria;
  if not found then
    raise exception 'categoria % não existe', p_categoria;
  end if;
end;
$$;

-- Competência é o mês, não a data do envio: reenviar agosto em outubro
-- continua sendo agosto.
alter table envios_contabeis add column if not exists competencia_texto text not null default '';

-- O corpo fica numa tabela à parte porque a listagem dos envios não precisa
-- dele, e trazer megabytes de CSV para desenhar seis colunas seria desperdício
-- em toda abertura da tela.
create table if not exists envios_contabeis_corpo (
  envio_id bigint primary key references envios_contabeis (id) on delete cascade,
  corpo    text not null
);

/**
 * Guarda o arquivo gerado para o escritório.
 *
 * O conteúdo inteiro fica gravado. É volume, e é o que permite reabrir em
 * dezembro o arquivo exato que o contador recebeu em agosto — reconstruir a
 * partir dos dados de hoje devolveria outro arquivo, porque os dados mudaram.
 */
create function registrar_envio_contabil(
  p_competencia text,
  p_arquivo     text,
  p_conteudo    text,
  p_corpo       text,
  p_registros   integer,
  p_estado      text,
  p_nota        text,
  p_operador    text
) returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  if coalesce(trim(p_arquivo), '') = '' then
    raise exception 'o arquivo precisa de nome';
  end if;
  if coalesce(p_corpo, '') = '' then
    raise exception 'não há conteúdo para enviar ao escritório';
  end if;

  insert into envios_contabeis (
    competencia, competencia_texto, arquivo, conteudo, registros, bytes,
    estado, nota, enviado_por
  ) values (
    (p_competencia || '-01')::date,
    p_competencia,
    p_arquivo,
    p_conteudo,
    coalesce(p_registros, 0),
    octet_length(p_corpo),
    coalesce(nullif(p_estado, ''), 'Processando'),
    coalesce(p_nota, ''),
    p_operador
  )
  returning id into v_id;

  insert into envios_contabeis_corpo (envio_id, corpo) values (v_id, p_corpo);

  return v_id;
end;
$$;

comment on function registrar_envio_contabil is
  'Registra o arquivo enviado ao escritório, com a competência a que ele se refere e o corpo guardado.';

alter table envios_contabeis_corpo enable row level security;
create policy erp_leitura on envios_contabeis_corpo for select to authenticated using (true);
