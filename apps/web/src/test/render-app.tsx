import type { Locale } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '@/App'
import { LocationProbe } from './LocationProbe'
import { pinLocale } from './locale'

/**
 * The whole app at `path`, so a test goes through the real routes and guards. A `<output>` shows the
 * current location, which is how a test sees a redirect.
 */
export function renderApp(path: string, locale: Locale = 'en') {
  pinLocale(locale)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
