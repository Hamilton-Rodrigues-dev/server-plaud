import { fastifyCors } from '@fastify/cors'
import { fastifyMultipart } from '@fastify/multipart'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { env } from './env.ts'
import { createQuestionRoute } from './http/routes/create-question.ts'
import { createRoomRoute } from './http/routes/create-room.ts'
import { getRoomQuestions } from './http/routes/get-room-questions.ts'
import { insightsRoute } from './http/routes/insights.ts'
import { liveRoute } from './http/routes/live.ts'
import { knowledgeSourcesRoute } from './http/routes/knowledge-sources.ts'
import { getRoomsRoute } from './http/routes/get-rooms.ts'
import { uploadAudioRoute } from './http/routes/upload-audio.ts'
import { healthRoute } from './http/routes/health.ts'

const app = fastify().withTypeProvider<ZodTypeProvider>()

app.register(fastifyCors, {
  origin: true,
})

app.register(fastifyMultipart, {
  limits: { fileSize: 300 * 1024 * 1024 },
})

app.setSerializerCompiler(serializerCompiler)
app.setValidatorCompiler(validatorCompiler)

app.register(healthRoute)

app.register(getRoomsRoute)
app.register(createRoomRoute)
app.register(getRoomQuestions)
app.register(createQuestionRoute)
app.register(uploadAudioRoute)
app.register(knowledgeSourcesRoute)
app.register(insightsRoute)
app.register(liveRoute)

app.listen({ port: env.PORT })
