import { eq } from 'drizzle-orm'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { db } from '../db/connection.ts'
import { schema } from '../db/schema/index.ts'
import { chunkCode, chunkText, type TextChunk } from './chunker.ts'
import { listCodeFiles, readTextFile } from './code-files.ts'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { generateEmbeddingsBatch } from './gemini.ts'
import { chunkTimedTranscript, transcribeTalkFile } from './talk.ts'

const EMBEDDING_BATCH_SIZE = 20

const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt', '.text', '.csv', '.json']

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer)
    return parsed.text
  }

  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return buffer.toString('utf8')
  }

  throw new Error(
    `Formato não suportado: ${filename}. Use PDF, Markdown ou texto.`
  )
}

const MAX_CODE_CHUNKS = 6000

async function saveChunks(sourceId: string, chunks: TextChunk[]) {
  if (chunks.length === 0) {
    throw new Error('Nenhum conteúdo encontrado para indexar.')
  }

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
    const embeddings = await generateEmbeddingsBatch(batch.map((c) => c.content))

    await db.insert(schema.knowledgeChunks).values(
      batch.map((chunk, index) => ({
        sourceId,
        position: i + index,
        content: chunk.content,
        metadata: chunk.metadata,
        embeddings: embeddings[index],
      }))
    )
  }
}

// Roda a indexação em segundo plano e atualiza o status da fonte ao terminar.
async function runIndexing(sourceId: string, buildChunks: () => Promise<TextChunk[]>) {
  try {
    await saveChunks(sourceId, await buildChunks())

    await db
      .update(schema.knowledgeSources)
      .set({ status: 'ready', errorMessage: null })
      .where(eq(schema.knowledgeSources.id, sourceId))
  } catch (err: unknown) {
    console.error(`Erro ao indexar a fonte ${sourceId}:`, err)

    await db
      .delete(schema.knowledgeChunks)
      .where(eq(schema.knowledgeChunks.sourceId, sourceId))

    await db
      .update(schema.knowledgeSources)
      .set({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Erro desconhecido',
      })
      .where(eq(schema.knowledgeSources.id, sourceId))
  }
}

export function indexSourceText(sourceId: string, text: string) {
  return runIndexing(sourceId, async () => chunkText(text))
}

export function indexCodeSource(sourceId: string, root: string) {
  return runIndexing(sourceId, async () => {
    const files = await listCodeFiles(root)
    const chunks: TextChunk[] = []

    for (const file of files) {
      const content = await readTextFile(path.join(root, file))
      chunks.push(...chunkCode(content, file))

      if (chunks.length > MAX_CODE_CHUNKS) {
        throw new Error(
          `Pasta muito grande (mais de ${MAX_CODE_CHUNKS} blocos). Aponte para uma pasta menor, como a do módulo.`
        )
      }
    }

    return chunks
  })
}

// Transcreve a palestra (áudio/vídeo) com marcação de tempo, indexa por minuto e apaga o arquivo temporário.
export function indexTalkFile(
  sourceId: string,
  tempFilePath: string,
  mimeType: string
) {
  return runIndexing(sourceId, async () => {
    try {
      const transcript = await transcribeTalkFile(tempFilePath, mimeType)
      return chunkTimedTranscript(transcript)
    } finally {
      await rm(tempFilePath, { force: true })
    }
  })
}

const TIMESTAMP_LINE = /^\[\d{1,2}:\d{2}(:\d{2})?\]/m

// Transcrição de palestra já pronta: usa os minutos quando houver marcações [MM:SS], senão o chunker de texto.
export function indexTalkText(sourceId: string, text: string) {
  return runIndexing(sourceId, async () =>
    TIMESTAMP_LINE.test(text) ? chunkTimedTranscript(text) : chunkText(text)
  )
}
