import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { db } from '../../db/connection.ts'
import { schema } from '../../db/schema/index.ts'
import { generateAnswer } from '../../services/ai.ts'
import { generateEmbeddings } from '../../services/gemini.ts'
import { getRoomCodeRoots, searchContext } from '../../services/search.ts'

// Traduz falhas conhecidas da API do Claude em uma mensagem que diz o que fazer.
function describeAiError(err: unknown) {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: number }).status
      : undefined
  const message = err instanceof Error ? err.message : ''

  if (message.includes('credit balance is too low')) {
    return 'A conta da Anthropic está sem saldo. Adicione créditos em console.anthropic.com > Plans & Billing e tente novamente.'
  }

  if (status === 401 || status === 403) {
    return 'A chave da Anthropic (ANTHROPIC_API_KEY) foi recusada. Confira se está correta no .env do servidor.'
  }

  if (status === 429) {
    return 'Limite de uso da API do Claude atingido. Aguarde um pouco e tente novamente.'
  }

  return 'Houve uma instabilidade temporária na IA ao gerar a resposta. Por favor, tente enviar novamente.'
}

export const createQuestionRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/rooms/:roomId/questions',
    {
      schema: {
        params: z.object({
          roomId: z.string(),
        }),
        body: z.object({
          question: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { roomId } = request.params
      const { question } = request.body

      let answer: string | null = null

      try {
        const embeddings = await generateEmbeddings(question, 'RETRIEVAL_QUERY')
        const [{ meeting, knowledge }, codeRoots] = await Promise.all([
          searchContext(roomId, question, embeddings),
          getRoomCodeRoots(roomId),
        ])

        if (
          meeting.length === 0 &&
          knowledge.length === 0 &&
          codeRoots.length === 0
        ) {
          answer =
            'Ainda não há áudios gravados nem fontes de conhecimento nesta sala. Inicie a gravação ou adicione uma fonte para fazer perguntas!'
        } else {
          answer = await generateAnswer(question, meeting, knowledge, codeRoots)
        }
      } catch (err: unknown) {
        console.error('Erro ao responder pergunta com IA:', err)
        answer = describeAiError(err)
      }

      const result = await db
        .insert(schema.questions)
        .values({ roomId, question, answer })
        .returning()

      const insertedQuestion = result[0]

      if (!insertedQuestion) {
        throw new Error('Falha ao registrar a pergunta no banco.')
      }

      return reply.status(201).send({
        questionId: insertedQuestion.id,
        answer,
      })
    }
  )
}
