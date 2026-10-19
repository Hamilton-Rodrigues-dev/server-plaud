import { GoogleGenAI } from '@google/genai'
import { env } from '../env.ts'

const gemini = new GoogleGenAI({
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
async function generateWithFallback(contents: any[]) {
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

export async function generateEmbeddings(text: string) {
  const response = await gemini.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ text }],
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 768,
    },
  })

  if (!response.embeddings?.[0]?.values) {
    throw new Error('Não foi possível gerar os embeddings.')
  }

  return response.embeddings[0].values
}

export async function generateAnswer(
  question: string,
  transcriptions: string[]
) {
  const context = transcriptions.join('\n\n')

  const prompt = `
    Você é o assistente inteligente do Plaud Virtual (assistente de IA para reuniões, chamadas, aulas e anotações de áudio).
    Com base nas transcrições do áudio gravado fornecidas abaixo, responda à solicitação ou dúvida do usuário com clareza, síntese e boa formatação em português do Brasil.

    TRANSCRIÇÕES DO ÁUDIO GRAVADO:
    """
    ${context}
    """

    SOLICITAÇÃO DO USUÁRIO:
    "${question}"

    INSTRUÇÕES:
    - Sintetize as informações com base no que foi falado no áudio;
    - Se for um pedido de resumo ("resuma", "pontos principais"), faça um resumo estruturado em tópicos dos assuntos abordados;
    - Se a pergunta for sobre um assunto específico não citado no áudio, explique brevemente o que foi falado nas transcrições e mencione com gentileza que esse ponto específico ainda não apareceu na gravação;
    - Utilize formatação Markdown (negrito, tópicos, etc.) para facilitar a leitura.
  `.trim()

  const text = await generateWithFallback([
    {
      text: prompt,
    },
  ])

  return text
}
