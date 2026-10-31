import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { db } from '../../db/connection.ts'
import { schema } from '../../db/schema/index.ts'
import { resolveCodeRoot } from '../../services/code-files.ts'
import {
  extractText,
  indexCodeSource,
  indexSourceText,
  indexTalkFile,
  indexTalkText,
} from '../../services/ingest.ts'
import { guessMimeType, isMediaFile } from '../../services/talk.ts'

const sourceTypeSchema = z.enum(['code', 'product', 'study', 'talk'])

const sourceColumns = {
  id: schema.knowledgeSources.id,
  name: schema.knowledgeSources.name,
  type: schema.knowledgeSources.type,
  status: schema.knowledgeSources.status,
  errorMessage: schema.knowledgeSources.errorMessage,
  createdAt: schema.knowledgeSources.createdAt,
}

export const knowledgeSourcesRoute: FastifyPluginCallbackZod = (app) => {
  // Biblioteca global de fontes
  app.get('/sources', async () => {
    return await db
      .select(sourceColumns)
      .from(schema.knowledgeSources)
      .orderBy(desc(schema.knowledgeSources.createdAt))
  })

  // Cria uma fonte a partir de arquivo (PDF, MD, TXT) ou de texto colado.
  // Campos do multipart: name, type, text (opcional) e file (opcional).
  app.post('/sources', async (request, reply) => {
    const fields: Record<string, string> = {}
    let file: { buffer: Buffer; filename: string } | null = null
    let media: { tempPath: string; filename: string; mimeType: string } | null =
      null
    let tooLarge = false

    for await (const part of request.parts()) {
      if (part.type !== 'file') {
        if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value
        }
        continue
      }

      if (isMediaFile(part.filename, part.mimetype)) {
        // Áudio/vídeo vai direto para o disco: não carrega a palestra inteira na memória.
        const tempPath = path.join(
          tmpdir(),
          `plaud-talk-${randomUUID()}${path.extname(part.filename)}`
        )
        await pipeline(part.file, createWriteStream(tempPath))
        tooLarge = part.file.truncated
        media = {
          tempPath,
          filename: part.filename,
          mimeType: guessMimeType(part.filename, part.mimetype),
        }
      } else {
        file = { buffer: await part.toBuffer(), filename: part.filename }
      }
    }

    const discardMedia = async () => {
      if (media) {
        await rm(media.tempPath, { force: true })
      }
    }

    const parsedType = sourceTypeSchema.safeParse(fields.type)
    if (!parsedType.success) {
      await discardMedia()
      return reply
        .status(400)
        .send({ message: 'type deve ser code, product, study ou talk.' })
    }

    if (media && (parsedType.data !== 'talk' || tooLarge)) {
      await discardMedia()
      return reply.status(400).send({
        message: tooLarge
          ? 'Arquivo de mídia grande demais (limite de 300 MB).'
          : 'Áudio e vídeo só são aceitos no tipo Palestra.',
      })
    }

    // Palestra em áudio/vídeo: transcreve em segundo plano.
    if (media) {
      const [source] = await db
        .insert(schema.knowledgeSources)
        .values({
          name: fields.name?.trim() || media.filename,
          type: 'talk',
          origin: media.filename,
        })
        .returning()

      if (!source) {
        await discardMedia()
        throw new Error('Falha ao criar a fonte.')
      }

      indexTalkFile(source.id, media.tempPath, media.mimeType)

      return reply
        .status(202)
        .send({ sourceId: source.id, status: source.status })
    }

    let text = fields.text?.trim() ?? ''
    let origin = 'texto'

    try {
      if (file && file.buffer.length > 0) {
        text = await extractText(file.buffer, file.filename)
        origin = file.filename
      }
    } catch (err: unknown) {
      return reply.status(400).send({
        message: err instanceof Error ? err.message : 'Arquivo inválido.',
      })
    }

    if (!text.trim()) {
      return reply
        .status(400)
        .send({ message: 'Envie um arquivo ou um texto com conteúdo.' })
    }

    const name = fields.name?.trim() || file?.filename || 'Fonte sem nome'

    const [source] = await db
      .insert(schema.knowledgeSources)
      .values({ name, type: parsedType.data, origin })
      .returning()

    if (!source) {
      throw new Error('Falha ao criar a fonte.')
    }

    // Indexação em segundo plano; o status é atualizado ao terminar.
    // Palestra em texto (transcrição colada) aproveita marcações [MM:SS], se houver.
    if (parsedType.data === 'talk') {
      indexTalkText(source.id, text)
    } else {
      indexSourceText(source.id, text)
    }

    return reply.status(202).send({ sourceId: source.id, status: source.status })
  })

  // Indexa uma pasta de código local. O caminho fica salvo em "origin" para as ferramentas de leitura.
  app.post(
    '/sources/code',
    {
      schema: {
        body: z.object({
          path: z.string().min(1),
          name: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      let root: string

      try {
        root = await resolveCodeRoot(request.body.path)
      } catch (err: unknown) {
        const notFound =
          err instanceof Error && 'code' in err && err.code === 'ENOENT'
        return reply.status(400).send({
          message: notFound
            ? 'Pasta não encontrada. Confira o caminho.'
            : err instanceof Error
              ? err.message
              : 'Caminho inválido.',
        })
      }

      const name = request.body.name?.trim() || path.basename(root)

      const [source] = await db
        .insert(schema.knowledgeSources)
        .values({ name, type: 'code', origin: root })
        .returning()

      if (!source) {
        throw new Error('Falha ao criar a fonte.')
      }

      indexCodeSource(source.id, root)

      return reply
        .status(202)
        .send({ sourceId: source.id, status: source.status })
    }
  )

  app.delete(
    '/sources/:sourceId',
    { schema: { params: z.object({ sourceId: z.string().uuid() }) } },
    async (request, reply) => {
      await db
        .delete(schema.knowledgeSources)
        .where(eq(schema.knowledgeSources.id, request.params.sourceId))

      return reply.status(204).send()
    }
  )

  // Fontes ligadas a uma sala
  app.get(
    '/rooms/:roomId/sources',
    { schema: { params: z.object({ roomId: z.string().uuid() }) } },
    async (request) => {
      return await db
        .select(sourceColumns)
        .from(schema.roomSources)
        .innerJoin(
          schema.knowledgeSources,
          eq(schema.knowledgeSources.id, schema.roomSources.sourceId)
        )
        .where(eq(schema.roomSources.roomId, request.params.roomId))
        .orderBy(desc(schema.roomSources.createdAt))
    }
  )

  app.post(
    '/rooms/:roomId/sources',
    {
      schema: {
        params: z.object({ roomId: z.string().uuid() }),
        body: z.object({ sourceId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      await db
        .insert(schema.roomSources)
        .values({
          roomId: request.params.roomId,
          sourceId: request.body.sourceId,
        })
        .onConflictDoNothing()

      return reply.status(201).send()
    }
  )

  app.delete(
    '/rooms/:roomId/sources/:sourceId',
    {
      schema: {
        params: z.object({
          roomId: z.string().uuid(),
          sourceId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      await db
        .delete(schema.roomSources)
        .where(
          and(
            eq(schema.roomSources.roomId, request.params.roomId),
            eq(schema.roomSources.sourceId, request.params.sourceId)
          )
        )

      return reply.status(204).send()
    }
  )
}
