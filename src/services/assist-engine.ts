import {
  type AssistState,
  type AudioSource,
  shouldAssist,
  type UtteranceKind,
} from './assist-policy.ts'
import type { LiveEvent } from './live-events.ts'

type AssistEngineDeps = {
  generate: (
    roomId: string,
    text: string,
    kind: UtteranceKind,
    embeddings?: number[]
  ) => Promise<string>
  publish: (roomId: string, event: LiveEvent) => void
  now: () => number
}

export function createAssistEngine({ generate, publish, now }: AssistEngineDeps) {
  const rooms = new Map<string, AssistState>()

  function stateOf(roomId: string): AssistState {
    const existing = rooms.get(roomId)
    if (existing) {
      return existing
    }

    const created: AssistState = { enabled: false, lastRunAt: 0, used: 0 }
    rooms.set(roomId, created)
    return created
  }

  function setEnabled(roomId: string, enabled: boolean) {
    rooms.set(roomId, { enabled, lastRunAt: 0, used: 0 })
  }

  async function handleChunk(
    roomId: string,
    chunk: { source: AudioSource; text: string; embeddings?: number[] }
  ) {
    const state = stateOf(roomId)
    const decision = shouldAssist(state, chunk, now())

    if (!decision.run) {
      return
    }

    // Reserva o slot antes de aguardar a IA, para fatias simultâneas não gerarem dois cartões.
    state.lastRunAt = now()
    state.used += 1

    try {
      const text = await generate(
        roomId,
        chunk.text,
        decision.kind,
        chunk.embeddings
      )
      publish(roomId, { type: 'assist', kind: decision.kind, text })
    } catch (err) {
      console.error('Falha ao gerar cartão de suporte:', err)
    }
  }

  return { setEnabled, handleChunk }
}
