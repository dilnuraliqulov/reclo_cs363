import { Navigate, Outlet } from 'react-router'
import { useAuth } from './useAuth'

/** Layout route: signed-in users are sent home instead of seeing sign-in or sign-up. */
export function GuestOnly() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
