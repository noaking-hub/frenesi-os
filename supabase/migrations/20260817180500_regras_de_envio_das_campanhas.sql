-- As três campanhas de relacionamento — carrinho, aniversário e cashback — são
-- as únicas cujo disparo ainda depende de alguém abrir a tela e clicar. Os
-- avisos de pedido já rodam sozinhos; estas não, e por isso só acontecem
-- quando alguém lembra.
--
-- A regra vai para o BANCO, e não para constante no código, porque quem decide
-- "quantas horas depois do abandono" é o dono da operação, e essa decisão muda
-- com a estação, com a margem e com o que a concorrência está fazendo. Número
-- de negócio dentro de constante vira pedido de deploy toda vez que muda — e
-- o que não se ajusta sozinho acaba não sendo ajustado.
create table if not exists public.regras_de_envio (
  campanha text primary key,
  nome text not null,
  ligada boolean not null default false,
  -- Cada campanha usa um subconjunto: carrinho usa os toques, aniversário usa
  -- dias_antes = 0 e a validade, cashback usa só os dias_antes. Guardar num
  -- jsonb evita uma coluna por campanha que nasceria nula nas outras duas.
  parametros jsonb not null default '{}'::jsonb,
  -- A Yampi também dispara alguns destes. Enquanto este campo for verdadeiro, a
  -- tela avisa que ligar aqui duplica o e-mail do cliente — e a trava de
  -- `ligada` continua sendo do dono, não do ERP: avisar é o certo, decidir por
  -- ele não é.
  yampi_tambem_envia boolean not null default false,
  observacao text,
  atualizada_em timestamptz not null default now(),
  atualizada_por text
);

alter table public.regras_de_envio enable row level security;
revoke all on public.regras_de_envio from anon, authenticated;

comment on table public.regras_de_envio is
  'Quando cada campanha de relacionamento dispara. Editável em Configurações → Notificações: o número é decisão de negócio, e constante no código vira pedido de deploy toda vez que muda.';

insert into public.regras_de_envio (campanha, nome, ligada, yampi_tambem_envia, parametros, observacao)
values
  ('carrinho', 'Recuperação de carrinho', false, true,
   -- Três toques. O primeiro pega quem se distraiu, o segundo quem adiou, e só
   -- o terceiro gasta desconto: quem voltaria sem cupom não recebe desconto à
   -- toa.
   '{"toques": [{"horas": 4, "cupom": false},
                {"horas": 24, "cupom": false},
                {"horas": 72, "cupom": true}],
     "cupom_pct": 10, "cupom_validade_dias": 7, "janela_max_dias": 7}'::jsonb,
   'A Yampi também recupera carrinho. Desligue lá ANTES de ligar aqui, senão o cliente recebe dois e-mails do mesmo carrinho.'),

  ('aniversario', 'Aniversário (Giftback)', false, false,
   -- No dia, válido por 30 dias: tempo de sobra para decidir sem a pressa que
   -- faz o cupom ser ignorado.
   '{"dias_antes": 0, "cupom_pct": 15, "cupom_validade_dias": 30}'::jsonb,
   'A Yampi não avisa aniversário hoje. Esta é a única das três que pode ser ligada sem desligar nada antes.'),

  ('cashback', 'Cashback vencendo', false, true,
   -- Dois toques: 15 dias dá tempo de planejar a compra, 3 dias é o lembrete
   -- de última hora.
   '{"dias_antes": [15, 3]}'::jsonb,
   'A Yampi também avisa vencimento de cashback. Desligue lá ANTES de ligar aqui.')
on conflict (campanha) do nothing;
