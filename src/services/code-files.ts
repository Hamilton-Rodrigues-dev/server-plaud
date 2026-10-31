import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  'target',
  'bin',
  'obj',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
])

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte',
  '.py', '.java', '.kt', '.cs', '.go', '.rs', '.php', '.rb', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.sql', '.prisma', '.graphql', '.gql',
  '.html', '.css', '.scss', '.sh', '.ps1', '.yml', '.yaml', '.toml',
  '.xml', '.gradle', '.md', '.mdx', '.txt',
])

const ALLOWED_JSON = /^(package|tsconfig[^/]*|composer|appsettings)\.json$/i

// Arquivos que nunca devem ser lidos nem indexados (segredos e chaves).
const SENSITIVE_NAME =
  /^(\.env.*|.*\.(pem|key|p12|pfx|crt|keystore|jks)|id_(rsa|dsa|ecdsa|ed25519).*|.*secrets?.*\.(json|ya?ml|txt)|\.npmrc|\.pypirc|credentials.*)$/i

const IGNORED_FILES = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.(js|css))$/i

export const MAX_FILE_BYTES = 200 * 1024
export const MAX_FILES = 3000

export function isSensitiveFile(filename: string) {
  return SENSITIVE_NAME.test(path.basename(filename))
}

export function isIndexableFile(filename: string) {
  const base = path.basename(filename)

  if (isSensitiveFile(base) || IGNORED_FILES.test(base)) {
    return false
  }

  const ext = path.extname(base).toLowerCase()

  if (ext === '.json') {
    return ALLOWED_JSON.test(base)
  }

  return CODE_EXTENSIONS.has(ext)
}

export async function resolveCodeRoot(inputPath: string) {
  const resolved = path.resolve(inputPath.trim())
  const real = await realpath(resolved)
  const info = await stat(real)

  if (!info.isDirectory()) {
    throw new Error('O caminho informado não é uma pasta.')
  }

  return real
}

// Lista (caminhos relativos, com "/") os arquivos indexáveis de uma pasta.
export async function listCodeFiles(root: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string) {
    if (files.length >= MAX_FILES) {
      return
    }

    const entries = await readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        return
      }

      // Links simbólicos são ignorados para não sair da pasta raiz.
      if (entry.isSymbolicLink()) {
        continue
      }

      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(fullPath)
        }
        continue
      }

      if (entry.isFile() && isIndexableFile(entry.name)) {
        const info = await lstat(fullPath)
        if (info.size > 0 && info.size <= MAX_FILE_BYTES) {
          files.push(path.relative(root, fullPath).split(path.sep).join('/'))
        }
      }
    }
  }

  await walk(root)
  return files
}

// Resolve um caminho relativo garantindo que ele fica dentro da raiz.
export async function resolveInsideRoot(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath)
  const real = await realpath(candidate)
  const relative = path.relative(root, real)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Caminho fora da pasta da fonte.')
  }

  if (isSensitiveFile(real)) {
    throw new Error('Arquivo protegido: não é permitido ler.')
  }

  return real
}

export async function readTextFile(fullPath: string) {
  return await readFile(fullPath, 'utf8')
}
