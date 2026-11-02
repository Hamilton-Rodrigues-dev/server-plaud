import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env.ts'
import { CODE_TOOLS, type CodeRoot, runCodeTool } from './code-tools.ts'
import {
  ANSWER_SYSTEM_PROMPT,
  buildAnswerContent,
  buildInsightsContent,
  type ExtractedInsight,
  INSIGHTS_JSON_SCHEMA,
  INSIGHTS_SYSTEM_PROMPT,
  type InsightsInput,
  MAX_TOOL_ROUNDS,
  sanitizeInsights,
} from './prompts.ts'
import type { ContextBlock } from './search.ts'

let client: Anthropic | null = null

// Criado só quando o Claude é usado, para a chave ser opcional com AI_PROVIDER=gemini.
function getClient() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada.')
  }

  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  return client
}

export async function generateAnswerWithClaude(
  question: string,
  meeting: ContextBlock[],
  knowledge: ContextBlock[],
  codeRoots: CodeRoot[]
) {
  const claude = getClient()

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildAnswerContent(
        question,
        meeting,
        knowledge,
        codeRoots.map((r) => r.name)
      ),
    },
  ]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await claude.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: ANSWER_SYSTEM_PROMPT,
      messages,
      // Na última rodada as ferramentas saem, para forçar uma resposta final.
      ...(codeRoots.length > 0 && round < MAX_TOOL_ROUNDS
        ? { tools: CODE_TOOLS }
        : {}),
    })

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()

      if (!text) {
        throw new Error('O Claude não retornou texto.')
      }

      return text
    }

    messages.push({ role: 'assistant', content: response.content })

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const toolUse of toolUses) {
      results.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: await runCodeTool(
          codeRoots,
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>
        ),
      })
    }

    messages.push({ role: 'user', content: results })
  }

  throw new Error('O Claude não concluiu a resposta.')
}

// Extrai insights do trecho novo da reunião. Usa saída estruturada via ferramenta.
export async function extractInsightsWithClaude(
  input: InsightsInput
): Promise<ExtractedInsight[]> {
  const response = await getClient().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1500,
    system: INSIGHTS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildInsightsContent(input) }],
    tools: [
      {
        name: 'report_insights',
        description: 'Registra os insights encontrados no trecho novo.',
        input_schema: {
          ...INSIGHTS_JSON_SCHEMA,
          type: 'object' as const,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_insights' },
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  )

  return sanitizeInsights(
    (toolUse?.input as { insights?: unknown } | undefined)?.insights
  )
}
