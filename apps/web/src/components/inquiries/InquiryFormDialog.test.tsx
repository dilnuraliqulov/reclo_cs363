import type { PlacementMarker } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/sonner'
import { InquiryFormDialog } from './InquiryFormDialog'

const placement: PlacementMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.311,
  longitude: 69.279,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
}

const signedInUser = { id: 'u1', email: 'client@example.com', role: 'CLIENT' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = (path: string, init: RequestInit) => Response | Promise<Response>

/** Stubs fetch. `me` decides whether the viewer is signed in; `onPost` answers the submit. */
function stubApi({ signedIn = true, onPost }: { signedIn?: boolean; onPost?: Handler } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(String(input)).pathname
    if (path === '/api/auth/me') {
      return signedIn
        ? json(200, { user: signedInUser })
        : json(401, { error: 'Not authenticated' })
    }
    if (path === '/api/inquiries') {
      return onPost
        ? onPost(path, init)
        : json(201, {
            inquiry: {
              id: '8f1e2bb6-6ad8-4a2e-9f6e-1c2f6f2a31aa',
              placementId: placement.id,
              status: 'NEW',
              message: 'x'.repeat(20),
              contactName: 'Aziza Karimova',
              contactPhone: '+998901234567',
              contactEmail: 'client@example.com',
              desiredStartDate: null,
              durationMonths: null,
              createdAt: '2026-10-26T10:00:00.000Z',
            },
          })
    }
    throw new Error(`unexpected request to ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/placements']}>
        <AuthProvider>
          <InquiryFormDialog placement={placement} open onOpenChange={onOpenChange} />
          <Toaster />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

/** The body of the one POST /api/inquiries call. */
function submittedBody(fetchMock: ReturnType<typeof stubApi>) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      new URL(String(input)).pathname === '/api/inquiries' && init?.method === 'POST',
  )
  if (!call) throw new Error('no inquiry was submitted')
  return JSON.parse(String(call[1]?.body))
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('InquiryFormDialog', () => {
  it('prompts a signed-out visitor to sign in and renders no fields', async () => {
    stubApi({ signedIn: false })
    renderDialog()

    expect(await screen.findByText('Sign in to send an inquiry')).toBeInTheDocument()
    const signIn = screen.getByRole('link', { name: 'Sign in' })
    // The link returns the client to the placement they were looking at.
    expect(signIn).toHaveAttribute('href', '/sign-in?next=%2Fplacements')
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })

  it('pre-fills the email from the session', async () => {
    stubApi()
    renderDialog()

    expect(await screen.findByLabelText('Email')).toHaveValue('client@example.com')
    expect(screen.getByLabelText('Your name')).toHaveValue('')
    expect(screen.getByLabelText('Phone')).toHaveValue('')
  })

  it('shows validation messages instead of submitting an empty form', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Send inquiry' }))

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === '/api/inquiries',
      ),
    ).toHaveLength(0)
  })

  it('rejects a non-Uzbek phone number', async () => {
    const user = userEvent.setup()
    stubApi()
    renderDialog()

    await user.type(await screen.findByLabelText('Your name'), 'Aziza Karimova')
    await user.type(screen.getByLabelText('Phone'), '+7 495 123 45 67')
    await user.type(screen.getByLabelText('Message'), 'We would like a two-month campaign here.')
    await user.click(screen.getByRole('button', { name: 'Send inquiry' }))

    expect(await screen.findByText(/valid Uzbek number/i)).toBeInTheDocument()
  })

  it('submits normalized values once and closes on success', async () => {
    const user = userEvent.setup()
    const fetchMock = stubApi()
    const { onOpenChange } = renderDialog()

    await user.type(await screen.findByLabelText('Your name'), 'Aziza Karimova')
    // The bare national form, which the schema normalises to E.164.
    await user.type(screen.getByLabelText('Phone'), '901234567')
    await user.type(screen.getByLabelText('Message'), 'We would like a two-month campaign here.')
    await user.click(screen.getByRole('button', { name: 'Send inquiry' }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(submittedBody(fetchMock)).toEqual({
      placementId: placement.id,
      message: 'We would like a two-month campaign here.',
      contactName: 'Aziza Karimova',
      contactPhone: '+998901234567',
      contactEmail: 'client@example.com',
    })
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          new URL(String(input)).pathname === '/api/inquiries' && init?.method === 'POST',
      ),
    ).toHaveLength(1)
  })

  it('names the earlier date and disables submit on a duplicate', async () => {
    const user = userEvent.setup()
    stubApi({
      onPost: () =>
        json(409, {
          error: 'You already have an open inquiry for this placement',
          existingInquiryCreatedAt: '2026-10-20T08:00:00.000Z',
        }),
    })
    const { onOpenChange } = renderDialog()

    await user.type(await screen.findByLabelText('Your name'), 'Aziza Karimova')
    await user.type(screen.getByLabelText('Phone'), '+998901234567')
    await user.type(screen.getByLabelText('Message'), 'We would like a two-month campaign here.')
    await user.click(screen.getByRole('button', { name: 'Send inquiry' }))

    // The date makes the 14-day expiry visible rather than mysterious.
    expect(await screen.findByText(/sent 20 Oct 2026/)).toBeInTheDocument()
    // Retrying cannot succeed, so the dialog stays open with submit disabled.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Send inquiry' })).toBeDisabled()
  })

  it('swaps to the sign-in prompt when the session has expired', async () => {
    const user = userEvent.setup()
    stubApi({ onPost: () => json(401, { error: 'Not authenticated' }) })
    renderDialog()

    await user.type(await screen.findByLabelText('Your name'), 'Aziza Karimova')
    await user.type(screen.getByLabelText('Phone'), '+998901234567')
    await user.type(screen.getByLabelText('Message'), 'We would like a two-month campaign here.')
    await user.click(screen.getByRole('button', { name: 'Send inquiry' }))

    expect(await screen.findByText('Sign in to send an inquiry')).toBeInTheDocument()
  })

  it('maps server field errors onto their fields', async () => {
    const user = userEvent.setup()
    stubApi({
      onPost: () =>
        json(400, {
          error: 'Invalid input',
          fieldErrors: { message: ['Message must be at least 10 characters'] },
        }),
    })
    renderDialog()

    await user.type(await screen.findByLabelText('Your name'), 'Aziza Karimova')
    await user.type(screen.getByLabelText('Phone'), '+998901234567')
    await user.type(screen.getByLabelText('Message'), 'We would like a two-month campaign here.')
    await user.click(screen.getByRole('button', { name: 'Send inquiry' }))

    expect(await screen.findByText('Message must be at least 10 characters')).toBeInTheDocument()
  })
})
