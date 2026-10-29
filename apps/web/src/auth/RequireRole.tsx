import type { Role } from '@reclo/shared'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'

/**
 * Layout route for screens that belong to one role. Nest it inside `RequireAuth`, which handles the
 * signed-out visitor; anyone signed in with another role goes home. The API refuses them as well
 * (`403`), so this is about not showing a screen that cannot work, not about security.
 */
export function RequireRole({ role }: { role: Role }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user?.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}
