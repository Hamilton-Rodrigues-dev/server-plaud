import { env } from '../env.ts'
import { extractInsightsWithClaude, generateAnswerWithClaude } from './claude.ts'
import type { CodeRoot } from './code-tools.ts'
import {
  extractInsightsWithGemini,
  generateAnswerWithGemini,
} from './gemini-ai.ts'
import type { ExtractedInsight, InsightsInput } from './prompts.ts'
import type { ContextBlock } from './search.ts'

// Escolhe o provedor de texto (resposta e insights) pela variável AI_PROVIDER.
// Transcrição e embeddings continuam sempre no Gemini.
export function generateAnswer(
  question: string,
  meeting: ContextBlock[],
  knowledge: ContextBlock[],
  codeRoots: CodeRoot[] = []
): Promise<string> {
  return env.AI_PROVIDER === 'claude'
    ? generateAnswerWithClaude(question, meeting, knowledge, codeRoots)
    : generateAnswerWithGemini(question, meeting, knowledge, codeRoots)
}

export function extractInsights(
  input: InsightsInput
): Promise<ExtractedInsight[]> {
  return env.AI_PROVIDER === 'claude'
    ? extractInsightsWithClaude(input)
    : extractInsightsWithGemini(input)
}
