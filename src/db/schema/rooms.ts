import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const rooms = pgTable('rooms', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  // Até onde a transcrição já foi analisada pelos insights automáticos.
  insightsAnalyzedUntil: timestamp(),
  createdAt: timestamp().defaultNow().notNull(),
})
