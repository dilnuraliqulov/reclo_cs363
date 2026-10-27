import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'

// All user-visible strings for these controls, in one place for the future translation task.
const copy = {
  signedInAs: 'Signed in as',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  signOutFailed: 'Could not sign out. Please try again.',
  inquiries: 'My inquiries',
  signIn: 'Sign in',
  signUp: 'Sign up',
}

/** Shows the signed-in email with a sign-out button, or sign-in and sign-up links. */
export function AuthControls() {
  const { user, isLoading, signOut } = useAuth()

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onError: () => toast.error(copy.signOutFailed),
  })

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* Clients have an inquiry history; vendors and admins have their own screens. */}
        {user.role === 'CLIENT' && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link to="/inquiries">{copy.inquiries}</Link>
          </Button>
        )}
        <span className="hidden text-xs sm:inline">
          {copy.signedInAs} <span className="font-medium">{user.email}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        >
          {signOutMutation.isPending ? copy.signingOut : copy.signOut}
        </Button>
      </div>
    )
  }
  if (isLoading) return null
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
        <Link to="/sign-in">{copy.signIn}</Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
        <Link to="/sign-up">{copy.signUp}</Link>
      </Button>
    </div>
  )
}
