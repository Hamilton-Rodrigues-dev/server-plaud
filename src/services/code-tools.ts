import path from 'node:path'
import {
  listCodeFiles,
  readTextFile,
  resolveInsideRoot,
} from './code-files.ts'

export type CodeRoot = {
  name: string
  root: string
}

const MAX_RESULT_CHARS = 20_000
const MAX_SEARCH_MATCHES = 40
const MAX_READ_LINES = 400

function truncate(text: string) {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n... (resultado truncado)`
    : text
}

function pickRoot(roots: CodeRoot[], name?: string) {
  if (!name) {
    return roots[0]
  }

  return roots.find((r) => r.name.toLowerCase() === name.toLowerCase())
}

function buildMatcher(query: string) {
  try {
    return new RegExp(query, 'i')
  } catch {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(escaped, 'i')
  }
}

async function searchCode(root: CodeRoot, query: string) {
  const matcher = buildMatcher(query)
  const files = await listCodeFiles(root.root)
  const matches: string[] = []

  for (const file of files) {
    const content = await readTextFile(path.join(root.root, file))
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      if (matcher.test(lines[i])) {
        matches.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
        if (matches.length >= MAX_SEARCH_MATCHES) {
          return `${matches.join('\n')}\n... (limite de ${MAX_SEARCH_MATCHES} resultados; refine a busca)`
        }
      }
    }
  }

  return matches.length > 0 ? matches.join('\n') : 'Nenhum resultado.'
}

async function readCodeFile(
  root: CodeRoot,
  filePath: string,
  startLine?: number,
  endLine?: number
) {
  const fullPath = await resolveInsideRoot(root.root, filePath)
  const lines = (await readTextFile(fullPath)).split('\n')

  const start = Math.max(1, startLine ?? 1)
  const end = Math.min(lines.length, endLine ?? start + MAX_READ_LINES - 1)
  const cappedEnd = Math.min(end, start + MAX_READ_LINES - 1)

  const body = lines
    .slice(start - 1, cappedEnd)
    .map((line, i) => `${start + i}: ${line}`)
    .join('\n')

  const note =
    cappedEnd < lines.length
      ? `\n... (arquivo tem ${lines.length} linhas; use start_line/end_line para ver mais)`
      : ''

  return `${filePath} (linhas ${start}-${cappedEnd} de ${lines.length})\n${body}${note}`
}

export const CODE_TOOLS = [
  {
    name: 'list_code_files',
    description:
      'Lista os arquivos de código de uma fonte (caminhos relativos). Use para entender a estrutura do projeto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Nome da fonte de código. Opcional se houver só uma.',
        },
        directory: {
          type: 'string',
          description: 'Filtra por prefixo de pasta, ex.: src/http',
        },
      },
    },
  },
  {
    name: 'search_code',
    description:
      'Busca um texto ou expressão regular (sem diferenciar maiúsculas) em todos os arquivos da fonte. Retorna caminho:linha: trecho.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Texto ou regex a procurar.' },
        source: { type: 'string', description: 'Nome da fonte (opcional).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_code_file',
    description:
      'Lê um arquivo da fonte, com números de linha. Use start_line e end_line para trechos grandes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Caminho relativo do arquivo.' },
        start_line: { type: 'number' },
        end_line: { type: 'number' },
        source: { type: 'string', description: 'Nome da fonte (opcional).' },
      },
      required: ['path'],
    },
  },
]

export async function runCodeTool(
  roots: CodeRoot[],
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    const root = pickRoot(
      roots,
      typeof input.source === 'string' ? input.source : undefined
    )

    if (!root) {
      return `Fonte não encontrada. Fontes disponíveis: ${roots.map((r) => r.name).join(', ')}`
    }

    if (name === 'list_code_files') {
      const prefix = typeof input.directory === 'string' ? input.directory : ''
      const files = (await listCodeFiles(root.root)).filter((f) =>
        f.startsWith(prefix)
      )
      return truncate(files.join('\n') || 'Nenhum arquivo.')
    }

    if (name === 'search_code' && typeof input.query === 'string') {
      return truncate(await searchCode(root, input.query))
    }

    if (name === 'read_code_file' && typeof input.path === 'string') {
      return truncate(
        await readCodeFile(
          root,
          input.path,
          typeof input.start_line === 'number' ? input.start_line : undefined,
          typeof input.end_line === 'number' ? input.end_line : undefined
        )
      )
    }

    return 'Ferramenta ou parâmetros inválidos.'
  } catch (err: unknown) {
    return `Erro: ${err instanceof Error ? err.message : 'falha ao executar a ferramenta'}`
  }
}
