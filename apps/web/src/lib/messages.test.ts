import { errorCodeSchema, VALIDATION_CODES, validationCodeSchema } from '@reclo/shared'
import { renderHook } from '@testing-library/react'
import type { Locale } from '@reclo/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleWrapper, pinLocale } from '@/test/locale'
import { ApiRequestError } from './api'
import { useMessages } from './messages'

function messages(locale: Locale = 'en') {
  pinLocale(locale)
  return renderHook(() => useMessages(), { wrapper: LocaleWrapper }).result.current
}

afterEach(() => {
  window.localStorage.clear()
})

describe('apiErrorText', () => {
  it('prefers the code over the English string the response carried', () => {
    const error = new ApiRequestError(
      401,
      'Not authenticated',
      undefined,
      null,
      'INVALID_CREDENTIALS',
    )

    expect(messages().apiErrorText(error)).toBe('Invalid email or password')
  })

  it('answers in the active locale', () => {
    const error = new ApiRequestError(
      429,
      'Too many attempts, try again later',
      undefined,
      null,
      'RATE_LIMITED',
    )

    expect(messages('ru').apiErrorText(error)).toBe('Слишком много попыток, попробуйте позже')
    expect(messages('uz').apiErrorText(error)).toBe(
      "Juda ko'p urinish, keyinroq qayta urinib ko'ring",
    )
  })

  it('falls back to the response string when there is no code', () => {
    // A route that has not been migrated, or an older server.
    const error = new ApiRequestError(500, 'Something specific went wrong')

    expect(messages().apiErrorText(error)).toBe('Something specific went wrong')
  })

  it('falls back for a plain error, such as a network failure', () => {
    expect(messages().apiErrorText(new Error('Cannot reach the server'))).toBe(
      'Cannot reach the server',
    )
  })

  it('never returns an empty string, even for something that is not an error', () => {
    expect(messages().apiErrorText('nonsense')).toBe('Something went wrong')
  })

  it.each(['uz', 'ru', 'en'] as const)('has %s words for every code the API can send', (locale) => {
    const { apiErrorText } = messages(locale)

    for (const code of errorCodeSchema.options) {
      const text = apiErrorText(new ApiRequestError(400, 'fallback', undefined, null, code))
      expect(text).toBeTruthy()
      // A bare code reaching the screen is the failure the catalogs exist to prevent.
      expect(text).not.toBe(`error.${code}`)
      expect(text).not.toBe('fallback')
    }
  })
})

describe('fieldErrorText', () => {
  it('turns a validation code into the sentence for this locale', () => {
    expect(messages().fieldErrorText(VALIDATION_CODES.phoneUz)).toBe(
      'Enter a valid Uzbek number, e.g. +998 90 123 45 67',
    )
    expect(messages('ru').fieldErrorText(VALIDATION_CODES.phoneUz)).toBe(
      'Введите корректный узбекский номер, например +998 90 123 45 67',
    )
  })

  it('regains the interpolation the code dropped on the wire', () => {
    // The bound is read back from the shared constant rather than written into each translation.
    expect(messages().fieldErrorText(VALIDATION_CODES.messageTooShort)).toBe(
      'Message must be at least 10 characters',
    )
    expect(messages('ru').fieldErrorText(VALIDATION_CODES.passwordTooShort)).toBe(
      'Пароль должен содержать не менее 8 символов',
    )
  })

  it('passes a sentence through, since Zod built-ins were never customised', () => {
    expect(messages().fieldErrorText('Invalid input')).toBe('Invalid input')
  })

  it('leaves undefined alone, so a valid field renders nothing', () => {
    expect(messages().fieldErrorText(undefined)).toBeUndefined()
  })

  it.each(['uz', 'ru', 'en'] as const)('has %s words for every validation code', (locale) => {
    const { fieldErrorText } = messages(locale)

    for (const code of validationCodeSchema.options) {
      const text = fieldErrorText(code)
      expect(text).toBeTruthy()
      expect(text).not.toBe(code)
      // An un-substituted placeholder is as broken as a missing translation.
      expect(text).not.toMatch(/\{\w+\}/)
    }
  })
})

describe('fieldError', () => {
  it('wraps the text in the shape FieldError takes', () => {
    expect(messages().fieldError({ message: VALIDATION_CODES.nameRequired })).toEqual({
      message: 'Enter your name',
    })
  })

  it('tolerates a missing error object', () => {
    expect(messages().fieldError(undefined)).toEqual({ message: undefined })
  })
})
