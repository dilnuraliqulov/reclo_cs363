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
})
