import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useLocale'

/** Shows the signed-in email with a sign-out button, or sign-in and sign-up links. */
export function AuthControls() {
  const { user, isLoading, signOut } = useAuth()
  const t = useT()

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onError: () => toast.error(t('auth.signOutFailed')),
  })

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {/* Clients have an inquiry history; vendors and admins have their own screens. */}
        {user.role === 'CLIENT' && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link to="/inquiries">{t('auth.myInquiries')}</Link>
          </Button>
        )}
        {user.role === 'ADMIN' && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link to="/admin/moderation">{t('nav.moderation')}</Link>
          </Button>
        )}
        <span className="hidden text-xs sm:inline">
          {t('auth.signedInAs')} <span className="font-medium">{user.email}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        >
          {signOutMutation.isPending ? t('auth.signingOut') : t('auth.signOut')}
        </Button>
      </div>
    )
  }
  if (isLoading) return null
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
        <Link to="/sign-in">{t('auth.signIn')}</Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
        <Link to="/sign-up">{t('auth.signUp')}</Link>
      </Button>
    </div>
  )
}
