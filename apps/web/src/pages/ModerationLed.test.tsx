import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detail, idOf, renderModeration, stubAdminApi, summary } from '@/test/moderation'

afterEach(() => {
  vi.unstubAllGlobals()
})

const led = { type: 'LED_SCREEN', ledDurationSeconds: 15, ledPlaysPerDay: 240 } as const

describe.each([
  ['en', 'Ad length', '15 s', 'Plays per day'],
  ['uz', 'Reklama davomiyligi', '15 soniya', "Kuniga ko'rsatilishi"],
  ['ru', 'Длительность ролика', '15 с', 'Показов в день'],
] as const)('LED details in %s', (locale, durationLabel, durationValue, playsLabel) => {
  it('shows ad length and plays per day for an LED screen', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1, led)] })

    renderModeration(`/admin/moderation/${idOf(1)}`, locale)

    expect(await screen.findByText(durationLabel)).toBeInTheDocument()
    expect(screen.getByText(durationValue)).toBeInTheDocument()
    expect(screen.getByText(playsLabel).nextElementSibling).toHaveTextContent('240')
  })
})

describe('LED details visibility', () => {
  it('does not show LED rows for a billboard', async () => {
    stubAdminApi({ list: [summary(1)], details: [detail(1)] })

    renderModeration(`/admin/moderation/${idOf(1)}`)

    expect(await screen.findByText('Lighting')).toBeInTheDocument()
    expect(screen.queryByText('Ad length')).toBeNull()
    expect(screen.queryByText('Plays per day')).toBeNull()
  })

  it('shows a dash when an LED screen has no values', async () => {
    stubAdminApi({
      list: [summary(1)],
      details: [detail(1, { type: 'LED_SCREEN', ledDurationSeconds: null, ledPlaysPerDay: null })],
    })

    renderModeration(`/admin/moderation/${idOf(1)}`)

    expect(await screen.findByText('Ad length')).toBeInTheDocument()
    expect(screen.getByText('Ad length').nextElementSibling).toHaveTextContent('—')
    expect(screen.getByText('Plays per day').nextElementSibling).toHaveTextContent('—')
  })
})
