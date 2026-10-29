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

  it('keeps the sentence of a well-formed error body whose code this build does not know', () => {
    // A newer server (KAN-79): its sentence is the only description there is.
    const body = { error: 'Something specific went wrong', code: 'NEW_CODE' }
    const error = new ApiRequestError(500, body.error, undefined, body)

    expect(messages().apiErrorText(error)).toBe('Something specific went wrong')
  })

  it.each([
    [0, 'en', 'Cannot reach the server. Check your connection and try again.'],
    [0, 'ru', 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.'],
    [429, 'uz', "Juda ko'p urinish, keyinroq qayta urinib ko'ring"],
    [502, 'en', 'Something went wrong'],
  ] as const)(
    'answers status %i in %s when there is no error body to read',
    (status, locale, text) => {
      // No response at all, or an HTML page from a proxy: the client's own English must not show.
      const error = new ApiRequestError(status, 'Something went wrong. Please try again.')

      expect(messages(locale).apiErrorText(error)).toBe(text)
    },
  )

  it('answers a plain error with the generic message, not its text', () => {
    expect(messages().apiErrorText(new Error('Cannot reach the server'))).toBe(
      'Something went wrong',
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

  it('reads anything that is not a known code as "not valid", never as the sentence', () => {
    expect(messages().fieldErrorText('Invalid input')).toBe('This value is not valid')
    expect(messages('ru').fieldErrorText('validation.from.the.future')).toBe(
      'Недопустимое значение',
    )
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
