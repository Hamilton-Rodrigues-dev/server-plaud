import { z } from 'zod'

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3333),
    DATABASE_URL: z.string().url().startsWith('postgresql://'),
    GEMINI_API_KEY: z.string(),
    // Provedor das respostas e dos insights. A transcrição e os embeddings são sempre do Gemini.
    AI_PROVIDER: z.enum(['gemini', 'claude']).default('gemini'),
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  })
  .refine((env) => env.AI_PROVIDER !== 'claude' || !!env.ANTHROPIC_API_KEY, {
    message: 'ANTHROPIC_API_KEY é obrigatória quando AI_PROVIDER=claude.',
    path: ['ANTHROPIC_API_KEY'],
  })

export const env = envSchema.parse(process.env)
