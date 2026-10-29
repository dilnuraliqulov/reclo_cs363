import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@/i18n/catalog'
import { detail, idOf, json, renderModeration, stubAdminApi, summary } from '@/test/moderation'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Russian plural for moderation.waiting', () => {
  it.each([
    [1, '1 ожидает'],
    [2, '2 ожидают'],
    [4, '4 ожидают'],
    [5, '5 ожидают'],
    [11, '11 ожидают'],
    [21, '21 ожидает'],
    [22, '22 ожидают'],
    [25, '25 ожидают'],
  ])('%i -> %s', (count, expected) => {
    expect(translate('ru', 'moderation.waiting', { count })).toBe(expected)
  })

  it('renders the count in the header from the catalog', async () => {
    const list = Array.from({ length: 21 }, (_, i) => summary(i % 10, { id: idOf(i % 10) }))
    stubAdminApi({ list: [] }, ({ url }) =>
      url.pathname === '/api/admin/placements'
        ? json(200, { placements: list.slice(0, 20), total: 21 })
        : undefined,
    )

    renderModeration('/admin/moderation', 'ru')

    expect(await screen.findByText('21 ожидает')).toBeInTheDocument()
  })
})

describe.each([
  ['uz', "Navbat bo'sh", 'Tasdiqlash', "E'lon tasdiqlandi.", 'Rad etish'],
  ['ru', 'Очередь пуста', 'Одобрить', 'Объявление одобрено.', 'Отклонить'],
] as const)('in %s', (locale, emptyStart, approve, approvedToast, reject) => {
  it('localizes the empty state', async () => {
    stubAdminApi({ list: [] })

    renderModeration('/admin/moderation', locale)

    expect(await screen.findByText(new RegExp(emptyStart))).toBeInTheDocument()
    expect(screen.queryByText(/The queue is empty/)).toBeNull()
  })

  it('localizes the buttons and the success toast', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`, locale)
    expect(await screen.findByRole('button', { name: reject })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: approve }))

    expect(await screen.findByText(approvedToast)).toBeInTheDocument()
  })

  it('shows the server error code in this language, not the English sentence', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] }, ({ url }) =>
      url.pathname.endsWith('/approve')
        ? json(409, { error: 'The listing changed since you opened it', code: 'PLACEMENT_CHANGED' })
        : undefined,
    )
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`, locale)
    await user.click(await screen.findByRole('button', { name: approve }))

    const expected = translate(locale, 'error.PLACEMENT_CHANGED')
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('The listing changed since you opened it')).toBeNull()
  })

  it('localizes the reject dialog validation message with its bound', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })
    const user = userEvent.setup()

    renderModeration(`/admin/moderation/${idOf(1)}`, locale)
    await user.click(await screen.findByRole('button', { name: reject }))
    await user.click(
      await screen.findByRole('button', { name: translate(locale, 'moderation.reject.confirm') }),
    )

    expect(
      await screen.findByText(translate(locale, 'validation.reason.tooShort', { min: 10 })),
    ).toBeInTheDocument()
  })
})
