import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * The message for a failure that belongs to no single field: the network, a rate limit, a server
 * error, wrong credentials. It is an `Alert`, so it is announced when it appears, and unlike a toast
 * it stays until the next attempt.
 */
export function FormError({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null
  return (
    <Alert variant="destructive" id={id} data-testid="form-error">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
