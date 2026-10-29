import { INTL_LOCALE, localeSchema } from '@reclo/shared'
import { describe, expect, it } from 'vitest'
import { catalogs, translate, type MessageKey } from './catalog'
import { en } from './en'

const KEYS = Object.keys(en) as MessageKey[]

/** The placeholders a template expects, e.g. "{count} month" -> ["count"]. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()
}

/** Every string in an entry, whether it is one message or a set of plural forms. */
function forms(entry: unknown): string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry as Record<string, string>)
}

describe('the catalogs', () => {
  it.each(localeSchema.options)('%s covers every key with a non-empty string', (locale) => {
    const catalog = catalogs[locale] as Record<MessageKey, unknown>

    for (const key of KEYS) {
      for (const form of forms(catalog[key])) {
        expect(form, `${locale} ${key}`).toBeTruthy()
      }
    }
  })

  it.each(localeSchema.options)('%s keeps the placeholders the source uses', (locale) => {
    const catalog = catalogs[locale] as Record<MessageKey, unknown>

    // A translator dropping `{count}` or `{date}` loses the number or the date silently — the
    // sentence still reads, so nothing else would catch it.
    for (const key of KEYS) {
      const expected = placeholders(forms(en[key])[0] ?? '')
      for (const form of forms(catalog[key])) {
        expect(placeholders(form), `${locale} ${key}`).toEqual(expected)
      }
    }
  })

  it.each(localeSchema.options)('%s declares exactly the plural forms CLDR gives it', (locale) => {
    const catalog = catalogs[locale] as Record<MessageKey, unknown>
    const expected = new Intl.PluralRules(INTL_LOCALE[locale]).resolvedOptions().pluralCategories

    // The type claims these categories; this is what makes the claim true at runtime, and what
    // fails if a locale's rules ever change under us.
    for (const key of KEYS) {
      const entry = catalog[key]
      if (typeof entry === 'string') continue
      expect(Object.keys(entry as object).sort(), `${locale} ${key}`).toEqual([...expected].sort())
    }
  })

  it('counts the same keys in every locale, so none carries an extra', () => {
    for (const locale of localeSchema.options) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual([...KEYS].sort())
    }
  })
})

describe('translate', () => {
  it('interpolates a named value', () => {
    expect(translate('en', 'inquiry.form.duplicateOn', { date: '26 Oct 2026' })).toContain(
      '26 Oct 2026',
    )
  })

  it('leaves a placeholder it was given no value for, rather than printing undefined', () => {
    expect(translate('en', 'inquiry.form.duplicateOn')).toContain('{date}')
  })

  it('selects the English plural forms', () => {
    expect(translate('en', 'inquiry.months', { count: 1 })).toBe('1 month')
    expect(translate('en', 'inquiry.months', { count: 3 })).toBe('3 months')
  })

  // The reason plural categories exist at all. 21 takes the same form as 1, which is what a
  // hand-written `count === 1 ? singular : plural` gets wrong.
  it.each([
    [1, '1 месяц'],
    [3, '3 месяца'],
    [5, '5 месяцев'],
    [11, '11 месяцев'],
    [21, '21 месяц'],
    [24, '24 месяца'],
  ])('selects the Russian form for %i', (count, expected) => {
    expect(translate('ru', 'inquiry.months', { count })).toBe(expected)
  })

  it('uses one Uzbek form for every count, because the noun does not inflect', () => {
    expect(translate('uz', 'inquiry.months', { count: 1 })).toBe('1 oy')
    expect(translate('uz', 'inquiry.months', { count: 12 })).toBe('12 oy')
  })

  it('falls back to English for a key a locale somehow lacks', () => {
    // A half-finished translation should read oddly, never leak an identifier at a user.
    const gaps = { ...catalogs.ru } as Record<string, unknown>
    delete gaps['auth.signIn']
    const original = catalogs.ru
    try {
      Object.assign(catalogs, { ru: gaps })
      expect(translate('ru', 'auth.signIn')).toBe(en['auth.signIn'])
    } finally {
      Object.assign(catalogs, { ru: original })
    }
  })
})
