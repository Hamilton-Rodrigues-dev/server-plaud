import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASSIST_LIMITS,
  classifyUtterance,
  shouldAssist,
  type AssistState,
} from './assist-policy.ts'

const base: AssistState = { enabled: true, lastRunAt: 0, used: 0 }
const NOW = 100_000

describe('classifyUtterance', () => {
  it('detecta pergunta com interrogação', () => {
    assert.equal(classifyUtterance('Qual é o prazo do contrato?'), 'question')
  })

  it('detecta pergunta sem interrogação pela palavra inicial', () => {
    assert.equal(classifyUtterance('como a gente faz o deploy hoje'), 'question')
  })

  it('trata o resto como afirmação', () => {
    assert.equal(classifyUtterance('O contrato vence em março.'), 'statement')
  })
})

describe('shouldAssist', () => {
  const text = 'O contrato vence em março e precisa renovar.'

  it('não roda com o modo desligado', () => {
    const r = shouldAssist({ ...base, enabled: false }, { source: 'system', text }, NOW)
    assert.equal(r.run, false)
  })

  it('não roda para a fala do próprio usuário (mic)', () => {
    assert.equal(shouldAssist(base, { source: 'mic', text }, NOW).run, false)
  })

  it('não roda para texto curto demais', () => {
    assert.equal(shouldAssist(base, { source: 'system', text: 'ok sim' }, NOW).run, false)
  })

  it('respeita o intervalo mínimo entre cartões', () => {
    const state = { ...base, lastRunAt: NOW - (ASSIST_LIMITS.minIntervalMs - 1) }
    assert.equal(shouldAssist(state, { source: 'system', text }, NOW).run, false)
  })

  it('respeita o teto de cartões por sessão', () => {
    const state = { ...base, used: ASSIST_LIMITS.maxPerSession }
    assert.equal(shouldAssist(state, { source: 'system', text }, NOW).run, false)
  })

  it('roda quando tudo está dentro dos limites e devolve o tipo', () => {
    const r = shouldAssist(base, { source: 'mixed', text }, NOW)
    assert.deepEqual(r, { run: true, kind: 'statement' })
  })
})
