import { zodResolver } from '@hookform/resolvers/zod'
import { loginRequestSchema, type LoginRequest } from '@reclo/shared'
import { useMutation } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiRequestError, login } from '@/lib/api'

// All user-visible strings for this page, in one place for the future translation task.
const copy = {
  title: 'Welcome back',
  description: 'Sign in to your account',
  email: 'Email',
  password: 'Password',
  submit: 'Sign in',
  submitting: 'Signing in…',
  noAccount: 'No account yet?',
  signUp: 'Sign up',
}

export function SignInPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  })

  const signIn = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      setUser(user)
      void navigate('/', { replace: true })
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
          <form onSubmit={form.handleSubmit((values) => signIn.mutate(values))} noValidate>
            <FieldGroup>
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="sign-in-email">{copy.email}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-in-email"
                      type="email"
                      autoComplete="email"
                      disabled={signIn.isPending}
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
                    <FieldLabel htmlFor="sign-in-password">{copy.password}</FieldLabel>
                    <Input
                      {...field}
                      id="sign-in-password"
                      type="password"
                      autoComplete="current-password"
                      disabled={signIn.isPending}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Button type="submit" disabled={signIn.isPending}>
                {signIn.isPending ? copy.submitting : copy.submit}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
          {copy.noAccount}
          <Link to="/sign-up" className="font-medium text-foreground underline underline-offset-4">
            {copy.signUp}
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
