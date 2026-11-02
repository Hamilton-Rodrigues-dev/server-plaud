# Suporte ao vivo

## Objetivo
Durante uma reunião, o usuário liga um "modo suporte": quando entra fala nova, a IA mostra um cartão curto (resposta, se foi pergunta; observação, se foi afirmação). Desligado, nada gasta token. A gravação e a consulta posterior continuam como hoje (fatias de 10 s, vetor no banco, busca híbrida).

## Como chegamos aqui
- Objetivo do Hamilton: ouvir áudio externo e do sistema, responder em tempo real, gastar poucos tokens, gravar e consultar depois, perguntar sobre gravações.
- Já existia: fatias de 10 s (gravador reinicia a cada ciclo, cada arquivo é completo), transcrição + embedding por fatia, busca RAG, insights automáticos.
- Faltava: avisar o front quando entra fala nova (SSE), marcar a origem da fatia e o modo suporte.
- Decisão: pipeline em fatias (opção B) + camada de suporte sob botão. Sem API de voz em streaming (cara em tokens, sem consulta posterior).

## Requisitos
1. Cada fatia guarda `source` (`mic` | `system` | `mixed`), padrão `mixed`.
2. `GET /rooms/:roomId/live` abre SSE e emite `chunk` a cada fatia com fala e `assist` a cada cartão.
3. `POST /rooms/:roomId/assist {enabled}` liga/desliga o modo por sala (memória do servidor) e zera o contador.
4. Com o modo ligado, uma fatia só dispara a IA se: texto ≥ 15 caracteres, não é `mic` (fala do próprio usuário), passou ≥ 20 s desde o último cartão e o teto de 30 cartões por sessão não foi atingido.
5. Texto é classificado `question` ou `statement` por heurística local (sem IA); a IA recebe a instrução correspondente e responde em até 2 frases.
6. Falha da IA não derruba o upload: é registrada e nenhum cartão sai.
7. Front: botão liga/desliga e lista dos últimos cartões, atualizada via SSE.

## Critérios de aceite
- Dado modo desligado, quando entra fatia, então a IA não é chamada.
- Dado modo ligado e fatia `mic`, então a IA não é chamada.
- Dado modo ligado e duas fatias em 5 s, então só a primeira gera cartão.
- Dado "Qual é o prazo do contrato?", então o tipo é `question`.
- Dado a IA lançando erro, então o upload responde 201 e nenhum evento `assist` sai.

## Fora de escopo
- (Fase 2, feita) Mic e sistema em canais separados no modo "ambos"; o front envia `source=mic` e `source=system`.
- Identificar o falante presencial (diarização).
- Persistir cartões e o estado do modo (somente memória).

## Decisões
- Estado do modo em memória: simples, perde no restart; aceitável para uso pessoal.
- Motor com dependências injetadas (`generate`, `publish`, `now`): só para testar sem IA e sem relógio.

## Plano
1. `assist-policy.ts` (classificar + decidir) — testes unitários.
2. `live-events.ts` (pub/sub por sala) — testes.
3. `assist-engine.ts` (estado + política + geração) — testes com falsos.
4. Coluna `source` + migration.
5. Rotas `live`, `assist` e ajuste do upload.
6. Front: reducer de cartões (vitest), hook SSE, painel, `source` no gravador.
7. Verificar: testes, tsc, build, subir servidor e testar SSE com curl.
