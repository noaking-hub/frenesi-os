-- Confiança do mapeamento (escopo 10.3): cada preço casado guarda COMO foi
-- casado. Apelido ensinado à mão é vínculo de gente; título parecido é
-- palpite de máquina — e a tela precisa distinguir os dois antes de alguém
-- decidir preço em cima.
alter table concorrente_precos add column casado_por text
  check (casado_por in ('apelido', 'titulo'));

comment on column concorrente_precos.casado_por is
  'Origem do vínculo com a base: apelido (ensinado à mão) ou titulo (casamento automático). Nulo = sem dono';

-- Retroativo: o que já está casado hoje veio do casamento automático ou de
-- apelido ensinado — se o título normalizado está na tabela de apelidos, foi
-- gente que ensinou.
update concorrente_precos p
   set casado_por = case
     when exists (
       select 1 from concorrente_apelidos a
        where a.base_id = p.base_id
          and a.titulo_normalizado = lower(regexp_replace(translate(p.titulo, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g'))
     ) then 'apelido'
     else 'titulo'
   end
 where p.base_id is not null;
