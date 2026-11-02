# Rota Health com Teste Isolado

## Objetivo
Extrair a rota `/health` do arquivo principal do servidor para um arquivo de rota dedicado e criar um teste automatizado que valide o retorno da rota sem subir o servidor completo ou depender de variáveis de ambiente.

## Requisitos (numerados, testáveis)
1. Criar um arquivo de rota dedicado para o endpoint `/health`.
2. Mover a definição da rota `/health` de `src/server.ts` para o novo arquivo.
3. Criar um teste unitário/integração para a rota `/health` que valide o retorno `OK` com status 200.
4. Garantir que o teste não dependa de variáveis de ambiente (como `DATABASE_URL` ou `GEMINI_API_KEY`).

## Critérios de aceite (Dado/Quando/Então)
- **Dado** que a rota `/health` foi movida para um arquivo separado.
- **Quando** o servidor for iniciado, a rota `/health` deve continuar acessível e retornar `'OK'`.
- **Dado** que o teste de rota é executado.
- **Quando** o teste solicitar o endpoint `/health`.
- **Então** o teste deve passar verificando o status 200 e o corpo da resposta `'OK'`.

## Fora de escopo
- Adicionar outras rotas de saúde (ex: `/ready`, `/status`).
- Configurar monitoramento externo de saúde.

## Decisões (ADR curto, só se houver trade-off)
- **Extração para arquivo separado**: Decidido mover para `src/http/routes/health.ts` para seguir o padrão de organização do projeto e permitir o teste isolado sem carregar o `app` completo do `server.ts`, que possui dependências de ambiente.

## Premissas assumidas
- O teste utilizará uma instância isolada do Fastify para validar apenas o plugin da rota.
- O `fastify-type-provider-zod` deve ser configurado no teste para manter a consistência com o resto do projeto.

## Plano (tarefas de 1 commit cada, em ordem, com o teste que prova cada uma)
1. Criar `src/http/routes/health.ts` com a definição da rota.
2. Remover a definição direta de `/health` de `src/server.ts` e registrar o novo plugin.
3. Criar `src/http/routes/health.test.ts` e validar o retorno da rota.
