import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from './LocaleProvider'
import { STORAGE_KEY } from './context'
import { useLocale } from './useLocale'

/** Shows the resolved locale and one translated string, so both halves are readable in a test. */
function Probe() {
  const { locale, setLocale, t } = useLocale()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="greeting">{t('auth.signIn')}</span>
      <button onClick={() => setLocale('ru')}>to ru</button>
    </div>
  )
}

function withBrowserLanguages(languages: string[]) {
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages)
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.lang = 'en'
})

describe('locale resolution', () => {
  it('prefers a stored choice over the browser', () => {
    window.localStorage.setItem(STORAGE_KEY, 'en')
    withBrowserLanguages(['ru-RU'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
  })

  it('reads the browser when nothing is stored', () => {
    withBrowserLanguages(['ru-RU', 'en-US'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ru')
    expect(screen.getByTestId('greeting')).toHaveTextContent('Войти')
  })

  it('skips a browser language it does not ship and takes the next one', () => {
    withBrowserLanguages(['de-DE', 'uz-UZ'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('uz')
  })

  it('falls back to Uzbek when nothing is recognisable', () => {
    withBrowserLanguages(['de-DE'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('uz')
  })

  it('ignores a stored value it does not ship rather than throwing', () => {
    // A hand-edited or stale entry: the app must still render.
    window.localStorage.setItem(STORAGE_KEY, 'uz-Cyrl')
    withBrowserLanguages(['ru-RU'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ru')
  })

  it('still renders when storage is unavailable, as in a private window', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('site data blocked')
    })
    withBrowserLanguages(['ru-RU'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('ru')
  })
})

describe('changing the locale', () => {
  it('swaps the strings, remembers the choice and updates the document language', async () => {
    const user = userEvent.setup()
    withBrowserLanguages(['en-GB'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByTestId('greeting')).toHaveTextContent('Sign in')

    await user.click(screen.getByRole('button', { name: 'to ru' }))

    expect(screen.getByTestId('greeting')).toHaveTextContent('Войти')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('ru')
    // Drives screen-reader pronunciation, so a mismatch here is invisible on screen.
    expect(document.documentElement.lang).toBe('ru')
  })

  it('applies the choice for this session even when it cannot be saved', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    withBrowserLanguages(['en-GB'])

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'to ru' }))

    expect(screen.getByTestId('greeting')).toHaveTextContent('Войти')
  })
})

describe('outside the provider', () => {
  it('renders the authoring language rather than crashing', () => {
    render(<Probe />)

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(screen.getByTestId('greeting')).toHaveTextContent('Sign in')
  })
})
