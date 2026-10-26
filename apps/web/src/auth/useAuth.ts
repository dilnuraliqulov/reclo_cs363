import type { PublicUser } from '@reclo/shared'
import { createContext, useContext } from 'react'

export interface AuthState {
  /** The signed-in user, or null when signed out (or while loading). */
  user: PublicUser | null
  /** True until the first GET /api/auth/me has answered. */
  isLoading: boolean
  /** Call after a successful register or login. */
  setUser: (user: PublicUser) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
