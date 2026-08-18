-- Presets do gerador de imagens de produto.
--
-- O gerador veio do projeto `gerador-frenesi` para dentro do ERP, e os presets
-- vieram do localStorage para o banco. No navegador eles morriam na troca de
-- máquina ou numa limpeza de cache — e preset de composição é exatamente o
-- tipo de ajuste fino que ninguém quer refazer de memória.
create table if not exists public.gerador_presets (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  -- O estado completo dos controles da cena, como o motor consome.
  valores jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now()
);

alter table public.gerador_presets enable row level security;
revoke all on public.gerador_presets from anon, authenticated;

comment on table public.gerador_presets is
  'Presets do gerador de imagens de produto. Moravam no localStorage do navegador e morriam na troca de máquina; aqui sobrevivem e têm autor.';
