import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (copy .env.example to .env)'),
  // Prefixed onto stored photo paths (/uploads/...) when the API serialises a listing.
  API_PUBLIC_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // Where vendor emails go out (KAN-17). Unset prints them to the console instead.
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('Reclo <no-reply@reclo.uz>'),
  // Origin of the web app, for links in emails. Defaults to CORS_ORIGIN.
  WEB_PUBLIC_URL: z.string().min(1).optional(),
})

const parsed = envSchema.parse(process.env)

export const env = {
  ...parsed,
  API_PUBLIC_URL: parsed.API_PUBLIC_URL ?? `http://localhost:${parsed.PORT}`,
  WEB_PUBLIC_URL: parsed.WEB_PUBLIC_URL ?? parsed.CORS_ORIGIN,
}
