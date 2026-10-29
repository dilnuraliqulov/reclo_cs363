import type { VendorSummary } from '@reclo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/auth/AuthProvider'
import { Toaster } from '@/components/ui/sonner'
import { AdminVendorsPage } from './AdminVendorsPage'

const admin = { id: 'a1', email: 'admin@example.com', role: 'ADMIN' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function vendorRow(index: number): VendorSummary {
  return {
    id: `v${index}`,
    email: `vendor${index}@example.com`,
    companyName: `Vendor ${index}`,
    createdAt: '2026-10-28T10:00:00.000Z',
  }
}

/** The bodies POSTed to /api/admin/vendors, in order. */
let posted: unknown[]

function stubApi({
  vendors = [] as VendorSummary[],
  onCreate = (body: { email: string; companyName: string }) =>
    json(201, { vendor: { ...vendorRow(99), ...body } }),
} = {}) {
  posted = []
  const list = [...vendors]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/auth/me') return json(200, { user: admin })
      if (url.pathname === '/api/admin/vendors' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        posted.push(body)
        const response = onCreate(body)
        if (response.ok) list.unshift({ ...vendorRow(99), ...body })
        return response
      }
      if (url.pathname === '/api/admin/vendors') return json(200, { vendors: list })
      throw new Error(`unexpected fetch: ${url.pathname}`)
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <AdminVendorsPage />
          <Toaster />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 'long-enough') {
  await user.type(screen.getByLabelText('Company name'), 'Reklama Plus')
  await user.type(screen.getByLabelText('Email'), 'sales@reklama.uz')
  await user.type(screen.getByLabelText('Password'), password)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminVendorsPage', () => {
  it('lists existing vendors', async () => {
    stubApi({ vendors: [vendorRow(1), vendorRow(2)] })
    renderPage()

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Vendor 1')).toBeInTheDocument()
    expect(within(table).getByText('vendor2@example.com')).toBeInTheDocument()
    expect(screen.getByText('Vendor accounts (2)')).toBeInTheDocument()
  })

  it('shows an empty state when there are no vendors', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByText('No vendor accounts yet.')).toBeInTheDocument()
  })

  it('creates a vendor, resets the form and shows the new row', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('No vendor accounts yet.')

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Create vendor account' }))

    expect(await screen.findByText('Vendor account created for sales@reklama.uz')).toBeVisible()
    expect(posted).toEqual([
      { companyName: 'Reklama Plus', email: 'sales@reklama.uz', password: 'long-enough' },
    ])
    expect(await screen.findByRole('cell', { name: 'Reklama Plus' })).toBeInTheDocument()
    expect(screen.getByLabelText('Company name')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('validates with the shared schema before sending anything', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    await screen.findByText('No vendor accounts yet.')

    await fillForm(user, 'short')
    await user.clear(screen.getByLabelText('Company name'))
    await user.click(screen.getByRole('button', { name: 'Create vendor account' }))

    expect(await screen.findByText('Enter the company name')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('marks the email field when the email is already registered', async () => {
    const user = userEvent.setup()
    stubApi({
      onCreate: () =>
        json(409, {
          error: 'Email is already registered',
          code: 'EMAIL_TAKEN',
          fieldErrors: { email: ['validation.email.taken'] },
        }),
    })
    renderPage()
    await screen.findByText('No vendor accounts yet.')

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Create vendor account' }))

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('generates a visible 16-character password, and masks it again when typed over', async () => {
    const user = userEvent.setup()
    stubApi()
    renderPage()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(password).toHaveAttribute('type', 'text'))
    expect((password as HTMLInputElement).value).toHaveLength(16)

    await user.type(password, 'x')
    expect(password).toHaveAttribute('type', 'password')
  })
})
