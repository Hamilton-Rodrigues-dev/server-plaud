export type AudioSource = 'mic' | 'system' | 'mixed'
export type UtteranceKind = 'question' | 'statement'

export type AssistState = {
  enabled: boolean
  lastRunAt: number
  used: number
}

export type AssistDecision =
  | { run: false }
  | { run: true; kind: UtteranceKind }

export const ASSIST_LIMITS = {
  minChars: 15,
  minIntervalMs: 20_000,
  maxPerSession: 30,
}

const QUESTION_STARTERS =
  /^(qual|quais|quem|quando|onde|como|por que|por quê|porque|o que|quanto|quantos|quantas|será|existe|tem|dá|pode|podem|voc[eê])\b/i

export function classifyUtterance(text: string): UtteranceKind {
  const trimmed = text.trim()

  if (trimmed.includes('?') || QUESTION_STARTERS.test(trimmed)) {
    return 'question'
  }

  return 'statement'
}

// A fala do próprio usuário (mic) nunca dispara a IA: o suporte é para o que os outros dizem.
export function shouldAssist(
  state: AssistState,
  chunk: { source: AudioSource; text: string },
  now: number
): AssistDecision {
  if (!state.enabled || chunk.source === 'mic') {
    return { run: false }
  }

  if (chunk.text.trim().length < ASSIST_LIMITS.minChars) {
    return { run: false }
  }

  if (now - state.lastRunAt < ASSIST_LIMITS.minIntervalMs) {
    return { run: false }
  }

  if (state.used >= ASSIST_LIMITS.maxPerSession) {
    return { run: false }
  }

  return { run: true, kind: classifyUtterance(chunk.text) }
}
