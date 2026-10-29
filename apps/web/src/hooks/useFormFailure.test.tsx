import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiRequestError } from '@/lib/api'
import { LocaleWrapper, pinLocale } from '@/test/locale'
import { useFormFailure } from './useFormFailure'

afterEach(() => {
  window.localStorage.clear()
})

function setup(locale: 'en' | 'uz' | 'ru' = 'en') {
  pinLocale(locale)
  return renderHook(
    () => {
      const form = useForm({ defaultValues: { email: '', password: '' } })
      return { form, failure: useFormFailure(form), errors: form.formState.errors }
    },
    { wrapper: LocaleWrapper },
  )
}

const apiError = (
  status: number,
  code: ConstructorParameters<typeof ApiRequestError>[4],
  fieldErrors?: Record<string, string[]>,
) => new ApiRequestError(status, 'English from the server', fieldErrors, null, code)

describe('useFormFailure', () => {
  it('puts field error codes on their fields and sets no form message', () => {
    const { result } = setup()

    let message: string | null = 'unset'
    act(() => {
      message = result.current.failure.fail(
        apiError(400, 'INVALID_INPUT', { email: ['validation.email.invalid'] }),
      )
    })

    expect(message).toBeNull()
    expect(result.current.failure.formError).toBeNull()
    expect(result.current.errors.email?.message).toBe('validation.email.invalid')
  })

  it('maps field errors on a 409 as well, which is how EMAIL_TAKEN arrives', () => {
    const { result } = setup()

    act(() => {
      result.current.failure.fail(
        apiError(409, 'EMAIL_TAKEN', { email: ['validation.email.taken'] }),
      )
    })

    expect(result.current.errors.email?.message).toBe('validation.email.taken')
    expect(result.current.failure.formError).toBeNull()
  })

  it('reports a _form code as the form message, localized', () => {
    const { result } = setup('ru')

    act(() => {
      result.current.failure.fail(apiError(400, 'INVALID_INPUT', { _form: ['validation.invalid'] }))
    })

    expect(result.current.failure.formError).toBe('Недопустимое значение')
  })

  it('reports a field this form does not have as a form message, not silently', () => {
    const { result } = setup()

    act(() => {
      result.current.failure.fail(
        apiError(400, 'INVALID_INPUT', { nickname: ['validation.invalid'] }),
      )
    })

    expect(result.current.failure.formError).toBe('Invalid input')
  })

  it.each([
    ['en', 429, 'RATE_LIMITED', 'Too many attempts, try again later'],
    ['uz', 429, 'RATE_LIMITED', "Juda ko'p urinish, keyinroq qayta urinib ko'ring"],
    ['ru', 500, 'INTERNAL', 'Что-то пошло не так'],
  ] as const)('shows the %s message for %i %s as a form message', (locale, status, code, text) => {
    const { result } = setup(locale)

    act(() => {
      result.current.failure.fail(apiError(status, code))
    })

    expect(result.current.failure.formError).toBe(text)
    expect(result.current.errors.email).toBeUndefined()
  })

  it('shows a localized message, not English, when there was no response at all', () => {
    const { result } = setup('ru')

    act(() => {
      result.current.failure.fail(new ApiRequestError(0, 'Cannot reach the server. Check it.'))
    })

    expect(result.current.failure.formError).toBe(
      'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.',
    )
  })

  it('clears the form message on the next attempt', () => {
    const { result } = setup()
    act(() => {
      result.current.failure.fail(apiError(500, 'INTERNAL'))
    })
    expect(result.current.failure.formError).not.toBeNull()

    act(() => result.current.failure.clear())

    expect(result.current.failure.formError).toBeNull()
  })
})
