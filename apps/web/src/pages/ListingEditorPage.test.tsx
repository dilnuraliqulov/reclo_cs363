import type { PlacementStatus, VendorPlacement } from '@reclo/shared'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import L from 'leaflet'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
  PLACEMENT_ID,
  json,
  photoUrl,
  stubVendorApi,
  vendorPlacement,
  type RecordedCall,
} from '@/test/vendor-api'

const BASE = '/api/vendor/placements'
const EDIT = `/vendor/placements/${PLACEMENT_ID}/edit`

afterEach(() => {
  // sonner keeps its toasts in a module-level store, which would show up in the next test.
  toast.dismiss()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** The click handler the picker registered on the (mocked) Leaflet map. */
function clickMap(lat: number, lng: number) {
  const map = (L.map as unknown as Mock).mock.results.at(-1)!.value as { on: Mock }
  const handler = map.on.mock.calls.findLast(([event]) => event === 'click')![1] as (
    e: unknown,
  ) => void
  act(() => handler({ latlng: { lat, lng } }))
}

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

/** Serves one listing that can be patched, and records what the page sent. */
function stubEditApi(initial: Partial<VendorPlacement> = {}) {
  let current = vendorPlacement(initial)
  const api = stubVendorApi('VENDOR', (call: RecordedCall) => {
    if (call.method === 'GET' && call.path === `${BASE}/${PLACEMENT_ID}`) {
      return json(200, { placement: current })
    }
    if (call.method === 'PATCH' && call.path === `${BASE}/${PLACEMENT_ID}`) {
      const wasLive = current.status === 'ACTIVE' || current.status === 'INACTIVE'
      current = {
        ...current,
        ...(call.body as object),
        status: wasLive ? 'PENDING_REVIEW' : current.status,
      }
      return json(200, { placement: current })
    }
    if (call.method === 'GET' && call.path === BASE) {
      return json(200, { placements: [current], total: 1 })
    }
    return undefined
  })
  return {
    ...api,
    get current() {
      return current
    },
  }
}

describe('ListingEditorPage: create', () => {
  it('validates through the shared schema, in the reader’s language, and sends nothing', async () => {
    const { calls } = stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('Title must be 5 to 120 characters')).toBeInTheDocument()
    expect(screen.getByText('City must be 2 to 80 characters')).toBeInTheDocument()
    expect(screen.getByText('Address must be 3 to 200 characters')).toBeInTheDocument()
    // Type, latitude and longitude are missing altogether.
    expect(screen.getAllByText('This field is required')).toHaveLength(3)
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('shows the validation messages in Russian', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new', 'ru')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Создать объявление' }))

    expect(
      await screen.findByText('Заголовок должен содержать от 5 до 120 символов'),
    ).toBeInTheDocument()
  })

  it('rejects a price outside the shared bounds and re-validates as the vendor types', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Price per month (UZS)'), '5000')
    await user.click(screen.getByRole('button', { name: 'Create listing' }))
    const message = 'Price must be a whole number from 100,000 to 1,000,000,000 UZS'
    expect(await screen.findByText(message)).toBeInTheDocument()

    // After the first submit the form re-validates on change, so fixing the field clears the error.
    await user.type(screen.getByLabelText('Price per month (UZS)'), '00000')
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument())
  })

  it('shows the formatted price while typing', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')

    await userEvent.setup().type(await screen.findByLabelText('Price per month (UZS)'), '2500000')

    expect(screen.getByText('2 500 000 UZS')).toBeInTheDocument()
  })

  it('creates the listing with typed numbers, then moves to its edit page', async () => {
    const created = vendorPlacement({
      title: 'Amir Temur avenue LED',
      type: 'LED_SCREEN',
      status: 'PENDING_REVIEW',
    })
    const { calls } = stubVendorApi('VENDOR', (call) => {
      if (call.method === 'POST' && call.path === BASE) return json(201, { placement: created })
      if (call.method === 'GET' && call.path === `${BASE}/${PLACEMENT_ID}`) {
        return json(200, { placement: created })
      }
      if (call.method === 'GET' && call.path === BASE) {
        return json(200, { placements: [created], total: 1 })
      }
      return undefined
    })
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')

    // The photos card waits for the first save.
    expect(screen.getByText('Save the listing first, then add photos.')).toBeInTheDocument()

    await fillValidForm(user)
    await user.type(screen.getByLabelText('Width (m)'), '6')
    await user.click(screen.getByRole('switch', { name: 'Lit at night' }))
    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(
      await screen.findByText('Listing created. It will go live once it is reviewed.'),
    ).toBeInTheDocument()
    const post = calls.find((call) => call.method === 'POST')!
    expect(post.body).toEqual({
      title: 'Amir Temur avenue LED',
      type: 'LED_SCREEN',
      city: 'Tashkent',
      address: 'Amir Temur 15',
      latitude: 41.3,
      longitude: 69.28,
      pricePerMonth: 4_500_000,
      width: 6,
      lighting: true,
    })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(EDIT))
    expect(
      await screen.findByText('Waiting for review. It is not on the map yet.'),
    ).toBeInTheDocument()
  })

  it('leaves out description, width and height when they are blank', async () => {
    const { calls } = stubVendorApi('VENDOR', (call) =>
      call.method === 'POST'
        ? json(201, { placement: vendorPlacement({ status: 'PENDING_REVIEW' }) })
        : json(200, { placement: vendorPlacement(), placements: [], total: 0 }),
    )
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true))
    const body = calls.find((call) => call.method === 'POST')!.body as Record<string, unknown>
    expect(body).not.toHaveProperty('description')
    expect(body).not.toHaveProperty('width')
    expect(body).not.toHaveProperty('height')
  })

  it('maps the server’s field errors onto the fields', async () => {
    stubVendorApi('VENDOR', (call) =>
      call.method === 'POST'
        ? json(400, {
            error: 'Invalid input',
            code: 'INVALID_INPUT',
            fieldErrors: { title: ['validation.title.length'] },
          })
        : undefined,
    )
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('Title must be 5 to 120 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
  })

  it('toasts a non-field server error by its code', async () => {
    stubVendorApi('VENDOR', (call) =>
      call.method === 'POST' ? json(429, { error: 'slow down', code: 'RATE_LIMITED' }) : undefined,
    )
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByText('Too many attempts, try again later')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/vendor/placements/new')
  })

  it('disables the form and shows "Saving…" while the request runs', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    stubVendorApi('VENDOR', async (call) => {
      if (call.method !== 'POST') return json(200, { placements: [], total: 0 })
      await gate
      return json(201, { placement: vendorPlacement({ status: 'PENDING_REVIEW' }) })
    })
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()
    await screen.findByLabelText('Title')
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: 'Create listing' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Title')).toBeDisabled()
    release()
  })

  it('warns before the tab closes with unsaved input, and not before it is touched', async () => {
    stubVendorApi('VENDOR')
    renderApp('/vendor/placements/new')
    const user = userEvent.setup()

    await screen.findByLabelText('Title')
    const untouched = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(untouched)
    expect(untouched.defaultPrevented).toBe(false)

    await user.type(screen.getByLabelText('Title'), 'Something')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  describe('location picker', () => {
    it('a map click fills the coordinate inputs and announces the pin', async () => {
      stubVendorApi('VENDOR')
      renderApp('/vendor/placements/new')
      await screen.findByLabelText('Latitude')
      expect(screen.getByText('No pin set yet')).toBeInTheDocument()

      clickMap(41.2995123456, 69.2401)

      await waitFor(() => expect(screen.getByLabelText('Latitude')).toHaveValue('41.299512'))
      expect(screen.getByLabelText('Longitude')).toHaveValue('69.2401')
      expect(screen.getByText('Pin at 41.299512, 69.2401')).toBeInTheDocument()
    })

    it('ignores a click outside Uzbekistan', async () => {
      stubVendorApi('VENDOR')
      renderApp('/vendor/placements/new')
      await screen.findByLabelText('Latitude')

      clickMap(51.5, 0.12)

      expect(screen.getByLabelText('Latitude')).toHaveValue('')
      expect(screen.getByText('No pin set yet')).toBeInTheDocument()
    })

    it('typed coordinates outside Uzbekistan are refused by the shared schema', async () => {
      stubVendorApi('VENDOR')
      renderApp('/vendor/placements/new')
      const user = userEvent.setup()
      await user.type(await screen.findByLabelText('Latitude'), '69.2')
      await user.type(screen.getByLabelText('Longitude'), '41.3')

      await user.click(screen.getByRole('button', { name: 'Create listing' }))

      expect(await screen.findByText('Latitude must be inside Uzbekistan')).toBeInTheDocument()
      expect(screen.getByText('Longitude must be inside Uzbekistan')).toBeInTheDocument()
    })
  })
})

describe('ListingEditorPage: edit', () => {
  it('loads the listing into the form', async () => {
    stubEditApi()
    renderApp(EDIT)

    expect(await screen.findByDisplayValue('Chilonzor billboard')).toBeInTheDocument()
    expect(screen.getByLabelText('City')).toHaveValue('Tashkent')
    expect(screen.getByLabelText('Price per month (UZS)')).toHaveValue('2500000')
    expect(screen.getByLabelText('Width (m)')).toHaveValue('6')
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Billboard')
    expect(screen.getByRole('switch', { name: 'Lit at night' })).toBeChecked()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chilonzor billboard')
  })

  it('keeps Save disabled until something changes', async () => {
    stubEditApi()
    renderApp(EDIT)
    const user = userEvent.setup()
    const save = await screen.findByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Title'), '!')
    expect(save).toBeEnabled()
  })

  it('sends only the changed fields, and says an ACTIVE listing went back to review', async () => {
    const api = stubEditApi({ status: 'ACTIVE' })
    renderApp(EDIT)
    const user = userEvent.setup()

    const title = await screen.findByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Chilonzor billboard 2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Changes saved. The listing is back in review.'),
    ).toBeInTheDocument()
    expect(api.calls.find((call) => call.method === 'PATCH')!.body).toEqual({
      title: 'Chilonzor billboard 2',
    })
    // The banner follows the new status.
    expect(
      await screen.findByText('Waiting for review. It is not on the map yet.'),
    ).toBeInTheDocument()
    // The saved form is clean again.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('says plain "Changes saved." for a listing that was already in review', async () => {
    stubEditApi({ status: 'PENDING_REVIEW' })
    renderApp(EDIT)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('City'), ' city')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument()
    expect(screen.queryByText(/back in review/)).not.toBeInTheDocument()
  })

  it('sends a changed number as a number and a toggled switch as a boolean', async () => {
    const api = stubEditApi()
    renderApp(EDIT)
    const user = userEvent.setup()

    const price = await screen.findByLabelText('Price per month (UZS)')
    await user.clear(price)
    await user.type(price, '3000000')
    await user.click(screen.getByRole('switch', { name: 'Lit at night' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText(/Changes saved/)
    expect(api.calls.find((call) => call.method === 'PATCH')!.body).toEqual({
      pricePerMonth: 3_000_000,
      lighting: false,
    })
  })

  describe('status banner', () => {
    const cases: [PlacementStatus, string][] = [
      ['PENDING_REVIEW', 'Waiting for review. It is not on the map yet.'],
      [
        'ACTIVE',
        'Live on the map. Saving changes sends it back for review and removes it from the map until it is approved.',
      ],
      [
        'INACTIVE',
        'Paused. Saving changes sends it back for review and removes it from the map until it is approved.',
      ],
      ['ARCHIVED', 'Archived. Restore it to edit.'],
    ]
    it.each(cases)('%s', async (status, copy) => {
      stubEditApi({ status })
      renderApp(EDIT)

      expect(await screen.findByText(copy)).toBeInTheDocument()
    })

    it('has the same warning in Uzbek and Russian', async () => {
      stubEditApi({ status: 'ACTIVE' })
      renderApp(EDIT, 'ru')
      expect(
        await screen.findByText(/Если сохранить изменения, объявление вернётся на проверку/),
      ).toBeInTheDocument()
    })
  })

  describe('archived listing', () => {
    it('locks the whole form and offers Restore', async () => {
      stubEditApi({ status: 'ARCHIVED', archivedAt: '2026-10-01T00:00:00Z' })
      renderApp(EDIT)

      expect(await screen.findByLabelText('Title')).toBeDisabled()
      expect(screen.getByLabelText('Price per month (UZS)')).toBeDisabled()
      expect(screen.getByRole('switch', { name: 'Lit at night' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add photos' })).toBeDisabled()
    })

    it('Restore unlocks it, back in review', async () => {
      const api = stubVendorApi('VENDOR', (call) => {
        if (call.path.endsWith('/restore')) {
          return json(200, { placement: vendorPlacement({ status: 'PENDING_REVIEW' }) })
        }
        if (call.method === 'GET' && call.path === `${BASE}/${PLACEMENT_ID}`) {
          return json(200, {
            placement: vendorPlacement({ status: 'ARCHIVED', archivedAt: '2026-10-01T00:00:00Z' }),
          })
        }
        return json(200, { placements: [], total: 0 })
      })
      renderApp(EDIT)
      const user = userEvent.setup()
      await screen.findByLabelText('Title')

      await user.click(screen.getByRole('button', { name: 'Restore' }))

      expect(
        await screen.findByText('Listing restored. It will be reviewed before it goes live.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeEnabled())
      expect(api.calls.filter((call) => call.path.endsWith('/restore'))).toHaveLength(1)
    })
  })

  it('shows "Listing not found" for a missing or foreign id, with the way back', async () => {
    stubVendorApi('VENDOR', () =>
      json(404, { error: 'Placement not found', code: 'PLACEMENT_NOT_FOUND' }),
    )
    renderApp(EDIT)

    expect(await screen.findByText('Listing not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My listings' })).toHaveAttribute(
      'href',
      '/vendor/placements',
    )
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('treats a malformed id (400) like a missing one', async () => {
    stubVendorApi('VENDOR', () =>
      json(400, { error: 'Invalid placement id', code: 'INVALID_PLACEMENT_ID' }),
    )
    renderApp('/vendor/placements/not-a-uuid/edit')

    expect(await screen.findByText('Listing not found')).toBeInTheDocument()
  })

  it('shows a retry card for a server failure', async () => {
    stubVendorApi('VENDOR', () => json(500, { error: 'boom', code: 'INTERNAL' }))
    renderApp(EDIT)

    expect(
      await screen.findByText('Couldn’t load your listings.'.replace('’', "'")),
    ).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  describe('photos', () => {
    function stubPhotoApi(
      initialPhotos: string[],
      onUpload?: (file: File) => Response | undefined,
    ) {
      let photos = [...initialPhotos]
      const api = stubVendorApi('VENDOR', (call) => {
        const base = `${BASE}/${PLACEMENT_ID}`
        if (call.method === 'GET' && call.path === base) {
          return json(200, { placement: vendorPlacement({ photos }) })
        }
        if (call.method === 'POST' && call.path === `${base}/photos`) {
          const file = (call.body as FormData).get('photo') as File
          const custom = onUpload?.(file)
          if (custom) return custom
          photos = [...photos, photoUrl(photos.length + 1)]
          return json(201, { placement: vendorPlacement({ photos }) })
        }
        if (call.method === 'DELETE' && call.path.startsWith(`${base}/photos/`)) {
          const file = decodeURIComponent(call.path.split('/').pop()!)
          photos = photos.filter((url) => !url.endsWith(file))
          return json(200, { placement: vendorPlacement({ photos }) })
        }
        return json(200, { placements: [], total: 0 })
      })
      return api
    }

    const image = (name: string, type = 'image/jpeg') => new File(['x'], name, { type })
    const upload = (files: File[]) =>
      userEvent.setup({ applyAccept: false }).upload(screen.getByTestId('photo-input'), files)

    it('warns when the listing has no photo, and stops warning once it has one', async () => {
      stubPhotoApi([])
      renderApp(EDIT)

      expect(
        await screen.findByText(
          'This listing has no photo. Add at least one so it can be approved.',
        ),
      ).toBeInTheDocument()

      await upload([image('a.jpg')])
      await waitFor(() =>
        expect(
          screen.queryByText('This listing has no photo. Add at least one so it can be approved.'),
        ).not.toBeInTheDocument(),
      )
      expect(screen.getByText('1 / 8')).toBeInTheDocument()
    })

    it('does not warn about photos on an archived listing', async () => {
      stubVendorApi('VENDOR', () =>
        json(200, {
          placement: vendorPlacement({ status: 'ARCHIVED', archivedAt: '2026-10-01T00:00:00Z' }),
        }),
      )
      renderApp(EDIT)
      await screen.findByLabelText('Title')

      expect(screen.queryByText(/has no photo/)).not.toBeInTheDocument()
    })

    it('uploads each file as its own multipart request in the "photo" field', async () => {
      const api = stubPhotoApi([photoUrl(1)])
      renderApp(EDIT)
      await screen.findByText('1 / 8')

      await upload([image('a.jpg'), image('b.png', 'image/png'), image('c.webp', 'image/webp')])

      expect(await screen.findByText('4 / 8')).toBeInTheDocument()
      const uploads = api.calls.filter((call) => call.method === 'POST')
      expect(uploads).toHaveLength(3)
      expect(uploads.map((call) => (call.body as FormData).get('photo'))).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'a.jpg' })]),
      )
    })

    it('marks the first photo as the cover and gives every remove button a number', async () => {
      stubPhotoApi([photoUrl(1), photoUrl(2)])
      renderApp(EDIT)

      expect(await screen.findByText('Cover')).toBeInTheDocument()
      expect(screen.getByAltText('Photo 1')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
    })

    it('refuses a wrong type before any request leaves the browser', async () => {
      const api = stubPhotoApi([])
      renderApp(EDIT)
      await screen.findByText('0 / 8')

      await upload([image('notes.gif', 'image/gif')])

      expect(
        await screen.findByText('notes.gif: only JPEG, PNG or WebP photos are accepted.'),
      ).toBeInTheDocument()
      expect(api.calls.some((call) => call.method === 'POST')).toBe(false)
    })

    it('refuses a file over 5 MB before any request leaves the browser', async () => {
      const api = stubPhotoApi([])
      renderApp(EDIT)
      await screen.findByText('0 / 8')
      const big = image('huge.jpg')
      Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })

      await upload([big])

      expect(
        await screen.findByText('huge.jpg: the photo is larger than 5 MB.'),
      ).toBeInTheDocument()
      expect(api.calls.some((call) => call.method === 'POST')).toBe(false)
    })

    it('accepts a file of exactly 5 MB', async () => {
      stubPhotoApi([])
      renderApp(EDIT)
      await screen.findByText('0 / 8')
      const exact = image('exact.jpg')
      Object.defineProperty(exact, 'size', { value: 5 * 1024 * 1024 })

      await upload([exact])

      expect(await screen.findByText('1 / 8')).toBeInTheDocument()
    })

    it('uploads only as many files as there are free slots', async () => {
      const api = stubPhotoApi(Array.from({ length: 6 }, (_, index) => photoUrl(index + 1)))
      renderApp(EDIT)
      await screen.findByText('6 / 8')

      await upload([image('a.jpg'), image('b.jpg'), image('c.jpg'), image('d.jpg')])

      expect(await screen.findByText('8 / 8')).toBeInTheDocument()
      expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(2)
      expect(
        screen.getAllByText(/Not uploaded, a listing can have at most 8 photos: [cd]\.jpg/),
      ).toHaveLength(2)
    })

    it('disables "Add photos" at the limit of 8', async () => {
      stubPhotoApi(Array.from({ length: 8 }, (_, index) => photoUrl(index + 1)))
      renderApp(EDIT)

      expect(await screen.findByText('8 / 8')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add photos' })).toBeDisabled()
    })

    it('shows the server’s verdict per file when it rejects one the pre-check allowed', async () => {
      stubPhotoApi([], (file) =>
        file.name === 'fake.jpg'
          ? json(415, { error: 'Photos must be JPEG, PNG or WebP', code: 'PHOTO_TYPE_INVALID' })
          : undefined,
      )
      renderApp(EDIT)
      await screen.findByText('0 / 8')

      await upload([image('fake.jpg'), image('real.jpg')])

      expect(
        await screen.findByText('fake.jpg: Photos must be JPEG, PNG or WebP'),
      ).toBeInTheDocument()
      // The good one still went through.
      expect(await screen.findByText('1 / 8')).toBeInTheDocument()
    })

    it('shows the server error in Russian', async () => {
      stubPhotoApi([], () => json(413, { error: 'big', code: 'PHOTO_TOO_LARGE' }))
      renderApp(EDIT, 'ru')
      await screen.findByText('0 / 8')

      await upload([image('a.jpg')])

      expect(await screen.findByText(/a\.jpg: .*5/)).toBeInTheDocument()
    })

    it('removes a photo by its file name', async () => {
      const api = stubPhotoApi([photoUrl(1), photoUrl(2)])
      renderApp(EDIT)
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Remove photo 1' }))

      expect(await screen.findByText('1 / 8')).toBeInTheDocument()
      const removal = api.calls.find((call) => call.method === 'DELETE')!
      expect(removal.path).toBe(`${BASE}/${PLACEMENT_ID}/photos/${photoUrl(1).split('/').pop()}`)
      expect(screen.getAllByAltText(/Photo \d/)).toHaveLength(1)
    })

    it('toasts a failed removal by its code', async () => {
      stubVendorApi('VENDOR', (call) => {
        if (call.method === 'DELETE') {
          return json(404, { error: 'Photo not found', code: 'PHOTO_NOT_FOUND' })
        }
        return json(200, { placement: vendorPlacement({ photos: [photoUrl(1)] }) })
      })
      renderApp(EDIT)
      const user = userEvent.setup()

      await user.click(await screen.findByRole('button', { name: 'Remove photo 1' }))

      expect(await screen.findByText('Photo not found')).toBeInTheDocument()
    })
  })
})
