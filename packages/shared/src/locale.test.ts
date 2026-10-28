import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, INTL_LOCALE, localeSchema } from './locale'

describe('locales', () => {
  it('defaults to Uzbek, which is what this market reads', () => {
    expect(localeSchema.safeParse(DEFAULT_LOCALE).success).toBe(true)
    expect(DEFAULT_LOCALE).toBe('uz')
  })

  it('maps every locale to an Intl tag', () => {
    for (const locale of localeSchema.options) {
      expect(INTL_LOCALE[locale]).toBeTruthy()
    }
  })

  it('keeps Russian readers on Uzbek number and date conventions', () => {
    // ru-UZ, not ru-RU: the words change, the reader's country does not.
    expect(INTL_LOCALE.ru).toBe('ru-UZ')
  })

  it.each(['uz', 'ru', 'en'] as const)('resolves %s against real Intl data', (locale) => {
    const tag = INTL_LOCALE[locale]
    const resolved = new Intl.DateTimeFormat(tag).resolvedOptions().locale

    // A tag the runtime has no data for silently resolves to the default, which would make dates
    // and prices read as English while the words around them are not.
    expect(resolved.split('-')[0]).toBe(locale)
  })

  it('rejects a locale it does not ship, so a stale stored value cannot be trusted', () => {
    expect(localeSchema.safeParse('de').success).toBe(false)
    expect(localeSchema.safeParse('uz-Cyrl').success).toBe(false)
  })
})
