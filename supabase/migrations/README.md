# Migrations

## A verdade mora no banco

`supabase_migrations.schema_migrations` é o registro do que foi realmente
aplicado. Os arquivos deste diretório são o espelho **legível** desse registro:
é aqui que o motivo de cada mudança fica escrito, e é aqui que se descobre por
que uma coluna existe sem precisar reconstruir a conversa que a criou.

## Duas numerações, e por quê

Os arquivos antigos usam uma numeração própria e sequencial
(`20260808000001_init`); o banco registrou a mesma migration com o carimbo de
quando ela rodou (`20260808152040_init`). Os arquivos novos usam a versão do
banco.

Isso é dívida histórica, não desenho. A consequência prática: **`supabase db
push` e `supabase migration up` não funcionam neste repositório** — eles
comparariam versões que nunca vão bater e tentariam reaplicar o schema inteiro
por cima de um banco que já o tem. Migration nova vai para o banco por
`apply_migration`, e o arquivo correspondente entra aqui com a MESMA versão que
o banco registrou.

Renumerar os noventa arquivos antigos resolveria a estética e arriscaria o
histórico. Não vale a troca; o que vale é a conferência abaixo.

## Como conferir se banco e repositório divergiram

O teste que importa não é comparar nomes de arquivo — é perguntar se existe
**objeto no banco que nenhum arquivo daqui cria**. Foi assim que se descobriu,
em 16/08/2026, que treze migrations (empresa, notificações ao cliente, desconto
de Pix, as seis fases do Gerente, o WhatsApp, a memória e o rate-limit do login)
existiam só no banco: dezenove tabelas, views e funções sem uma linha de origem
versionada.

No banco:

```sql
select string_agg(nome, ' ' order by nome) from (
  select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
  union
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
) t;
```

No repositório, com a lista que a consulta devolveu:

```sh
cat supabase/migrations/*.sql > /tmp/todas.sql
for o in <cole a lista aqui>; do
  grep -q "\b$o\b" /tmp/todas.sql || echo "AUSENTE: $o"
done
```

Saída vazia é o estado correto. Qualquer linha `AUSENTE:` é schema que só
existe em produção — e que some no dia em que o banco precisar ser reconstruído.

## Arquivos sem contrapartida no registro

Três arquivos daqui não aparecem em `schema_migrations`, e cada um por um
motivo diferente:

- `20260814000044_remover_modulo_de_concorrentes.sql` não tem DDL nenhum. É um
  registro escrito de que o módulo saiu do ERP para ser refeito; as tabelas
  seguem no banco de propósito, esperando a reescrita.
- `20260815_venda_de_pedido_cancelado.sql` e
  `20260815_cancelamento_confirmado_pelo_dinheiro.sql` são reparo de dados que
  rodou por consulta direta. O efeito está no banco (`pedido_cancelado_de_verdade`
  existe), o registro ficou só aqui.

## Um objeto que a conferência aponta e deve mesmo apontar

`tmp_casados_antes` (308 linhas: `concorrente_id, titulo, base_id`) aparece
como AUSENTE e vai continuar aparecendo. É a fotografia de como os
concorrentes estavam mapeados ANTES do recasamento em massa — cópia de
segurança feita à mão para poder desfazer, e o módulo de concorrentes saiu do
ERP esperando reescrita (`20260814000044`).

Não vale criar migration para uma tabela temporária, e não vale apagá-la
enquanto a reescrita não acontecer: ela é o único registro do mapeamento
anterior. Quando os concorrentes voltarem, ou ela vira dado de verdade ou é
descartada com o resto — aí a conferência fica limpa de novo.

Conferido em 17/08/2026: fora esta, **nenhum** objeto do banco está sem
origem versionada.
