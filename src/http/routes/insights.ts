import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { analyzeRoom, listInsights } from '../../services/insights.ts'

export const insightsRoute: FastifyPluginCallbackZod = (app) => {
  app.get(
    '/rooms/:roomId/insights',
    { schema: { params: z.object({ roomId: z.string().uuid() }) } },
    async (request) => {
      return await listInsights(request.params.roomId)
    }
  )

  // "Analisar agora": ignora o mínimo de fala nova.
  app.post(
    '/rooms/:roomId/insights/analyze',
    { schema: { params: z.object({ roomId: z.string().uuid() }) } },
    async (request, reply) => {
      try {
        const result = await analyzeRoom(request.params.roomId, { force: true })
        return reply.status(200).send(result)
      } catch (err: unknown) {
        console.error('Erro ao analisar a sala:', err)
        return reply
          .status(502)
          .send({ message: 'Não foi possível gerar os insights agora.' })
      }
    }
  )
}
