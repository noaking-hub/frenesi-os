-- A Yampi deixou de enviar, e o alerta de duplicação ficou mentindo.
--
-- As regras de carrinho e cashback nasceram com `yampi_tambem_envia = true` e
-- um aviso na tela: "desligue lá ANTES de ligar aqui, senão o cliente recebe
-- dois e-mails do mesmo fato". Era verdade quando a regra foi escrita. Deixou
-- de ser: o dono desativou TODOS os e-mails transacionais da Yampi, e disse
-- duas vezes.
--
-- Um alerta que pede uma providência já tomada não é conservador, é ruído: ele
-- ensina o leitor a ignorar os alertas da tela, e o próximo — que for
-- verdadeiro — vai ser ignorado junto.
--
-- O mecanismo fica de pé. Se a Yampi voltar a enviar qualquer uma das duas, é
-- só marcar o campo de novo e o aviso reaparece. O que muda aqui é o FATO, não
-- a regra que o interpreta.
update public.regras_de_envio
set yampi_tambem_envia = false,
    observacao = case campanha
      when 'carrinho'
        then 'A Yampi não envia mais: todos os e-mails transacionais foram desativados lá. Esta é a única fonte de recuperação de carrinho.'
      when 'cashback'
        then 'A Yampi não envia mais: todos os e-mails transacionais foram desativados lá. Esta é a única fonte do aviso de vencimento.'
      -- O aniversário nunca duplicou, mas o texto dele se descrevia como "a
      -- única das três que pode ser ligada sem desligar nada antes" — uma
      -- comparação com um estado do mundo que não existe mais.
      when 'aniversario'
        then 'A Yampi não avisa aniversário. Esta é a única fonte do presente de aniversário.'
      else observacao
    end
where campanha in ('carrinho', 'cashback', 'aniversario');
