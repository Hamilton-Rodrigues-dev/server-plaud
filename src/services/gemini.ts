import { GoogleGenAI } from '@google/genai'
import { env } from '../env.ts'

export const gemini = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
})

// Modelos ordenados com fallback automático para garantir alta disponibilidade e evitar limites de cota
const FLASH_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
]

// biome-ignore lint/suspicious/noExplicitAny: Aceita array de conteúdos da API Gemini
export async function generateWithFallback(contents: any[]) {
  let lastError: unknown = null

  for (const model of FLASH_MODELS) {
    try {
      const response = await gemini.models.generateContent({
        model,
        contents,
      })

      if (response.text !== undefined && response.text !== null) {
        return response.text
      }
    } catch (err: unknown) {
      console.warn(
        `Aviso: Falha no modelo ${model}. Alternando para o próximo modelo disponível...`
      )
      lastError = err
    }
  }

  throw lastError ?? new Error('Todos os modelos de IA falharam')
}

export async function transcribeAudio(audioAsBase64: string, mimeType: string) {
  try {
    const text = await generateWithFallback([
      {
        text: 'Transcreva o áudio para português do Brasil. Seja preciso e natural na transcrição. Mantenha a pontuação adequada e divida o texto em parágrafos quando for apropriado. Se não houver fala ou for apenas silêncio/ruído de fundo, retorne vazio.',
      },
      {
        inlineData: {
          mimeType,
          data: audioAsBase64,
        },
      },
    ])

    return text.trim()
  } catch (err) {
    console.error('Erro na transcrição pelo Gemini:', err)
    return ''
  }
}

type EmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

// O plano gratuito limita os tokens de embedding por minuto (HTTP 429, com o tempo de espera na mensagem).
const MAX_RATE_LIMIT_WAIT_MS = 65_000

function readRateLimitWait(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)

  if (!(message.includes('429') || message.includes('RESOURCE_EXHAUSTED'))) {
    return null
  }

  const seconds = /retry in ([\d.]+)s/i.exec(message)?.[1]
  const waitMs = seconds ? Math.ceil(Number(seconds) * 1000) + 1000 : 35_000

  return Math.min(waitMs, MAX_RATE_LIMIT_WAIT_MS)
}

export async function generateEmbeddings(
  text: string,
  taskType: EmbeddingTask = 'RETRIEVAL_DOCUMENT'
) {
  // Uma pergunta ao vivo não pode esperar muito: só 1 nova tentativa.
  const [embedding] = await generateEmbeddingsBatch([text], taskType, 1)

  if (!embedding) {
    throw new Error('Não foi possível gerar os embeddings.')
  }

  return embedding
}

export async function generateEmbeddingsBatch(
  texts: string[],
  taskType: EmbeddingTask = 'RETRIEVAL_DOCUMENT',
  maxRetries = 8
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await gemini.models.embedContent({
        model: 'gemini-embedding-001',
        contents: texts.map((text) => ({ text })),
        config: {
          taskType,
          outputDimensionality: 768,
        },
      })

      const embeddings = response.embeddings?.map((e) => e.values)

      if (
        !embeddings ||
        embeddings.length !== texts.length ||
        embeddings.some((values) => !values)
      ) {
        throw new Error('Não foi possível gerar os embeddings.')
      }

      return embeddings as number[][]
    } catch (err: unknown) {
      const waitMs = readRateLimitWait(err)

      if (waitMs === null || attempt >= maxRetries) {
        throw err
      }

      console.warn(
        `Cota de embeddings do Gemini atingida. Aguardando ${Math.round(waitMs / 1000)}s (tentativa ${attempt + 1}/${maxRetries})...`
      )
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}
