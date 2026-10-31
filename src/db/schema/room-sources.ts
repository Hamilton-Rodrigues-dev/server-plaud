import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { knowledgeSources } from './knowledge-sources.ts'
import { rooms } from './rooms.ts'

export const roomSources = pgTable(
  'room_sources',
  {
    roomId: uuid()
      .references(() => rooms.id, { onDelete: 'cascade' })
      .notNull(),
    sourceId: uuid()
      .references(() => knowledgeSources.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.sourceId] })]
)
