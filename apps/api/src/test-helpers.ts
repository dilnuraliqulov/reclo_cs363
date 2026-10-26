import type { PublicUser } from '@reclo/shared'
import { EmailTakenError, type AuthStore, type StoredSession, type StoredUser } from './auth/store'

/** In-memory AuthStore for route tests, so they run without a database. */
export function createMemoryAuthStore() {
  const users: StoredUser[] = []
  const sessions = new Map<string, StoredSession & { userId: string }>()
  let nextId = 1

  const store: AuthStore = {
    async findUserByEmail(email) {
      return users.find((user) => user.email === email) ?? null
    },
    async createClient({ email, passwordHash }) {
      if (users.some((user) => user.email === email)) throw new EmailTakenError()
      const user: StoredUser = { id: `user-${nextId++}`, email, role: 'CLIENT', passwordHash }
      users.push(user)
      return { id: user.id, email: user.email, role: user.role }
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      const user = users.find((candidate) => candidate.id === userId)
      if (!user) throw new Error('unknown user')
      const publicUser = { id: user.id, email: user.email, role: user.role }
      sessions.set(tokenHash, { id: `session-${nextId++}`, userId, expiresAt, user: publicUser })
    },
    async findSessionByTokenHash(tokenHash) {
      return sessions.get(tokenHash) ?? null
    },
    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash)
    },
  }

  return {
    store,
    users,
    sessions,
    /** Test shortcut: change a user's role directly (the API cannot do this). */
    setRole(email: string, role: PublicUser['role']) {
      const user = users.find((candidate) => candidate.email === email)
      if (!user) throw new Error(`no user ${email}`)
      user.role = role
      for (const session of sessions.values()) {
        if (session.userId === user.id) session.user = { ...session.user, role }
      }
    },
  }
}
