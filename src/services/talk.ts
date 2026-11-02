import { FileState } from '@google/genai'
import type { TextChunk } from './chunker.ts'
import { gemini, generateWithFallback } from './gemini.ts'

const MEDIA_EXTENSIONS = [
  '.mp3', '.m4a', '.wav', '.ogg', '.oga', '.flac', '.aac',
  '.mp4', '.mov', '.webm', '.mkv', '.mpeg', '.mpga',
]

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mp3',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mpeg': 'video/mpeg',
  '.mpga': 'audio/mpeg',
}

const UPLOAD_POLL_MS = 3000
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000

export function isMediaFile(filename: string, mimetype: string) {
  const lower = filename.toLowerCase()
  return (
    mimetype.startsWith('audio/') ||
    mimetype.startsWith('video/') ||
    MEDIA_EXTENSIONS.some((ext) => lower.endsWith(ext))
  )
}

export function guessMimeType(filename: string, mimetype: string) {
  if (mimetype.startsWith('audio/') || mimetype.startsWith('video/')) {
    return mimetype
  }

  const ext = MEDIA_EXTENSIONS.find((e) => filename.toLowerCase().endsWith(e))
  return (ext && MIME_BY_EXTENSION[ext]) || 'audio/mpeg'
}

const TRANSCRIPTION_PROMPT = `Transcreva integralmente o áudio desta palestra para português do Brasil.

Formato obrigatório: cada parágrafo começa com o tempo de início entre colchetes, no formato [MM:SS] (use [H:MM:SS] passando de uma hora), em uma nova linha. Gere um novo marcador a cada 30 a 60 segundos ou quando o assunto mudar.
Exemplo:
[00:00] Bom dia a todos, hoje vamos falar sobre...
[00:45] O primeiro ponto é...

Se houver mais de uma pessoa falando, indique o interlocutor no início do parágrafo (ex.: "Palestrante:", "Pergunta da plateia:"). Não resuma, não comente e não adicione nada além da transcrição.`

// Envia o arquivo para a Files API do Gemini, transcreve com marcações de tempo e apaga o arquivo remoto.
export async function transcribeTalkFile(filePath: string, mimeType: string) {
  const uploaded = await gemini.files.upload({
    file: filePath,
    config: { mimeType },
  })

  const fileName = uploaded.name

  try {
    let file = uploaded
    const startedAt = Date.now()

    while (file.state === FileState.PROCESSING) {
      if (Date.now() - startedAt > UPLOAD_TIMEOUT_MS) {
        throw new Error('Tempo esgotado ao processar o arquivo no Gemini.')
      }

      await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_MS))

      if (!fileName) {
        break
      }
      file = await gemini.files.get({ name: fileName })
    }

    if (file.state === FileState.FAILED || !file.uri) {
      throw new Error('O Gemini não conseguiu processar o arquivo de mídia.')
    }

    const text = await generateWithFallback([
      { text: TRANSCRIPTION_PROMPT },
      { fileData: { fileUri: file.uri, mimeType: file.mimeType ?? mimeType } },
    ])

    if (!text.trim()) {
      throw new Error('Nenhuma fala detectada na mídia.')
    }

    return text.trim()
  } finally {
    if (fileName) {
      await gemini.files.delete({ name: fileName }).catch(() => {})
    }
  }
}

const TIMESTAMP_REGEX = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*/
const TALK_MAX_CHARS = 1500

function toMinute(match: RegExpExecArray) {
  const [, a, b, c] = match
  // [MM:SS] ou [H:MM:SS]
  return c === undefined
    ? Number(a)
    : Number(a) * 60 + Number(b)
}

// Agrupa os parágrafos com marcação [MM:SS] em blocos, guardando o minuto de início de cada bloco.
export function chunkTimedTranscript(text: string): TextChunk[] {
  const chunks: TextChunk[] = []
  let buffer: string[] = []
  let bufferChars = 0
  let startMinute = 0
  let currentMinute = 0

  const flush = () => {
    const content = buffer.join('\n').trim()
    if (content) {
      chunks.push({
        content: `(minuto ${startMinute})\n${content}`,
        metadata: { minute: startMinute },
      })
    }
    buffer = []
    bufferChars = 0
  }

  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const match = TIMESTAMP_REGEX.exec(line)
    if (match) {
      currentMinute = toMinute(match)
    }

    if (buffer.length === 0) {
      startMinute = currentMinute
    }

    const clean = match ? line.slice(match[0].length) : line
    buffer.push(clean)
    bufferChars += clean.length

    if (bufferChars >= TALK_MAX_CHARS) {
      flush()
    }
  }

  flush()
  return chunks
}
