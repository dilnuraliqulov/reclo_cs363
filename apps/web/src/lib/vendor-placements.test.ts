import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLACEMENT_ID, json, vendorPlacement } from '@/test/vendor-api'
import { ApiRequestError } from './api'
import {
  changeVendorPlacementState,
  createVendorPlacement,
  deletePlacementPhoto,
  fetchVendorPlacements,
  updateVendorPlacement,
  uploadPlacementPhoto,
} from './vendor-placements'

function stubFetch(response: Response) {
  const mock = vi.fn<typeof fetch>(async () => response.clone())
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('vendor placements client', () => {
  it('lists with page and pageSize, and a status only when given', async () => {
    const mock = stubFetch(json(200, { placements: [], total: 0 }))

    await fetchVendorPlacements({})
    await fetchVendorPlacements({ status: 'ARCHIVED', page: 3 })

    expect(String(mock.mock.calls[0]![0])).toMatch(/\/api\/vendor\/placements\?page=1&pageSize=20$/)
    expect(String(mock.mock.calls[1]![0])).toMatch(/status=ARCHIVED&page=3&pageSize=20$/)
    expect(mock.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'include' })
  })

  it('rejects a response that does not match the shared schema', async () => {
    stubFetch(json(200, { placements: [{ id: 'x' }], total: 1 }))
    await expect(fetchVendorPlacements({})).rejects.toThrow()
  })

  it('POSTs a create as JSON and PATCHes only what it is given', async () => {
    const mock = stubFetch(json(200, { placement: vendorPlacement() }))

    await createVendorPlacement({
      title: 'Chilonzor billboard',
      type: 'BILLBOARD',
      latitude: 41.3,
      longitude: 69.2,
      address: 'Bunyodkor 12',
      city: 'Tashkent',
      pricePerMonth: 2_500_000,
      lighting: false,
    })
    await updateVendorPlacement(PLACEMENT_ID, { title: 'New title here' })

    const [, create] = mock.mock.calls[0]!
    expect(create).toMatchObject({ method: 'POST' })
    expect(create!.headers).toEqual({ 'Content-Type': 'application/json' })
    const [url, update] = mock.mock.calls[1]!
    expect(String(url)).toMatch(new RegExp(`/api/vendor/placements/${PLACEMENT_ID}$`))
    expect(update).toMatchObject({ method: 'PATCH', body: '{"title":"New title here"}' })
  })

  it.each(['archive', 'restore', 'pause', 'resume'] as const)(
    'POSTs %s with no body',
    async (action) => {
      const mock = stubFetch(json(200, { placement: vendorPlacement() }))

      await changeVendorPlacementState(PLACEMENT_ID, action)

      const [url, init] = mock.mock.calls[0]!
      expect(String(url)).toMatch(new RegExp(`/${PLACEMENT_ID}/${action}$`))
      expect(init).toMatchObject({ method: 'POST', body: undefined })
    },
  )

  it('uploads as multipart in the "photo" field and leaves the content type to the browser', async () => {
    const mock = stubFetch(json(201, { placement: vendorPlacement() }))
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

    await uploadPlacementPhoto(PLACEMENT_ID, file)

    const [url, init] = mock.mock.calls[0]!
    expect(String(url)).toMatch(new RegExp(`/${PLACEMENT_ID}/photos$`))
    expect(init!.body).toBeInstanceOf(FormData)
    expect((init!.body as FormData).get('photo')).toBeInstanceOf(File)
    expect(init!.headers).toBeUndefined()
  })

  it('deletes a photo by the last segment of its URL', async () => {
    const mock = stubFetch(json(200, { placement: vendorPlacement() }))

    await deletePlacementPhoto(
      PLACEMENT_ID,
      `http://localhost:4000/uploads/placements/${PLACEMENT_ID}/1f2e3d4c-aaaa-4bbb-8ccc-dddddddddddd.png`,
    )

    const [url, init] = mock.mock.calls[0]!
    expect(String(url)).toMatch(
      new RegExp(`/${PLACEMENT_ID}/photos/1f2e3d4c-aaaa-4bbb-8ccc-dddddddddddd\\.png$`),
    )
    expect(init).toMatchObject({ method: 'DELETE' })
  })

  it('throws an ApiRequestError carrying the status, code and field errors', async () => {
    stubFetch(
      json(400, {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        fieldErrors: { title: ['validation.title.length'] },
      }),
    )

    const error = await createVendorPlacement({} as never).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_INPUT',
      fieldErrors: { title: ['validation.title.length'] },
    })
  })
})
