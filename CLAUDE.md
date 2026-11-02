# server-plaud

API Fastify do Plaud: salas de reunião, transcrição de áudio, perguntas com RAG (busca híbrida vetor + texto), insights automáticos e base de conhecimento (PDF/texto/código local). Consumida por `../front-plaud`. Repositório git próprio.

## Stack (package.json)
Node 22 com TypeScript nativo (`--experimental-strip-types`, sem build) · Fastify ^5.12 + fastify-type-provider-zod 5.0.1 · zod 3.25 (rotas importam `zod/v4`) · Drizzle ORM ^0.45 + drizzle-kit ^0.31 · Postgres 17 + pgvector (Docker) · `@google/genai` 1.8 (transcrição e embeddings) · `@anthropic-ai/sdk` ^1.3 (respostas/insights, opcional) · Biome 2.0.5 + ultracite.

## Comandos (verificados)
- `docker-compose up -d`: sobe `pgvector/pgvector:pg17` em :5432 (user/senha `docker`, db `agents`; `docker/setup.sql` cria a extensão `vector`). Docker está instalado; o container não foi subido nesta análise.
- `npm run db:migrate`: aplica migrations (`README` usa `npx drizzle-kit migrate`). Nota: `drizzle.config.ts` lê o `.env` via `src/env.ts`.
- `npm run db:generate`: gera migration a partir de `src/db/schema/`.
- `npm run db:seed`: dados de exemplo.
- `npm run dev`: `tsx watch` com `.env`. `npm start`: Node direto, sem watch. `GET /health` → `OK`, porta padrão 3333.
- `npx tsc --noEmit`: passa (sem script `typecheck`).
- `npm test`: `node --test` nativo (17 testes em `src/services/*.test.ts`, sem instalar nada). `client.http` e `ROTEIRO-DE-TESTE.md` seguem como teste manual de ponta a ponta.
- Lint/format: ver armadilhas (Biome quebrado hoje).

## Variáveis de ambiente (`.env`, validadas em `src/env.ts`; nunca comitar)
`DATABASE_URL` e `GEMINI_API_KEY` obrigatórias; `PORT` (3333); `AI_PROVIDER` = `gemini` (padrão) | `claude`; `ANTHROPIC_API_KEY` obrigatória se `claude`; `ANTHROPIC_MODEL`. Só precisa de env nova → adicionar no schema zod de `env.ts`.

## Estrutura (`src/`)
- `server.ts`: monta o app e registra as rotas. `env.ts`: config.
- `http/routes/`: uma rota por arquivo, `FastifyPluginCallbackZod` exportado (`createRoomRoute`), schema zod em `schema: { body, params }`, registrada em `server.ts`.
- `db/schema/`: uma tabela por arquivo, reexportada em `schema/index.ts`; `db/migrations/` gerado pelo drizzle-kit; `db/connection.ts` exporta `db`.
- `services/`: regra de negócio. `ai.ts` escolhe provedor (gemini × claude); `search.ts` (RRF vetor+texto), `ingest.ts`/`chunker.ts` (base de conhecimento), `insights.ts`, `talk.ts`, `prompts.ts`, `code-*.ts` (indexa/consulta pasta de código local).

## Suporte ao vivo (spec em `docs/specs/suporte-ao-vivo.md`)
`GET /rooms/:id/live` (SSE) e `POST /rooms/:id/assist`. Lógica pura em `assist-policy.ts`, motor com dependências injetadas em `assist-engine.ts`, ligação com a IA em `assist.ts`. Estado do modo fica em memória. Modo "ambos" grava mic e sistema em canais separados (`source=mic`/`system`); só `mic` é ignorado pelo suporte. Sem fone, o mic capta o alto-falante e a fala dos outros é transcrita duas vezes (custo dobrado).

## Validação ponta a ponta
Mudou rota ou evento que a tela consome: além de `npm test`, validar com Playwright pelo front (ver `../front-plaud/CLAUDE.md`). Rota nova com SSE: testar também com `curl -N` em outra porta (`PORT=3401`), sem derrubar a instância da 3333.

## Convenções
- Imports relativos **com extensão `.ts`** (exigido por strip-types e `allowImportingTsExtensions`).
- Sem enum/namespace/parameter properties (strip-types não suporta); usar `import type` para tipos.
- Sem ponto e vírgula, aspas simples. Colunas em snake_case (`casing: 'snake_case'` no Drizzle). Respostas de erro/mensagens de usuário em PT-BR.
- Acesso ao banco só via `db` + `schema` (Drizzle), nunca SQL concatenado.

## Armadilhas
- `npx biome check` falha: `ultracite` 5.6.4 referencia regra inexistente no Biome 2.0.5. Alinhar versões antes de depender de lint.
- Transcrição e embeddings são sempre Gemini, mesmo com `AI_PROVIDER=claude`; o plano gratuito dá 429 (há retry/batch em `services/gemini.ts`) e `FLASH_MODELS` faz fallback entre modelos.
- Upload multipart limitado a 300 MB (`server.ts`). CORS aberto (`origin: true`).
- Alterou `db/schema/`: rodar `db:generate` e depois `db:migrate`; o repo tem 7 migrations (0000–0006).
- O front tem `http://localhost:3333` fixo; mudar `PORT` quebra o front.
- Com a porta 3333 ocupada, `npm start` falha com EADDRINUSE (havia uma instância já respondendo no `/health` na análise).
