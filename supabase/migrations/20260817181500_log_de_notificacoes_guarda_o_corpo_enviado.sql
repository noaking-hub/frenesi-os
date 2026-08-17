-- O log dizia QUE o e-mail saiu. Não dizia o QUE saiu.
--
-- A pergunta que o dono faz quando um cliente reclama é "o que exatamente ele
-- recebeu?", e a única resposta possível era pedir para o próprio cliente
-- encaminhar o e-mail de volta.
--
-- GUARDAR o corpo, e não redesenhar na hora de exibir. A diferença decide o
-- valor da tela inteira: o modelo é editável e muda com frequência — só hoje
-- foram três frases cortadas do aviso de envio e a validade do giftback de 7
-- para 30 dias. Redesenhar mostraria o modelo de HOJE com os dados de ONTEM, o
-- que é exatamente errado no único momento em que alguém abre esta tela: quando
-- precisa saber o que o cliente leu.
--
-- Só linha ENVIADA ganha corpo. Dispensada não tem corpo porque não houve
-- e-mail — e são 800 e poucas, contra algumas centenas de enviadas por mês.
alter table public.notificacoes_enviadas
  add column if not exists corpo_html text;

comment on column public.notificacoes_enviadas.corpo_html is
  'O HTML exato que foi entregue ao cliente. Guardado, e não redesenhado na exibição: o modelo é editável, e redesenhar mostraria o texto de hoje com os dados de ontem.';

-- Retenção: um ano. Passado isso o corpo vira peso sem uso — a linha do log
-- continua, com destinatário, assunto, estado e motivo, que é o que responde
-- "foi avisado?". O que se perde é só a cópia visual, e ninguém contesta um
-- e-mail de treze meses atrás.
create or replace function public.limpar_corpos_antigos_de_notificacao()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_linhas int;
begin
  update notificacoes_enviadas
     set corpo_html = null
   where corpo_html is not null
     and concluido_em < now() - interval '1 year';
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.limpar_corpos_antigos_de_notificacao() from anon, authenticated, public;
