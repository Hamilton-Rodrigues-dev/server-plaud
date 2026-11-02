import type { Content, GenerateContentParameters } from '@google/genai'
import { CODE_TOOLS, type CodeRoot, runCodeTool } from './code-tools.ts'
import { gemini } from './gemini.ts'
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

// Rápido primeiro (reunião ao vivo): se um modelo estiver sobrecarregado ou sem cota, tenta o próximo.
const AI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
]

async function generateWithFallback(
  params: Omit<GenerateContentParameters, 'model'>
) {
  let lastError: unknown = null

  for (const model of AI_MODELS) {
    try {
      return await gemini.models.generateContent({ model, ...params })
    } catch (err: unknown) {
      console.warn(`Aviso: Falha no modelo ${model}. Tentando o próximo...`)
      lastError = err
    }
  }

  throw lastError ?? new Error('Todos os modelos de IA falharam')
}

// Junta só as partes de texto da resposta (ignora as partes de raciocínio do modelo).
function readText(content: Content | undefined) {
  return (content?.parts ?? [])
    .filter((part) => typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('\n')
    .trim()
}

const GEMINI_CODE_TOOLS = [
  {
    functionDeclarations: CODE_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.input_schema,
    })),
  },
]

export async function generateAnswerWithGemini(
  question: string,
  meeting: ContextBlock[],
  knowledge: ContextBlock[],
  codeRoots: CodeRoot[]
) {
  const contents: Content[] = [
    {
      role: 'user',
      parts: [
        {
          text: buildAnswerContent(
            question,
            meeting,
            knowledge,
            codeRoots.map((r) => r.name)
          ),
        },
      ],
    },
  ]

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction: ANSWER_SYSTEM_PROMPT,
        maxOutputTokens: 4096,
        // Na última rodada as ferramentas saem, para forçar uma resposta final.
        ...(codeRoots.length > 0 && round < MAX_TOOL_ROUNDS
          ? { tools: GEMINI_CODE_TOOLS }
          : {}),
      },
    })

    const modelContent = response.candidates?.[0]?.content
    const calls = response.functionCalls ?? []

    if (calls.length === 0) {
      const text = readText(modelContent)

      if (!text) {
        throw new Error('O Gemini não retornou texto.')
      }

      return text
    }

    if (modelContent) {
      // Guarda a vez do modelo inteira (inclui as assinaturas de raciocínio que o Gemini exige de volta).
      contents.push(modelContent)
    }

    const parts: NonNullable<Content['parts']> = []
    for (const call of calls) {
      const output = await runCodeTool(
        codeRoots,
        call.name ?? '',
        (call.args ?? {}) as Record<string, unknown>
      )

      parts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { output },
        },
      })
    }

    contents.push({ role: 'user', parts })
  }

  throw new Error('O Gemini não concluiu a resposta.')
}

export async function extractInsightsWithGemini(
  input: InsightsInput
): Promise<ExtractedInsight[]> {
  const response = await generateWithFallback({
    contents: [{ role: 'user', parts: [{ text: buildInsightsContent(input) }] }],
    config: {
      systemInstruction: INSIGHTS_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseJsonSchema: INSIGHTS_JSON_SCHEMA,
      maxOutputTokens: 4096,
    },
  })

  const text = readText(response.candidates?.[0]?.content)

  try {
    return sanitizeInsights(JSON.parse(text).insights)
  } catch {
    console.warn('O Gemini devolveu insights em formato inválido; ignorando.')
    return []
  }
}
