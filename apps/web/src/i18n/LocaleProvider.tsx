import type { Locale } from '@reclo/shared'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate } from './catalog'
import { LocaleContext, resolveLocale, STORAGE_KEY, type LocaleContextValue } from './context'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveLocale)

  // Drives hyphenation, screen-reader pronunciation and the browser's translate prompt. Leaving it
  // at the document's default while rendering Russian is the one i18n bug that is invisible on
  // screen and obvious to a screen-reader user.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The choice still applies for this session; it just will not be remembered.
    }
  }, [])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale, setLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
