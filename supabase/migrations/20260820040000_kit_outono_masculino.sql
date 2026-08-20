-- Composição do Kit Outono Masculino, informada pelo dono (20/08):
-- YSL Y Masculino EDP + Boss Bottled Beyond + Born in Roma Uomo EDT.
-- (O Kit Nicho Essencial Feminino foi desconsiderado por decisão dele.)
insert into kit_componentes (kit_base_id, componente_base_id) values
  ('kit-outono-masculino-decants', 'y-yves-saint-laurent-masculino-eau-de-parfum-decant'),
  ('kit-outono-masculino-decants', 'boss-bottled-beyond-masculino-eau-de-parfum-decant'),
  ('kit-outono-masculino-decants', 'born-in-roma-uomo-masculino-eau-de-toilette-decant')
on conflict do nothing;
