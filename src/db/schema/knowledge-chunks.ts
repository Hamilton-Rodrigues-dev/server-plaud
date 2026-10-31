import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { knowledgeSources } from './knowledge-sources.ts'

export type KnowledgeChunkMetadata = {
  heading?: string
  path?: string
  startLine?: number
  endLine?: number
  page?: number
  minute?: number
}

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid().primaryKey().defaultRandom(),
  sourceId: uuid()
    .references(() => knowledgeSources.id, { onDelete: 'cascade' })
    .notNull(),
  position: integer().notNull(),
  content: text().notNull(),
  metadata: jsonb().$type<KnowledgeChunkMetadata>().notNull().default({}),
  embeddings: vector({ dimensions: 768 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})
