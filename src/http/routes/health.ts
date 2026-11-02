import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'

export const healthRoute: FastifyPluginCallbackZod = (app) => {
  app.get('/health', {
    schema: {
      response: {
        200: z.string(),
      },
    },
    handler: async () => {
      return 'OK'
    },
  })
}