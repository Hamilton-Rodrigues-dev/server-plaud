import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { rooms } from './rooms.ts'

export const audioChunks = pgTable(
  'audio_chunks',
  {
  id: uuid().primaryKey().defaultRandom(),
  roomId: uuid()
    .references(() => rooms.id)
    .notNull(),
  transcription: text().notNull(),
  source: text().notNull().default('mixed'),
  embeddings: vector({ dimensions: 768 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
  },
  (table) => [
    // As buscas sempre filtram por sala e pegam as fatias mais recentes.
    index('audio_chunks_room_created_idx').on(table.roomId, table.createdAt.desc()),
  ]
)
