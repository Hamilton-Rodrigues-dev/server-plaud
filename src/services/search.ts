import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/connection.ts'
import { schema } from '../db/schema/index.ts'
import type { CodeRoot } from './code-tools.ts'

export type ContextBlock = {
  label: string
  content: string
}

const RRF_K = 60
const VECTOR_LIMIT = 8
const TEXT_LIMIT = 8
const KNOWLEDGE_LIMIT = 8
const MEETING_MATCH_LIMIT = 10
const MEETING_RECENT_LIMIT = 4

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Trechos da reunião: os mais parecidos com a pergunta + os mais recentes, em ordem cronológica.
async function searchMeeting(roomId: string, embeddingsAsString: string) {
  const distance = sql`${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector`

  const [matched, recent] = await Promise.all([
    db
      .select()
      .from(schema.audioChunks)
      .where(eq(schema.audioChunks.roomId, roomId))
      .orderBy(distance)
      .limit(MEETING_MATCH_LIMIT),
    db
      .select()
      .from(schema.audioChunks)
      .where(eq(schema.audioChunks.roomId, roomId))
      .orderBy(desc(schema.audioChunks.createdAt))
      .limit(MEETING_RECENT_LIMIT),
  ])

  const byId = new Map([...matched, ...recent].map((c) => [c.id, c]))

  return [...byId.values()]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map<ContextBlock>((c) => ({
      label: `reunião ${formatTime(c.createdAt)}`,
      content: c.transcription,
    }))
}

// Busca híbrida (vetor + texto) nas fontes ligadas à sala, combinada por Reciprocal Rank Fusion.
export async function searchKnowledge(
  roomId: string,
  question: string,
  embeddingsAsString: string
) {
  const filter = and(
    eq(schema.roomSources.roomId, roomId),
    eq(schema.knowledgeSources.status, 'ready')
  )

  const baseQuery = () =>
    db
      .select({
        id: schema.knowledgeChunks.id,
        content: schema.knowledgeChunks.content,
        metadata: schema.knowledgeChunks.metadata,
        sourceName: schema.knowledgeSources.name,
      })
      .from(schema.knowledgeChunks)
      .innerJoin(
        schema.knowledgeSources,
        eq(schema.knowledgeSources.id, schema.knowledgeChunks.sourceId)
      )
      .innerJoin(
        schema.roomSources,
        eq(schema.roomSources.sourceId, schema.knowledgeSources.id)
      )

  const tsQuery = sql`websearch_to_tsquery('portuguese', ${question})`
  const tsVector = sql`to_tsvector('portuguese', ${schema.knowledgeChunks.content})`

  const [byVector, byText] = await Promise.all([
    baseQuery()
      .where(filter)
      .orderBy(
        sql`${schema.knowledgeChunks.embeddings} <=> ${embeddingsAsString}::vector`
      )
      .limit(VECTOR_LIMIT),
    baseQuery()
      .where(and(filter, sql`${tsVector} @@ ${tsQuery}`))
      .orderBy(sql`ts_rank(${tsVector}, ${tsQuery}) desc`)
      .limit(TEXT_LIMIT),
  ])

  const scores = new Map<string, { score: number; row: (typeof byVector)[0] }>()

  for (const list of [byVector, byText]) {
    list.forEach((row, rank) => {
      const entry = scores.get(row.id) ?? { score: 0, row }
      entry.score += 1 / (RRF_K + rank + 1)
      scores.set(row.id, entry)
    })
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, KNOWLEDGE_LIMIT)
    .map<ContextBlock>(({ row }) => {
      const { path, startLine, endLine, heading, minute } = row.metadata
      const where = path
        ? `, ${path}:${startLine}-${endLine}`
        : minute !== undefined
          ? `, min ${minute}`
        : heading
          ? `, seção "${heading}"`
          : ''
      return {
        label: `fonte: ${row.sourceName}${where}`,
        content: row.content,
      }
    })
}

export async function searchContext(
  roomId: string,
  question: string,
  embeddings: number[]
) {
  const embeddingsAsString = `[${embeddings.join(',')}]`

  const [meeting, knowledge] = await Promise.all([
    searchMeeting(roomId, embeddingsAsString),
    searchKnowledge(roomId, question, embeddingsAsString),
  ])

  return { meeting, knowledge }
}

// Pastas de código prontas e ligadas à sala, usadas pelas ferramentas de leitura do Claude.
export async function getRoomCodeRoots(roomId: string): Promise<CodeRoot[]> {
  const rows = await db
    .select({
      name: schema.knowledgeSources.name,
      origin: schema.knowledgeSources.origin,
    })
    .from(schema.roomSources)
    .innerJoin(
      schema.knowledgeSources,
      eq(schema.knowledgeSources.id, schema.roomSources.sourceId)
    )
    .where(
      and(
        eq(schema.roomSources.roomId, roomId),
        eq(schema.knowledgeSources.type, 'code'),
        eq(schema.knowledgeSources.status, 'ready')
      )
    )

  return rows.flatMap((row) =>
    row.origin ? [{ name: row.name, root: row.origin }] : []
  )
}
