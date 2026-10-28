import type { Locale } from '@reclo/shared'
import { en } from './en'
import { ru } from './ru'
import { uz } from './uz'

export type MessageKey = keyof typeof en

/**
 * The plural categories each locale actually uses, from CLDR. `locale.test.ts` asserts these match
 * `Intl.PluralRules`, so the type cannot quietly disagree with the runtime that selects from it.
 *
 * `other` is in every locale, which is what makes it a safe fallback when a number falls in a
 * category the catalog does not list — Russian's `other` covers fractions such as 1.5.
 */
export type PluralCategories = {
  uz: 'one' | 'other'
  ru: 'one' | 'few' | 'many' | 'other'
  en: 'one' | 'other'
}

type Catalog<L extends Locale> = {
  [K in MessageKey]: (typeof en)[K] extends string ? string : Record<PluralCategories[L], string>
}

export const catalogs: { [L in Locale]: Catalog<L> } = { uz, ru, en }

/** Keys whose entry is a set of plural forms, so `t` can require a `count` for exactly those. */
export type CountedKey = {
  [K in MessageKey]: (typeof en)[K] extends string ? never : K
}[MessageKey]

export type Values = Record<string, string | number>

function interpolate(template: string, values: Values | undefined): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  )
}

/**
 * One message in one locale. A counted key selects its form with `Intl.PluralRules` — Russian needs
 * `one`/`few`/`many` and puts 21 back in `one`, which no hand-written `=== 1` check gets right.
 *
 * A key the locale somehow lacks falls back to English rather than rendering the key itself: a
 * half-finished translation should read oddly, not leak an identifier at a user.
 */
export function translate(locale: Locale, key: MessageKey, values?: Values): string {
  const entry = (catalogs[locale] as Record<MessageKey, unknown>)[key] ?? en[key]

  if (typeof entry === 'string') return interpolate(entry, values)

  const forms = entry as Record<string, string | undefined>
  const count = Number(values?.count ?? 0)
  const category = new Intl.PluralRules(locale).select(count)
  const form = forms[category] ?? forms.other ?? Object.values(forms)[0] ?? key
  return interpolate(form, values)
}
