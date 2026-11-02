import { and, desc, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db/connection.ts'
import { schema } from '../db/schema/index.ts'
import { extractInsights } from './ai.ts'
import { generateEmbeddings } from './gemini.ts'
import { searchKnowledge } from './search.ts'

// Com blocos de 10s de fala, 12 blocos ≈ 2 minutos de conversa nova.
const MIN_NEW_CHUNKS = 12
const MAX_ANALYZED_CHUNKS = 40
const PREVIOUS_CONTEXT_CHUNKS = 4
const EXISTING_INSIGHTS_LIMIT = 20
const QUERY_MAX_CHARS = 2000

// Os blocos de áudio chegam em rajadas; sem um intervalo mínimo a mesma conversa era analisada várias vezes seguidas.
const MIN_AUTO_INTERVAL_MS = 90_000

const analyzing = new Set<string>()
const lastRunAt = new Map<string, number>()

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

type AnalyzeResult = { created: number; skipped?: 'running' | 'not-enough' }

// Analisa a fala nova da sala e grava os insights. Com force=true ignora o mínimo de fala nova.
export async function analyzeRoom(
  roomId: string,
  options: { force?: boolean } = {}
): Promise<AnalyzeResult> {
  if (analyzing.has(roomId)) {
    return { created: 0, skipped: 'running' }
  }

  if (
    !options.force &&
    Date.now() - (lastRunAt.get(roomId) ?? 0) < MIN_AUTO_INTERVAL_MS
  ) {
    return { created: 0, skipped: 'not-enough' }
  }

  analyzing.add(roomId)

  try {
    const [room] = await db
      .select({ analyzedUntil: schema.rooms.insightsAnalyzedUntil })
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))

    if (!room) {
      return { created: 0 }
    }

    const sinceFilter = room.analyzedUntil
      ? gt(schema.audioChunks.createdAt, room.analyzedUntil)
      : undefined

    const latestNew = await db
      .select()
      .from(schema.audioChunks)
      .where(and(eq(schema.audioChunks.roomId, roomId), sinceFilter))
      .orderBy(desc(schema.audioChunks.createdAt))
      .limit(MAX_ANALYZED_CHUNKS)

    if (
      latestNew.length === 0 ||
      (!options.force && latestNew.length < MIN_NEW_CHUNKS)
    ) {
      return { created: 0, skipped: 'not-enough' }
    }

    const newChunks = [...latestNew].reverse()
    const firstNew = newChunks[0]
    const lastNew = newChunks[newChunks.length - 1]

    const previous = (
      await db
        .select()
        .from(schema.audioChunks)
        .where(
          and(
            eq(schema.audioChunks.roomId, roomId),
            lt(schema.audioChunks.createdAt, firstNew.createdAt)
          )
        )
        .orderBy(desc(schema.audioChunks.createdAt))
        .limit(PREVIOUS_CONTEXT_CHUNKS)
    ).reverse()

    const existing = await db
      .select({ title: schema.insights.title })
      .from(schema.insights)
      .where(eq(schema.insights.roomId, roomId))
      .orderBy(desc(schema.insights.createdAt))
      .limit(EXISTING_INSIGHTS_LIMIT)

    // Marca o início da análise (mesmo que falhe) para não martelar a API em caso de erro.
    lastRunAt.set(roomId, Date.now())

    const toBlock = (c: (typeof newChunks)[number]) => ({
      label: `reunião ${formatTime(c.createdAt)}`,
      content: c.transcription,
    })

    // Busca na base de conhecimento o que se relaciona com o que acabou de ser dito.
    const queryText = newChunks
      .map((c) => c.transcription)
      .join(' ')
      .slice(0, QUERY_MAX_CHARS)
    const embeddings = await generateEmbeddings(queryText, 'RETRIEVAL_QUERY')
    const knowledge = await searchKnowledge(
      roomId,
      queryText,
      `[${embeddings.join(',')}]`
    )

    const extracted = await extractInsights({
      newTranscript: newChunks.map(toBlock),
      previousTranscript: previous.map(toBlock),
      knowledge,
      existingTitles: existing.map((e) => e.title),
    })

    // Descarta o que repete (mesmo com pequenas diferenças de pontuação ou acento) um insight já registrado.
    const seen = new Set(existing.map((e) => normalizeTitle(e.title)))
    const found = extracted.filter((insight) => {
      const key = normalizeTitle(insight.title)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

    if (found.length > 0) {
      await db
        .insert(schema.insights)
        .values(found.map((insight) => ({ roomId, ...insight })))
    }

    // Só avança o marcador depois de analisar com sucesso; se falhar, tenta de novo depois.
    await db
      .update(schema.rooms)
      .set({ insightsAnalyzedUntil: lastNew.createdAt })
      .where(eq(schema.rooms.id, roomId))

    return { created: found.length }
  } finally {
    analyzing.delete(roomId)
  }
}

export async function listInsights(roomId: string) {
  return await db
    .select({
      id: schema.insights.id,
      kind: schema.insights.kind,
      title: schema.insights.title,
      detail: schema.insights.detail,
      createdAt: schema.insights.createdAt,
    })
    .from(schema.insights)
    .where(eq(schema.insights.roomId, roomId))
    .orderBy(desc(schema.insights.createdAt))
    .limit(50)
}

// Chamado depois de cada bloco de áudio: dispara a análise em segundo plano quando há fala nova suficiente.
export function maybeAnalyzeRoom(roomId: string) {
  analyzeRoom(roomId).catch((err: unknown) => {
    console.error('Erro ao gerar insights automáticos:', err)
  })
}
