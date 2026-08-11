-- O serviço de frete que a Yampi devolve (SEDEX, Jadlog, J&T…). É ele que
-- diz em qual plataforma o envio foi emitido: Correios e Jadlog saem pela
-- Frenet; J&T, Total Express e Buslog pelo Melhor Envio.
alter table pedidos add column servico_frete text;
