-- ═══════════════════════════════════════════════════════════════════════════
-- Fotos reais na devolução.
--
-- Até aqui o portal só CONFIRMAVA que a foto existia (booleano) — o arquivo
-- ficava no celular do cliente e a triagem dependia de pedir por WhatsApp.
-- Agora o portal recebe o upload: os arquivos vivem num bucket PRIVADO
-- (quem exibe é o ERP, por URL assinada de vida curta) e o caminho fica na
-- solicitação. Os booleanos `fotos` continuam: são derivados dos arquivos e
-- todo o fluxo antigo já lê deles.
-- ═══════════════════════════════════════════════════════════════════════════

alter table solicitacoes_devolucao add column if not exists foto_nivel text;
alter table solicitacoes_devolucao add column if not exists foto_lacre text;

comment on column solicitacoes_devolucao.foto_nivel is
  'Caminho no bucket devolucoes da foto do nível do líquido. Null = cliente não enviou.';
comment on column solicitacoes_devolucao.foto_lacre is
  'Caminho no bucket devolucoes da foto do lacre (ou do dano, em defeito).';

-- Bucket privado: o service role escreve e assina; anônimo não lê nada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'devolucoes', 'devolucoes', false,
  8388608, -- 8 MB por arquivo: foto de celular comprimida cabe com folga
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;
