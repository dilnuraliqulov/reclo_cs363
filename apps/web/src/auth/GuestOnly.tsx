import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'
import { useNextPath } from './useNextPath'

/**
 * Layout route: signed-in users are sent away from sign-in and sign-up — to `?next=` when they
 * arrived from a placement, otherwise home.
 */
export function GuestOnly() {
  const { user, isLoading } = useAuth()
  const next = useNextPath()
  if (isLoading) return null
  if (user) return <Navigate to={next} replace />
  return <Outlet />
}
