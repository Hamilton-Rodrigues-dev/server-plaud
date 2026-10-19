import { eq, sql } from 'drizzle-orm'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { db } from '../../db/connection.ts'
import { schema } from '../../db/schema/index.ts'
import { generateAnswer, generateEmbeddings } from '../../services/gemini.ts'

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
        const embeddings = await generateEmbeddings(question)
        const embeddingsAsString = `[${embeddings.join(',')}]`

        // Busca até 10 chunks mais relevantes para a pergunta nesta sala
        const matchedChunks = await db
          .select({
            id: schema.audioChunks.id,
            transcription: schema.audioChunks.transcription,
            similarity: sql<number>`1 - (${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector)`,
          })
          .from(schema.audioChunks)
          .where(eq(schema.audioChunks.roomId, roomId))
          .orderBy(
            sql`${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector`
          )
          .limit(10)

        if (matchedChunks.length === 0) {
          answer =
            'Ainda não há áudios gravados nesta sala. Inicie a gravação no topo da tela para capturar a conversa e fazer perguntas!'
        } else {
          // Pega os chunks com similaridade razoável ou utiliza os disponíveis
          const highSimilarity = matchedChunks.filter((c) => c.similarity > 0.35)
          const chunksToUse =
            highSimilarity.length >= 2 ? highSimilarity : matchedChunks

          const transcriptions = chunksToUse.map((c) => c.transcription)
          answer = await generateAnswer(question, transcriptions)
        }
      } catch (err: unknown) {
        console.error('Erro ao responder pergunta com IA:', err)
        answer =
          'Houve uma instabilidade temporária na IA ao gerar a resposta. Por favor, tente enviar novamente.'
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
