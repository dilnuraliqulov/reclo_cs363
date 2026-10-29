import { z } from 'zod'

/**
 * The locales the client UI ships in (`docs/i18n-design.md`). Uzbek is Latin script, which is the
 * standard for commercial use; `uz-Cyrl` would be a fourth catalog, not a redesign.
 *
 * English stays because it is the language every string is authored in, so it is the fallback for a
 * key not yet translated, and it is what the team develops against.
 */
export const localeSchema = z.enum(['uz', 'ru', 'en'])
export type Locale = z.infer<typeof localeSchema>

/** What a visitor gets when nothing stored or in the browser says otherwise: this is an Uzbek market. */
export const DEFAULT_LOCALE: Locale = 'uz'

/**
 * App locale to BCP-47 tag for `Intl`. Russian maps to `ru-UZ`, not `ru-RU`: the reader is in
 * Uzbekistan, so number grouping and date order stay local even when the words are Russian. All
 * three resolve with real data in the bundled ICU.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  uz: 'uz-UZ',
  ru: 'ru-UZ',
  en: 'en-GB',
}
