# Casa Vinte – Sistema do restaurante

Sistema de PDV, comandas, cozinha (KDS), caixa, fiado e financeiro simples da Casa Vinte Grill (Caxias-MA). Ele substitui o MultSystem Web, mantendo só o que é usado no dia a dia.

**Stack:** Supabase (PostgreSQL, Auth, Realtime) + Next.js (TypeScript) na Vercel.

## Roteiro

1. **Banco de dados**: feito, nesta pasta `supabase/`
2. Back-end: rotas/server actions em Next.js chamando as funções do banco
3. Front: PDV/caixa, comandas do garçom (celular), painel da cozinha, painel do dono
4. Nota fiscal (NFC-e) integrada com um serviço emissor

## Estrutura

```
supabase/
  migrations/   # 4 migrations: estrutura, regras de negócio, segurança, views
  seed.sql      # categorias do PDV atual, formas de pagamento, mesas 1–15
  tests/        # cenários de teste do dia a dia
docs/
  banco-de-dados.md   # diagrama, tabelas, funções e permissões
```

## Rodar os testes do banco (local)

Precisa do PostgreSQL 15 ou mais recente instalado:

```bash
./supabase/tests/rodar_testes.sh
```

Ele sobe um Postgres temporário, aplica tudo e simula um dia de operação: abrir caixa, abrir comanda de mesa, lançar itens (com adicional e por kg), usar a cozinha, cancelar item, dar desconto, dividir o pagamento, usar fiado com limite, fazer sangria, fechar o caixa e conferir os relatórios.

## Subir no Supabase

```bash
npm i -g supabase
supabase link --project-ref <id-do-projeto>
supabase db push            # aplica as migrations
psql "<connection string>" -f supabase/seed.sql
```

Depois cadastre o primeiro usuário (o dono) em Authentication. Ele vira dono automaticamente. Os demais usuários entram inativos e o dono libera cada um.
