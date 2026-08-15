-- Vídeo do vazamento, e o teto de upload que o portal prometia sem cumprir.
--
-- O portal dizia aceitar 8 MB por foto, mas o arquivo subia POR DENTRO da
-- função da Netlify, que recusa requisição acima de ~6 MB. Duas fotos de
-- celular novo já estouravam isso, e o cliente recebia erro sem entender.
-- Agora o navegador manda o arquivo direto ao Storage com URL assinada, e a
-- função só vê o nome do arquivo — o teto vira o do bucket, não o da função.
--
-- Isso é o que torna o vídeo possível: 15 segundos de celular pesam 20 a 60
-- MB, ordens de grandeza acima do que passava antes.

alter table solicitacoes_devolucao add column if not exists video text;

comment on column solicitacoes_devolucao.video is
  'Vídeo do vazamento no bucket devolucoes — obrigatório quando o motivo é dano';

-- O bucket passa a aceitar vídeo, e o teto sobe para caber um. O limite por
-- TIPO (foto x vídeo) é conferido no servidor ao confirmar o envio: aqui só
-- existe um número para o bucket inteiro.
update storage.buckets
   set file_size_limit = 62914560,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'video/mp4', 'video/quicktime', 'video/webm',
         'application/pdf'
       ]
 where id = 'devolucoes';

-- Rascunho é o arquivo que já subiu e ainda não tem protocolo: o cliente
-- escolhe as provas, elas vão para o bucket, e só então a solicitação nasce.
-- Quem desiste no meio deixa arquivo sem dono, e ele não pode ficar lá.
create or replace function rascunhos_de_devolucao_vencidos()
returns table (nome text)
language sql
stable
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'devolucoes'
     and o.name like 'rascunhos/%'
     and o.created_at < now() - interval '24 hours'
   limit 200
$$;

comment on function rascunhos_de_devolucao_vencidos is
  'Provas que subiram e nunca viraram solicitação — a rota de limpeza as remove pela API';
