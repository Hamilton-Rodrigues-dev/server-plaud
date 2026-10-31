import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { publishLive, subscribeLive } from './live-events.ts'

describe('live-events', () => {
  it('entrega o evento só para quem assina a sala', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    const offA = subscribeLive('sala-a', (e) => a.push(e))
    const offB = subscribeLive('sala-b', (e) => b.push(e))

    publishLive('sala-a', { type: 'chunk', text: 'oi' })

    assert.equal(a.length, 1)
    assert.equal(b.length, 0)
    offA()
    offB()
  })

  it('para de entregar depois de cancelar a assinatura', () => {
    const got: unknown[] = []
    const off = subscribeLive('sala-c', (e) => got.push(e))
    off()

    publishLive('sala-c', { type: 'chunk', text: 'oi' })

    assert.equal(got.length, 0)
  })
})
