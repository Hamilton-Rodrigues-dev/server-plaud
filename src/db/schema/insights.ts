import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { rooms } from './rooms.ts'

export const insightKind = pgEnum('insight_kind', [
  'decision',
  'action',
  'deadline',
  'risk',
  'question',
  'alert',
])

export const insights = pgTable('insights', {
  id: uuid().primaryKey().defaultRandom(),
  roomId: uuid()
    .references(() => rooms.id, { onDelete: 'cascade' })
    .notNull(),
  kind: insightKind().notNull(),
  title: text().notNull(),
  detail: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
})
