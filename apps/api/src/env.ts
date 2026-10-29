import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (copy .env.example to .env)'),
  // Prefixed onto stored photo paths (/uploads/...) when the API serialises a listing.
  API_PUBLIC_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
})

const parsed = envSchema.parse(process.env)

export const env = {
  ...parsed,
  API_PUBLIC_URL: parsed.API_PUBLIC_URL ?? `http://localhost:${parsed.PORT}`,
}
