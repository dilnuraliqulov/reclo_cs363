import { createHash, randomBytes } from 'node:crypto'

export const SESSION_COOKIE = 'reclo_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Only this hash is stored; a database leak does not expose usable cookies. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
