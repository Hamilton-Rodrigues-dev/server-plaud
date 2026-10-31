import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const knowledgeSourceType = pgEnum('knowledge_source_type', [
  'code',
  'product',
  'study',
  'talk',
])

export const knowledgeSourceStatus = pgEnum('knowledge_source_status', [
  'indexing',
  'ready',
  'error',
])

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  type: knowledgeSourceType().notNull(),
  origin: text(),
  status: knowledgeSourceStatus().notNull().default('indexing'),
  errorMessage: text(),
  createdAt: timestamp().defaultNow().notNull(),
})
