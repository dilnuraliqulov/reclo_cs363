import type { Locale } from '@reclo/shared'
import { render, type RenderOptions } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { STORAGE_KEY } from '@/i18n/context'

/**
 * Pins a locale by seeding the stored choice rather than by a test-only prop, so a test exercises
 * the same resolution path a returning visitor does.
 *
 * `en` is the default, and is also what the context falls back to outside a provider, so the suites
 * written before this task keep asserting English copy. A test that cares about language says which
 * one it means.
 */
export function pinLocale(locale: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, locale)
}

export function LocaleWrapper({ children }: { children: ReactNode }) {
  return createElement(LocaleProvider, null, children)
}

export function renderWithLocale(
  ui: ReactNode,
  locale: Locale = 'en',
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  pinLocale(locale)
  return render(createElement(LocaleProvider, null, ui), options)
}
