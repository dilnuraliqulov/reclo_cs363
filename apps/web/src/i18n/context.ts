import { DEFAULT_LOCALE, localeSchema, type Locale } from '@reclo/shared'
import { createContext } from 'react'
import { translate, type MessageKey, type Values } from './catalog'

export const STORAGE_KEY = 'reclo.locale'

export interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Values) => string
}

/**
 * The default is `en`, not `DEFAULT_LOCALE`: it applies only to a component rendered outside the
 * provider, and the authoring language is the one sane answer there. The app root always wraps in
 * `LocaleProvider`, so a visitor gets `uz` unless they or their browser say otherwise.
 */
export const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key, values) => translate('en', key, values),
})

/** A stale or hand-edited stored value must not crash the app, so it is validated, not trusted. */
function storedLocale(): Locale | null {
  try {
    const parsed = localeSchema.safeParse(window.localStorage.getItem(STORAGE_KEY))
    return parsed.success ? parsed.data : null
  } catch {
    // Private mode, or site data blocked.
    return null
  }
}

function browserLocale(): Locale | null {
  for (const tag of navigator.languages ?? []) {
    const parsed = localeSchema.safeParse(tag.split('-')[0]?.toLowerCase())
    if (parsed.success) return parsed.data
  }
  return null
}

/** Stored choice, then the browser, then Uzbek. */
export function resolveLocale(): Locale {
  return storedLocale() ?? browserLocale() ?? DEFAULT_LOCALE
}
