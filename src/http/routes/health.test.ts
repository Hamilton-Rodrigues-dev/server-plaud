import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { healthRoute } from './health.ts'
import { fastify } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'

describe('healthRoute', () => {
  it('should return 200 OK', async () => {
    const app = fastify().withTypeProvider<ZodTypeProvider>()
    app.setSerializerCompiler(serializerCompiler)
    app.setValidatorCompiler(validatorCompiler)
    
    app.register(healthRoute)
    
    await app.ready()
    
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    })
    
    assert.strictEqual(response.statusCode, 200)
    assert.strictEqual(response.body, 'OK')
    
    await app.close()
  })
})