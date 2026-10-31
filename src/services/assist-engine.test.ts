import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAssistEngine } from './assist-engine.ts'
import type { LiveEvent } from './live-events.ts'

function setup(generate: () => Promise<string> = async () => 'cartão') {
  const events: LiveEvent[] = []
  let now = 1_000_000
  let calls = 0
  const engine = createAssistEngine({
    generate: () => {
      calls++
      return generate()
    },
    publish: (_roomId, e) => events.push(e),
    now: () => now,
  })
  return {
    engine,
    events,
    calls: () => calls,
    advance: (ms: number) => {
      now += ms
    },
  }
}

const chunk = { source: 'system' as const, text: 'Qual é o prazo do contrato com o cliente?' }

describe('assist-engine', () => {
  it('repassa os embeddings da fatia para evitar gerar de novo', async () => {
    let received: number[] | undefined
    const engine = createAssistEngine({
      generate: async (_roomId, _text, _kind, embeddings) => {
        received = embeddings
        return 'cartão'
      },
      publish: () => {},
      now: () => 1_000_000,
    })
    engine.setEnabled('r1', true)
    await engine.handleChunk('r1', { ...chunk, embeddings: [0.1, 0.2] })
    assert.deepEqual(received, [0.1, 0.2])
  })

  it('não chama a IA com o modo desligado', async () => {
    const t = setup()
    await t.engine.handleChunk('r1', chunk)
    assert.equal(t.calls(), 0)
  })

  it('gera e publica um cartão com o modo ligado', async () => {
    const t = setup()
    t.engine.setEnabled('r1', true)
    await t.engine.handleChunk('r1', chunk)
    assert.equal(t.calls(), 1)
    assert.deepEqual(t.events[0], { type: 'assist', kind: 'question', text: 'cartão' })
  })

  it('só a primeira de duas fatias seguidas gera cartão', async () => {
    const t = setup()
    t.engine.setEnabled('r1', true)
    await t.engine.handleChunk('r1', chunk)
    t.advance(5_000)
    await t.engine.handleChunk('r1', chunk)
    assert.equal(t.calls(), 1)
  })

  it('falha da IA não propaga nem publica cartão', async () => {
    const t = setup(async () => {
      throw new Error('sem saldo')
    })
    t.engine.setEnabled('r1', true)
    await t.engine.handleChunk('r1', chunk)
    assert.equal(t.events.length, 0)
  })

  it('religar o modo zera o contador', async () => {
    const t = setup()
    t.engine.setEnabled('r1', true)
    await t.engine.handleChunk('r1', chunk)
    t.engine.setEnabled('r1', false)
    t.engine.setEnabled('r1', true)
    t.advance(1_000)
    await t.engine.handleChunk('r1', chunk)
    assert.equal(t.calls(), 2)
  })
})
