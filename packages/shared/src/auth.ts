import { z } from 'zod'
import { VALIDATION_CODES } from './errors'

export const roleSchema = z.enum(['CLIENT', 'VENDOR', 'ADMIN'])
export type Role = z.infer<typeof roleSchema>

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

/** Trimmed and lowercased, so "  Foo@Bar.com " and "foo@bar.com" are the same account. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email(VALIDATION_CODES.emailInvalid))

/** Public sign-up. There is deliberately no `role` here: new accounts are always CLIENT. */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, VALIDATION_CODES.passwordTooShort)
    .max(PASSWORD_MAX_LENGTH, VALIDATION_CODES.passwordTooLong),
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, VALIDATION_CODES.passwordRequired).max(PASSWORD_MAX_LENGTH),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
})
export type PublicUser = z.infer<typeof publicUserSchema>

export const authResponseSchema = z.object({ user: publicUserSchema })
export type AuthResponse = z.infer<typeof authResponseSchema>
