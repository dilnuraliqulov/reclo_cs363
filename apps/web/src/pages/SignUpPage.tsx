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
import { ApiRequestError, register } from '@/lib/api'

// All user-visible strings for this page, in one place for the future translation task.
const copy = {
  title: 'Create your account',
  description: 'Sign up to browse and request billboards',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 8 characters',
  submit: 'Sign up',
  submitting: 'Creating account…',
  haveAccount: 'Already have an account?',
  signIn: 'Sign in',
}

export function SignUpPage() {
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
      toast.error(error.message)
    },
  })

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => signUp.mutate(values))} noValidate>
            <FieldGroup>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="sign-up-email">{copy.email}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-up-email"
                      type="email"
                      autoComplete="email"
                      disabled={signUp.isPending}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="sign-up-password">{copy.password}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-up-password"
                      type="password"
                      autoComplete="new-password"
                      disabled={signUp.isPending}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{copy.passwordHint}</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button type="submit" disabled={signUp.isPending}>
                {signUp.isPending ? copy.submitting : copy.submit}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
          {copy.haveAccount}
          <Link to={otherPath} className="font-medium text-foreground underline underline-offset-4">
            {copy.signIn}
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
