-- ═══════════════════════════════════════════════════════════════════════════
-- Uma conta por cartão, com o dia da fatura.
--
-- Existia uma conta genérica só, "Cartão de crédito", e a operação usa SEIS
-- cartões. Numa conta só, some justamente o que interessa: de qual cartão é a
-- fatura que vence semana que vem e quanto se deve em cada um.
--
-- O DIA DO VENCIMENTO vira coluna, e não texto no campo `uso`, porque ele é
-- conta, não recado: é ele que decide em que data cada parcela de uma compra
-- parcelada cai. Uma compra em 5× no Nubank (dia 22) vence 22/09, 22/10,
-- 22/11… e é isso que a projeção de caixa precisa saber. Guardado como número,
-- o formulário consegue preencher a data sozinho; guardado como frase, alguém
-- teria de ler e digitar — que é onde a data errada entra.
--
-- Nenhuma delas tem `saldo_informado`: o saldo do cartão é a DÍVIDA, e ela é
-- calculada pelo que foi lançado menos o que foi pago na fatura. Informar um
-- saldo aqui congelaria a dívida numa foto e faria as compras seguintes
-- sumirem do total devido.
-- ═══════════════════════════════════════════════════════════════════════════

alter table contas_bancarias add column if not exists dia_vencimento smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.contas_bancarias'::regclass
       and conname = 'contas_dia_vencimento_valido'
  ) then
    alter table contas_bancarias
      add constraint contas_dia_vencimento_valido
      check (dia_vencimento is null or dia_vencimento between 1 and 31);
  end if;
end $$;

comment on column contas_bancarias.dia_vencimento is
  'Dia do mês em que a fatura do cartão vence. Só faz sentido em conta do tipo Cartão — é ele que posiciona cada parcela de uma compra parcelada na projeção de caixa. Null nas demais contas.';

insert into contas_bancarias (id, nome, tipo, banco, uso, dia_vencimento, ativa, origem_saldo)
values
  ('cartao-digio',       'Cartão Digio',       'Cartão', 'Digio',       'Fatura vence todo dia 20', 20, true, 'calculado'),
  ('cartao-next',        'Cartão Next',        'Cartão', 'Next',        'Fatura vence todo dia 20', 20, true, 'calculado'),
  ('cartao-nubank',      'Cartão Nubank',      'Cartão', 'Nubank',      'Fatura vence todo dia 22', 22, true, 'calculado'),
  ('cartao-bradesco',    'Cartão Bradesco',    'Cartão', 'Bradesco',    'Fatura vence todo dia 25', 25, true, 'calculado'),
  ('cartao-intermedium', 'Cartão Intermedium', 'Cartão', 'Intermedium', 'Fatura vence todo dia 10', 10, true, 'calculado'),
  ('cartao-meliuz',      'Cartão Méliuz',      'Cartão', 'Méliuz',      'Fatura vence todo dia 10', 10, true, 'calculado')
on conflict (id) do update
   set nome = excluded.nome,
       tipo = excluded.tipo,
       banco = excluded.banco,
       uso = excluded.uso,
       dia_vencimento = excluded.dia_vencimento,
       ativa = excluded.ativa;

-- A conta genérica continua ativa, e não é esquecimento: ela ainda tem
-- lançamentos apontando para si. Some quando eles forem movidos ou excluídos —
-- desativá-la agora esconderia dívida que existe.
comment on table contas_bancarias is
  'Contas, carteiras e cartões. Cartão tem saldo NEGATIVO por natureza (é dívida) e `dia_vencimento` preenchido; o pagamento da fatura entra como transferência da conta que paga para a conta do cartão.';
