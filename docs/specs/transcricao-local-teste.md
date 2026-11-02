# Teste: Whisper local x Gemini na transcrição

## Objetivo
Ver se transcrever as fatias de 10 s com Whisper local (Docker) reduz custo sem perder qualidade nem latência, comparado ao Gemini usado hoje.

## Como foi feito
- Imagem `fedirz/faster-whisper-server:latest-cpu`, modelo `Systran/faster-whisper-small`, CPU, porta 8010.
- 3 frases em português (voz sintética Microsoft Maria, 16 kHz, ~9 s cada) com termos técnicos.
- Mesma entrada nos dois; Gemini via `transcribeAudio` do projeto.

## Resultado
| Frase | Whisper small (CPU) | Gemini |
|---|---|---|
| 1 contrato/multa | ~3,5 s, igual ao Gemini | ~2,1 s |
| 2 Postgres/API | ~3,6 s, errou "API" (AP) | ~2,6 s, correto |
| 3 latência/throughput | ~3,3 s, errou "throughput" (Fruput) | ~2,5 s, correto |

- A 1ª chamada do Whisper levou ~58 s (carga do modelo): subir o container antes da reunião.
- Whisper roda mais rápido que o tempo real (~0,4x), então acompanha a reunião, mas fica ~1 s mais lento que o Gemini.
- Os dois escrevem "30 dias" e "2%" (o WER de 17% na frase 1 é só dígito x extenso, igual nos dois).

## Limites do teste
Voz sintética e limpa, só 3 amostras, um modelo (small), sem ruído, sotaque nem fala sobreposta. Não representa uma reunião real.

## Conclusão
Não trocar o padrão. Whisper local só vence em privacidade, uso offline e ausência de limite de cota (hoje há tratamento de 429); perde em latência e em termos técnicos em inglês. O custo do Gemini por fatia (~320 tokens de áudio) é pequeno em valor absoluto. Reabrir se: a cota gratuita virar problema, ou for preciso rodar offline. Nesse caso, testar modelo `medium` e áudio real com ruído, e adicionar `STT_PROVIDER` no `env.ts` com spec própria.
