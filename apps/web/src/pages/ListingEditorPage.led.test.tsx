import type { VendorPlacement } from '@reclo/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
  PLACEMENT_ID,
  json,
  stubVendorApi,
  vendorPlacement,
  type RecordedCall,
} from '@/test/vendor-api'

const BASE = '/api/vendor/placements'
const EDIT = `/vendor/placements/${PLACEMENT_ID}/edit`
const DURATION = 'Ad length (seconds)'
const PLAYS = 'Plays per day'
const LED = { type: 'LED_SCREEN', ledDurationSeconds: 10, ledPlaysPerDay: 300 } as const

afterEach(() => {
  toast.dismiss()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function pickType(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Type' }))
  await user.click(await screen.findByRole('option', { name }))
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Amir Temur avenue LED')
  await pickType(user, 'LED screen')
  await user.type(screen.getByLabelText('City'), 'Tashkent')
  await user.type(screen.getByLabelText('Address'), 'Amir Temur 15')
  await user.type(screen.getByLabelText('Latitude'), '41.3')
  await user.type(screen.getByLabelText('Longitude'), '69.28')
  await user.type(screen.getByLabelText('Price per month (UZS)'), '4500000')
}

/** Accepts a create and records what was sent. */
function stubCreateApi(extra?: (call: RecordedCall) => Response | undefined) {
  return stubVendorApi('VENDOR', (call) => {
    const custom = extra?.(call)
    if (custom) return custom
    if (call.method === 'POST') {
      return json(201, { placement: vendorPlacement({ status: 'PENDING_REVIEW' }) })
    }
    return json(200, { placement: vendorPlacement(), placements: [], total: 0 })
  })
}

function stubEditApi(initial: Partial<VendorPlacement>, patch?: Response) {
  let current = vendorPlacement(initial)
  return stubVendorApi('VENDOR', (call) => {
    if (call.method === 'GET' && call.path === `${BASE}/${PLACEMENT_ID}`) {
      return json(200, { placement: current })
    }
    if (call.method === 'PATCH') {
      if (patch) return patch
      current = { ...current, ...(call.body as object) }
      return json(200, { placement: current })
    }
    if (call.method === 'GET' && call.path === BASE) {
      return json(200, { placements: [current], total: 1 })
    }
    return undefined
  })
}

const patchBody = (calls: RecordedCall[]) => calls.find((call) => call.method === 'PATCH')!.body
const postBody = (calls: RecordedCall[]) => calls.find((call) => call.method === 'POST')!.body

describe('ListingEditorPage: LED fields', () => {
  it('shows the LED inputs only while the type is LED screen', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    expect(screen.queryByLabelText(DURATION)).not.toBeInTheDocument()

    await pickType(user, 'Billboard')
    expect(screen.queryByLabelText(PLAYS)).not.toBeInTheDocument()

    await pickType(user, 'LED screen')
    expect(screen.getByLabelText(DURATION)).toBeInTheDocument()
    expect(screen.getByLabelText(PLAYS)).toBeInTheDocument()
    expect(screen.getByText('How many seconds one ad plays on the screen.')).toBeInTheDocument()
  })

  it('offers only Billboard and LED screen as types', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    await userEvent.setup().click(await screen.findByRole('combobox', { name: 'Type' }))

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Billboard', 'LED screen'])
  })

  it('sends the LED numbers on create for an LED screen', async () => {
    const { calls } = stubCreateApi()
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    await user.type(screen.getByLabelText(DURATION), '10')
    await user.type(screen.getByLabelText(PLAYS), '300')
    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    expect(postBody(calls)).toMatchObject({
      type: 'LED_SCREEN',
      ledDurationSeconds: 10,
      ledPlaysPerDay: 300,
    })
  })

  it('clears typed LED values when the type changes away, and does not send them', async () => {
    const { calls } = stubCreateApi()
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    await user.type(screen.getByLabelText(DURATION), '10')
    await user.type(screen.getByLabelText(PLAYS), '300')

    await pickType(user, 'Billboard')
    expect(screen.queryByLabelText(DURATION)).not.toBeInTheDocument()
    // Back to LED: the old numbers are gone.
    await pickType(user, 'LED screen')
    expect(screen.getByLabelText(DURATION)).toHaveValue('')
    expect(screen.getByLabelText(PLAYS)).toHaveValue('')

    await pickType(user, 'Billboard')
    await user.click(screen.getByRole('button', { name: 'Create listing' }))
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    const body = postBody(calls) as Record<string, unknown>
    expect(body.type).toBe('BILLBOARD')
    expect(body).not.toHaveProperty('ledDurationSeconds')
    expect(body).not.toHaveProperty('ledPlaysPerDay')
  })

  it('refuses a non-positive LED number before sending', async () => {
    const { calls } = stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    await user.type(screen.getByLabelText(DURATION), '0')
    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('Enter a whole number greater than 0')).toBeInTheDocument()
    expect(screen.getByLabelText(DURATION)).toHaveAttribute('aria-invalid', 'true')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('puts the server’s LED range error under the LED input', async () => {
    stubVendorApi('VENDOR', (call) =>
      call.method === 'POST'
        ? json(400, {
            error: 'Invalid input',
            code: 'INVALID_INPUT',
            fieldErrors: { ledPlaysPerDay: ['validation.led.range'] },
          })
        : undefined,
    )
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)
    await user.type(screen.getByLabelText(PLAYS), '5')
    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('Enter a whole number greater than 0')).toBeInTheDocument()
    expect(screen.getByLabelText(PLAYS)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(DURATION)).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('puts the server’s type-only LED error under the Type field', async () => {
    stubEditApi(
      LED,
      json(400, {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        fieldErrors: { type: ['validation.led.typeOnly'] },
      }),
    )
    renderApp(EDIT)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(DURATION), '5')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('LED details apply to LED screens only')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(DURATION)).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('loads saved LED values into the inputs of an LED listing', async () => {
    stubEditApi(LED)
    renderApp(EDIT)

    expect(await screen.findByLabelText(DURATION)).toHaveValue('10')
    expect(screen.getByLabelText(PLAYS)).toHaveValue('300')
  })

  it('PATCHes only the LED value that changed', async () => {
    const { calls } = stubEditApi(LED)
    renderApp(EDIT)
    const user = userEvent.setup()
    const plays = await screen.findByLabelText(PLAYS)
    await user.clear(plays)
    await user.type(plays, '450')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText(/Changes saved/)
    expect(patchBody(calls)).toEqual({ ledPlaysPerDay: 450 })
  })

  it('sends only the new type when an LED screen becomes a billboard', async () => {
    const { calls } = stubEditApi(LED)
    renderApp(EDIT)
    const user = userEvent.setup()
    await screen.findByLabelText(DURATION)
    await pickType(user, 'Billboard')
    expect(screen.queryByLabelText(DURATION)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText(/Changes saved/)
    expect(patchBody(calls)).toEqual({ type: 'BILLBOARD' })
  })

  it('does not show LED inputs for a billboard listing', async () => {
    stubEditApi({})
    renderApp(EDIT)

    await screen.findByDisplayValue('Chilonzor billboard')
    expect(screen.queryByLabelText(DURATION)).not.toBeInTheDocument()
  })

  it('labels the LED inputs in Russian', async () => {
    stubEditApi(LED)
    renderApp(EDIT, 'ru')

    expect(await screen.findByLabelText('Длительность ролика (секунды)')).toHaveValue('10')
    expect(screen.getByLabelText('Показов в день')).toHaveValue('300')
    expect(screen.getByText('Сколько раз в день показывается ролик.')).toBeInTheDocument()
  })

  it('labels the LED inputs in Uzbek', async () => {
    stubEditApi(LED)
    renderApp(EDIT, 'uz')

    expect(await screen.findByLabelText('Reklama davomiyligi (soniya)')).toHaveValue('10')
    expect(screen.getByLabelText("Kuniga ko'rsatishlar soni")).toHaveValue('300')
  })
})
