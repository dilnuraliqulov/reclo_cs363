import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detail, idOf, json, renderModeration, stubAdminApi, summary } from '@/test/moderation'

/**
 * KAN-82: the reject dialog against the validation contract. A failed reject is shown inside the
 * dialog, which stays open for a retry, in the reader's language and without the server's English.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const REASON = 'The photo is blurry and the address is wrong'
const REASON_RU = 'Фотография размыта, а адрес указан неверно'

async function openDialog(user: ReturnType<typeof userEvent.setup>, button = 'Reject') {
  await user.click(await screen.findByRole('button', { name: button }))
  return screen.findByRole('dialog')
}

describe('the reject dialog: validation and server failures', () => {
  it('ties the too-short message to the reason box, in Russian', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`, 'ru')
    const dialog = await openDialog(user, 'Отклонить')
    await user.type(within(dialog).getByLabelText('Причина для продавца'), 'коротко')
    await user.click(within(dialog).getByRole('button', { name: 'Отклонить объявление' }))

    const box = within(dialog).getByLabelText('Причина для продавца')
    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'))
    const message = document.getElementById(box.getAttribute('aria-describedby')!)
    expect(message).toHaveTextContent('Причина должна содержать не менее 10 символов')
    expect(message).toHaveAttribute('role', 'alert')
  })

  it('puts a server field error for the reason next to the box', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
      url.pathname.endsWith('/reject')
        ? json(400, {
            error: 'Invalid input',
            code: 'INVALID_INPUT',
            fieldErrors: { reason: ['validation.reason.tooLong'] },
          })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))

    expect(await within(dialog).findByText('Reason must be at most 500 characters')).toBeVisible()
    expect(within(dialog).getByLabelText('Reason for the vendor')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(within(dialog).queryByTestId('form-error')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each([
    ['en', 'Reject', 'Reject listing', 'Reason for the vendor', REASON, 429, 'RATE_LIMITED'],
    ['ru', 'Отклонить', 'Отклонить объявление', 'Причина для продавца', REASON_RU, 500, 'INTERNAL'],
  ] as const)(
    'shows a %s form message inside the open dialog for a %i, and the text survives',
    async (locale, open, confirm, label, reason, status, code) => {
      stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
        url.pathname.endsWith('/reject')
          ? json(status, { error: 'English from the server', code })
          : undefined,
      )
      const user = userEvent.setup()

      renderModeration(`/admin/moderation/${idOf(1)}`, locale)
      const dialog = await openDialog(user, open)
      await user.type(within(dialog).getByLabelText(label), reason)
      await user.click(within(dialog).getByRole('button', { name: confirm }))

      const alert = await within(dialog).findByTestId('form-error')
      expect(alert).toHaveTextContent(
        locale === 'en' ? 'Too many attempts, try again later' : 'Что-то пошло не так',
      )
      expect(alert).not.toHaveTextContent('English from the server')
      expect(within(dialog).getByLabelText(label)).toHaveValue(reason)
      expect(within(dialog).getByRole('button', { name: confirm })).toBeEnabled()
    },
  )

  it('does not repeat the failure in a toast, and drops it when the dialog is reopened', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
      url.pathname.endsWith('/reject')
        ? json(429, { error: 'slow down', code: 'RATE_LIMITED' })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`)
    let dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('Reason for the vendor'), REASON)
    await user.click(within(dialog).getByRole('button', { name: 'Reject listing' }))
    await within(dialog).findByTestId('form-error')

    // One copy of the message, the one in the dialog.
    expect(screen.getAllByText('Too many attempts, try again later')).toHaveLength(1)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    dialog = await openDialog(user)
    expect(within(dialog).queryByTestId('form-error')).not.toBeInTheDocument()
  })
})
