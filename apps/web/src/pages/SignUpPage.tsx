import { zodResolver } from '@hookform/resolvers/zod'
import { registerRequestSchema, type RegisterRequest } from '@reclo/shared'
import { useMutation } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { useNextPath } from '@/auth/useNextPath'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { useT } from '@/i18n/useLocale'
import { ApiRequestError, register } from '@/lib/api'
import { useMessages } from '@/lib/messages'

export function SignUpPage() {
  const t = useT()
  const { apiErrorText, fieldError } = useMessages()
  const { setUser } = useAuth()
  const navigate = useNavigate()
  // Set when the client was sent here from a placement, so they land back on it.
  const next = useNextPath()
  // Carried across the pair, but only when there is somewhere to return to.
  const otherPath = next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`
  const form = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: { email: '', password: '' },
  })

  const signUp = useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      setUser(user)
      void navigate(next, { replace: true })
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.fieldErrors) {
        for (const [name, messages] of Object.entries(error.fieldErrors)) {
          if ((name === 'email' || name === 'password') && messages[0]) {
            form.setError(name, { message: messages[0] })
          }
        }
      }
      toast.error(apiErrorText(error))
    },
  })

  return (
    <main className="relative flex min-h-svh items-center justify-center p-6">
      {/* These pages have no header, and a visitor who cannot read them has to be able
          to switch language before signing in. */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('signUp.title')}</CardTitle>
          <CardDescription>{t('signUp.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => signUp.mutate(values))} noValidate>
            <FieldGroup>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="sign-up-email">{t('common.email')}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-up-email"
                      type="email"
                      autoComplete="email"
                      disabled={signUp.isPending}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="sign-up-password">{t('common.password')}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-up-password"
                      type="password"
                      autoComplete="new-password"
                      disabled={signUp.isPending}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{t('signUp.passwordHint')}</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldError(fieldState.error)]} />}
                  </Field>
                )}
              />
              <Button type="submit" disabled={signUp.isPending}>
                {signUp.isPending ? t('signUp.submitting') : t('auth.signUp')}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
          {t('signUp.haveAccount')}
          <Link to={otherPath} className="font-medium text-foreground underline underline-offset-4">
            {t('auth.signIn')}
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
