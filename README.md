# Casa Vinte – Sistema do restaurante

Sistema de PDV, comandas, cozinha (KDS), caixa, fiado e financeiro simples da Casa Vinte Grill (Caxias-MA). Ele substitui o MultSystem Web e mantém só o que é usado no dia a dia.

**Stack:** Supabase (PostgreSQL, Auth, Realtime) + Next.js 16 (TypeScript, Tailwind 4) na Vercel.
**Visual:** tema "Terracota & Mostarda", baseado nas telas de referência do Stitch.

## Roteiro

1. **Banco de dados**: feito (`supabase/`)
2. **Front-end + back-end**: feito (`src/`). O back-end são as funções e regras do próprio banco, que o front chama com `supabase.rpc(...)`
3. Nota fiscal (NFC-e) integrada com um serviço emissor
4. Cardápio digital por QR Code / pedidos pelo WhatsApp

## Telas

| Tela | Quem usa | O que faz |
| --- | --- | --- |
| Comandas (`/mesas`) | garçom, caixa, gerente, dono | Mapa de mesas ao vivo, pedidos de balcão, delivery, iFood e 99Food |
| Comanda (`/comanda/[id]`) | garçom, caixa, gerente, dono | Lançar itens (adicionais, observação, peso), cancelar, desconto, serviço de 10%, trocar mesa, imprimir conta em 58 mm, receber (conta dividida, troco, fiado) |
| Painel KDS (`/cozinha`) | cozinha e todos | Fila → preparando → pronto, com tempo de espera e aviso sonoro |
| PDV - Caixa (`/caixa`) | caixa, gerente, dono | Abrir, sangria, suprimento e fechar, com cálculo da diferença |
| Painel do dia (`/painel`) | gerente, dono | Vendas de hoje, ticket médio, comandas abertas, gráfico de 30 dias, contas da semana |
| Cardápio (`/cardapio`) | gerente, dono | Itens, categorias, adicionais, foto, custo e margem, pausar quando esgotar |
| Clientes & Fiado (`/fiado`) | caixa, gerente, dono | Cadastro, saldo, limite, receber e extrato |
| Contas a pagar (`/contas`) | gerente, dono | Vencidas, que vencem hoje e na semana; contas fixas mensais; pagar |
| Relatórios (`/relatorios`) | gerente, dono | Por período: faturamento, formas de pagamento, categorias, canais, ranking de produtos e exportação para planilha |
| Configurações (`/configuracoes`) | dono | Liberar a equipe e escolher papéis, dados do restaurante, taxas, mesas, formas de pagamento |

Funciona no computador do caixa, no tablet e no celular do garçom. Pode ser instalado como aplicativo pelo navegador.

## Como rodar

1. Crie um projeto no [Supabase](https://supabase.com) e aplique o banco:
   ```bash
   npm i -g supabase
   supabase link --project-ref <id-do-projeto>
   supabase db push
   psql "<connection string>" -f supabase/seed.sql
   ```
2. Copie `.env.example` para `.env.local` e preencha a URL e a chave publishable (Supabase → Project Settings → API).
3. Rode:
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
4. Crie a primeira conta na tela de login. Ela vira **dono** automaticamente. Os funcionários criam a própria conta, e o dono libera cada um em Configurações → Equipe.

> Em Supabase → Authentication → Providers → Email, desligue "Confirm email" se não quiser que os funcionários precisem confirmar o e-mail.

### Publicar na Vercel

Importe o repositório na Vercel e cadastre as duas variáveis do `.env.example`. Não precisa de mais nada.

## Estrutura

```
src/
  app/login/            tela de entrada e cadastro
  app/(app)/            telas internas (cada pasta é uma rota)
  components/ui.tsx     botões, campos, cartões, KPIs, modais, avisos
  components/shell.tsx  barra superior, menu lateral e menu do celular, controle de acesso por papel
  components/comanda/   cardápio do PDV e tela de pagamento
  components/graficos.tsx
  lib/                  cliente Supabase, sessão, hooks de dados/tempo real, formatação
  proxy.ts              renova a sessão e manda quem não está logado para /login
supabase/
  migrations/           estrutura, regras de negócio, segurança (RLS), views
  seed.sql              categorias atuais, formas de pagamento, mesas 1–15
  tests/                cenários de um dia de operação
docs/banco-de-dados.md  diagrama, tabelas, funções e permissões
```

## Verificações

```bash
npm run lint
npm run typecheck
npm run build
npm run test:db     # precisa do PostgreSQL 15+ instalado localmente
```
