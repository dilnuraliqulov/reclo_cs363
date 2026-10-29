import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '@/i18n/context'
import { renderWithLocale } from '@/test/locale'
import { LanguageSwitcher } from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  it('shows the active language as a code', () => {
    renderWithLocale(<LanguageSwitcher />, 'ru')

    expect(screen.getByRole('combobox')).toHaveTextContent('RU')
  })

  it('names each language in its own language', async () => {
    const user = userEvent.setup()
    renderWithLocale(<LanguageSwitcher />, 'en')

    await user.click(screen.getByRole('combobox'))

    // Someone who cannot read the current UI still has to find their own language.
    expect(await screen.findByRole('option', { name: "O'zbekcha" })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Русский' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
  })

  it('switches the language and remembers the choice', async () => {
    const user = userEvent.setup()
    renderWithLocale(<LanguageSwitcher />, 'en')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Русский' }))

    expect(screen.getByRole('combobox')).toHaveTextContent('RU')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('ru')
  })

  it('carries a label, since the trigger is only a two-letter code', () => {
    renderWithLocale(<LanguageSwitcher />, 'en')

    expect(screen.getByRole('combobox')).toHaveAccessibleName('Language')
  })

  it('puts the code inside a SelectValue, which Radix needs to place the open list', () => {
    // A structural assertion, not a behavioural one, and deliberately so. Radix positions the
    // open list by measuring the trigger's value node; with the code written straight into the
    // trigger that node is absent, `position()` returns early, and the list mounts unpositioned
    // and invisible — the trigger looks dead in a browser. jsdom has no layout, so every
    // behavioural test here passed while that bug was live. This is the part a test can hold.
    renderWithLocale(<LanguageSwitcher />, 'uz')

    const value = screen.getByRole('combobox').querySelector('[data-slot="select-value"]')
    expect(value).not.toBeNull()
    expect(value).toHaveTextContent('UZ')
  })
})
