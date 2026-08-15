-- O extrato só admitia quatro origens: Mercado Pago, Sicoob, OFX e manual.
-- O gateway anterior não estava na lista porque quando a tabela nasceu ele já
-- tinha sido desligado — e a importação do histórico bateu nessa parede
-- depois de a leitura já estar correta.
alter table extrato_linhas drop constraint extrato_linhas_origem_check;
alter table extrato_linhas add constraint extrato_linhas_origem_check
  check (origem in ('mercadopago', 'pagarme', 'sicoob', 'ofx', 'manual'));
