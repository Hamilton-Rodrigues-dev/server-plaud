import type { KnowledgeChunkMetadata } from '../db/schema/knowledge-chunks.ts'

export type TextChunk = {
  content: string
  metadata: KnowledgeChunkMetadata
}

const MAX_CHARS = 1200
const OVERLAP_CHARS = 200
const HEADING_REGEX = /^(#{1,6})\s+(.+)$/

function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHARS) {
    return [text]
  }

  const pieces: string[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + MAX_CHARS, text.length)

    if (end < text.length) {
      const breakAt = Math.max(
        text.lastIndexOf('\n\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf('\n', end)
      )
      if (breakAt > start + MAX_CHARS / 2) {
        end = breakAt + 1
      }
    }

    pieces.push(text.slice(start, end).trim())

    if (end >= text.length) {
      break
    }
    start = Math.max(end - OVERLAP_CHARS, start + 1)
  }

  return pieces.filter(Boolean)
}

// Divide por títulos Markdown (ou blocos de parágrafos) e depois por tamanho.
export function chunkText(rawText: string): TextChunk[] {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\u0000/g, '')
  const sections: { heading?: string; body: string }[] = []

  let currentHeading: string | undefined
  let buffer: string[] = []

  const flush = () => {
    const body = buffer.join('\n').trim()
    if (body) {
      sections.push({ heading: currentHeading, body })
    }
    buffer = []
  }

  for (const line of text.split('\n')) {
    const match = HEADING_REGEX.exec(line)
    if (match) {
      flush()
      currentHeading = match[2].trim()
    }
    buffer.push(line)
  }
  flush()

  const chunks: TextChunk[] = []

  for (const section of sections) {
    splitLongText(section.body).forEach((piece, index) => {
      // O primeiro pedaço já traz a linha do título; os demais recebem o título como contexto.
      const content =
        section.heading && index > 0 ? `${section.heading}

${piece}` : piece

      chunks.push({
        content,
        metadata: section.heading ? { heading: section.heading } : {},
      })
    })
  }

  return chunks
}

const CODE_MAX_CHARS = 1500
const CODE_MAX_LINES = 80
const CODE_OVERLAP_LINES = 8

// Divide um arquivo de código em blocos de linhas, guardando caminho e linhas de cada bloco.
export function chunkCode(rawContent: string, filePath: string): TextChunk[] {
  const lines = rawContent.replace(/\r\n/g, '\n').replace(/\u0000/g, '').split('\n')
  const chunks: TextChunk[] = []

  let start = 0

  while (start < lines.length) {
    let end = start
    let chars = 0

    while (
      end < lines.length &&
      end - start < CODE_MAX_LINES &&
      (chars + lines[end].length <= CODE_MAX_CHARS || end === start)
    ) {
      chars += lines[end].length + 1
      end++
    }

    const body = lines.slice(start, end).join('\n')

    if (body.trim()) {
      chunks.push({
        content: `// ${filePath} (linhas ${start + 1}-${end})\n${body}`,
        metadata: { path: filePath, startLine: start + 1, endLine: end },
      })
    }

    if (end >= lines.length) {
      break
    }
    start = Math.max(end - CODE_OVERLAP_LINES, start + 1)
  }

  return chunks
}
