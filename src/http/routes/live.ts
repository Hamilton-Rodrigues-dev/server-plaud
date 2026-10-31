import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { assist } from '../../services/assist.ts'
import { subscribeLive } from '../../services/live-events.ts'

const KEEPALIVE_MS = 25_000

export const liveRoute: FastifyPluginCallbackZod = (app) => {
  // Fluxo de eventos da sala (fatias com fala e cartões de suporte) via SSE.
  app.get(
    '/rooms/:roomId/live',
    { schema: { params: z.object({ roomId: z.string() }) } },
    (request, reply) => {
      const { roomId } = request.params

      // hijack: o CORS do Fastify não é aplicado a respostas escritas direto no socket.
      reply.hijack()
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      })
      reply.raw.write(': conectado\n\n')

      const unsubscribe = subscribeLive(roomId, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      })
      const keepalive = setInterval(() => {
        reply.raw.write(': ping\n\n')
      }, KEEPALIVE_MS)

      request.raw.on('close', () => {
        clearInterval(keepalive)
        unsubscribe()
      })
    }
  )

  app.post(
    '/rooms/:roomId/assist',
    {
      schema: {
        params: z.object({ roomId: z.string() }),
        body: z.object({ enabled: z.boolean() }),
      },
    },
    (request) => {
      const { enabled } = request.body

      assist.setEnabled(request.params.roomId, enabled)

      return { enabled }
    }
  )
}
