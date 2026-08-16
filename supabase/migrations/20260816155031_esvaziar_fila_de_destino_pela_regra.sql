-- A fila de 64 itens é esvaziada pela mesma regra que agora vale para os novos.
--
-- Duas linhas ficam de fora, e as duas por motivo declarado:
--
-- R$ 1.205,49 de 16/08 é Meta ADS — o dono da operação disse qual era, e
-- registrar como transferência o que ele já identificou como despesa seria
-- ignorar a informação mais confiável que existe sobre essa linha.
--
-- R$ 1.200,00 de 11/08 continua na fila de propósito. Existe um lançamento
-- manual de Meta ADS com exatamente R$ 1.200,00, e as duas coisas podem ser o
-- mesmo dinheiro contado duas vezes. Resolver por conta própria seria escolher
-- entre duas hipóteses sem ter como distinguir — a fila existe justamente para
-- esse caso.
do $$
declare
  r record;
  v_meta text := 'ext-2026-08-16:173187955221:payout:-120549:1';
  v_duvida text := 'ext-2026-08-11:172403512649:payout:-120000:1';
begin
  for r in
    select id from lancamentos
     where aguarda_destino and id not in (v_meta, v_duvida)
  loop
    perform resolver_destino_do_payout(r.id, 'inter', null, 'regra: saque vai para o Inter');
  end loop;

  perform resolver_destino_do_payout(
    v_meta, null, 'meta-ads-trafego-pago', 'informado pelo dono da operação');
end $$;
