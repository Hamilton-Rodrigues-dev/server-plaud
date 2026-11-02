# Descoberta: Rota GET /health com teste

## Contexto
A rota `/health` está definida diretamente no `src/server.ts` como um endpoint simples que retorna `'OK'`.

## Stack e Tecnologias
- **Runtime**: Node.js 22 com `--experimental-strip-types`.
- **Framework**: Fastify 5.x com `fastify-type-provider-zod`.
- **Testes**: `node --test` nativo.
- **Configuração**: O servidor usa `src/env.ts` para carregar variáveis de ambiente, mas a rota `/health` não depende de nenhuma variável de ambiente ou banco de dados.

## Arquivos Envolvidos
- `src/server.ts`: Onde a rota está definida atualmente.
- `src/http/routes/`: Local onde as outras rotas residem (padrão do projeto).
- `src/services/`: Onde a lógica de negócio reside.

## Padrões Identificados
- As rotas do projeto são registradas via `app.register(createRoute)`.
- Cada rota em `src/http/routes/` exporta um `FastifyPluginCallbackZod`.
- O teste deve ser unitário/integração de rota, mas o pedido pede para não subir o servidor nem depender de `.env`.

## Riscos e Desafios
- **Dependência de `.env`**: O `src/server.ts` importa `env` de `src/env.ts`. Se o teste importar o `app` do `server.ts`, ele pode tentar carregar o `.env`.
- **Isolamento**: Para testar sem subir o servidor, precisamos extrair a definição da rota ou criar uma instância do Fastify apenas para o teste.
- **Extração**: A rota `/health` está "hardcoded" no `server.ts`. O ideal seria movê-la para um arquivo de rota separado (ex: `src/http/routes/health.ts`) para seguir o padrão do projeto e facilitar o teste isolado.

## Plano de Ação Proposto
1. Criar `src/http/routes/health.ts` para isolar a rota.
2. Mover a definição de `/health` do `src/server.ts` para este novo arquivo.
3. Criar `src/http/routes/health.test.ts` para testar a rota usando uma instância isolada do Fastify.
4. Garantir que o teste não dependa de `DATABASE_URL` ou `GEMINI_API_KEY`.
