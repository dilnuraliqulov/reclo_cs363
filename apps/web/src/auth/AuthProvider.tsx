import type { PublicUser } from '@reclo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import { fetchMe, logout } from '@/lib/api'
import { AuthContext, type AuthState } from './useAuth'

const ME_KEY = ['auth', 'me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, retry: false, staleTime: Infinity })

  const setUser = useCallback(
    (user: PublicUser) => queryClient.setQueryData(ME_KEY, user),
    [queryClient],
  )
  const signOut = useCallback(async () => {
    await logout()
    queryClient.setQueryData(ME_KEY, null)
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({ user: me.data ?? null, isLoading: me.isPending, setUser, signOut }),
    [me.data, me.isPending, setUser, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
