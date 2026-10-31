import { generateAnswer } from './ai.ts'
import { createAssistEngine } from './assist-engine.ts'
import type { UtteranceKind } from './assist-policy.ts'
import { generateEmbeddings } from './gemini.ts'
import { publishLive } from './live-events.ts'
import { searchContext } from './search.ts'

const INSTRUCTIONS: Record<UtteranceKind, string> = {
  question:
    'Alguém na reunião acabou de fazer esta pergunta. Responda em até 2 frases curtas, direto ao ponto, usando só o contexto disponível. Se não houver base, diga que não encontrou.',
  statement:
    'Alguém na reunião acabou de dizer isto. Dê uma observação útil em até 2 frases curtas (um termo a esclarecer, um ponto a conferir ou um dado relacionado do contexto). Se não houver nada útil, responda apenas: sem observação.',
}

export function buildAssistPrompt(kind: UtteranceKind, text: string) {
  return `${INSTRUCTIONS[kind]}\n\nFala: "${text}"`
}

async function generateAssistCard(
  roomId: string,
  text: string,
  kind: UtteranceKind,
  chunkEmbeddings?: number[]
) {
  // A fatia já foi vetorizada no upload; reaproveitar evita uma chamada de embedding por cartão.
  const embeddings =
    chunkEmbeddings ?? (await generateEmbeddings(text, 'RETRIEVAL_QUERY'))
  const { meeting, knowledge } = await searchContext(roomId, text, embeddings)

  return generateAnswer(buildAssistPrompt(kind, text), meeting, knowledge)
}

export const assist = createAssistEngine({
  generate: generateAssistCard,
  publish: publishLive,
  now: Date.now,
})
