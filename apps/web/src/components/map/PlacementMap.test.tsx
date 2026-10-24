import type { PlacementMarker } from '@reclo/shared'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import L from 'leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlacementMap } from './PlacementMap'

const billboard: PlacementMarker = {
  id: 'b1e0696a-54c3-4d40-84c4-f2a89326e680',
  title: 'Amir Temur Billboard',
  type: 'BILLBOARD',
  status: 'ACTIVE',
  latitude: 41.311081,
  longitude: 69.279737,
  address: 'Amir Temur Ave 10',
  city: 'Tashkent',
  pricePerMonth: 5_000_000,
  photo: 'https://example.com/photo.jpg',
}

const ledScreen: PlacementMarker = {
  ...billboard,
  id: 'c2f1707b-65d4-4e51-95d5-03b9a437f791',
  title: 'Chilonzor LED Screen',
  type: 'LED_SCREEN',
  latitude: 41.2756,
  longitude: 69.2045,
  pricePerMonth: 12_000_000,
}

/** The single Leaflet map instance the mock hands back. */
function mapInstance() {
  return vi.mocked(L.map).mock.results[0]?.value as {
    on: ReturnType<typeof vi.fn>
    panTo: ReturnType<typeof vi.fn>
    setView: ReturnType<typeof vi.fn>
    zoomIn: ReturnType<typeof vi.fn>
    zoomOut: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    getBounds: ReturnType<typeof vi.fn>
  }
}

function clusterGroup() {
  return vi.mocked(L.markerClusterGroup).mock.results[0]?.value as unknown as {
    addLayers: ReturnType<typeof vi.fn>
    clearLayers: ReturnType<typeof vi.fn>
    zoomToShowLayer: ReturnType<typeof vi.fn>
  }
}

/** Leaflet event handlers the component registered on the map. */
function mapHandler(event: string): () => void {
  const call = mapInstance().on.mock.calls.find(([name]) => name === event)
  if (!call) throw new Error(`no handler registered for "${event}"`)
  return call[1] as () => void
}

/** The HTML of the nth pin icon the component built. */
function pinHtml(index: number): string {
  return (vi.mocked(L.divIcon).mock.calls[index]?.[0] as { html: string }).html
}

function popupHtmlFor(markerIndex: number): string {
  const marker = vi.mocked(L.marker).mock.results[markerIndex]?.value as {
    bindPopup: ReturnType<typeof vi.fn>
  }
  return marker.bindPopup.mock.calls[0]?.[0] as string
}

/** A copy of the fixture with no photo, for the placeholder paths. */
function withoutPhoto(marker: PlacementMarker): PlacementMarker {
  const copy = { ...marker }
  delete copy.photo
  return copy
}

type MapProps = Parameters<typeof PlacementMap>[0]

function renderMap(props: Omit<Partial<MapProps>, 'onBoundsChange'> = {}) {
  const onBoundsChange = vi.fn()
  const utils = render(
    <PlacementMap markers={[billboard, ledScreen]} {...props} onBoundsChange={onBoundsChange} />,
  )
  return { ...utils, onBoundsChange }
}

describe('PlacementMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('centers on Tashkent at the design zoom and clamps to Uzbekistan', () => {
      renderMap()

      const options = vi.mocked(L.map).mock.calls[0]?.[1]
      expect(options?.center).toEqual([41.311081, 69.279737])
      expect(options?.zoom).toBe(12)
      expect(options?.maxBounds).toEqual([
        [37.0, 56.0],
        [45.6, 73.2],
      ])
    })

    it('uses OpenStreetMap tiles with attribution', () => {
      renderMap()

      const [url, options] = vi.mocked(L.tileLayer).mock.calls[0] ?? []
      expect(url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
      expect(options?.attribution).toContain('OpenStreetMap')
    })

    it('emits the initial viewport bounds once the map is ready', () => {
      const { onBoundsChange } = renderMap()

      expect(onBoundsChange).toHaveBeenCalledWith({
        minLat: 41.0,
        maxLat: 41.6,
        minLng: 69.0,
        maxLng: 69.6,
      })
    })

    it('creates the map only once when markers change', () => {
      const { rerender, onBoundsChange } = renderMap()

      rerender(<PlacementMap markers={[billboard]} onBoundsChange={onBoundsChange} />)
      rerender(<PlacementMap markers={[billboard, ledScreen]} onBoundsChange={onBoundsChange} />)

      // Regression: the map used to be rebuilt on every marker change, which
      // re-emitted bounds and refetched forever.
      expect(vi.mocked(L.map)).toHaveBeenCalledTimes(1)
    })

    it('tears the map down on unmount', () => {
      const { unmount } = renderMap()
      const map = mapInstance()

      unmount()

      expect(map.remove).toHaveBeenCalled()
    })
  })

  describe('pins', () => {
    it('creates one pin per placement at its coordinates', () => {
      renderMap()

      expect(vi.mocked(L.marker)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(L.marker).mock.calls[0]?.[0]).toEqual([41.311081, 69.279737])
      expect(vi.mocked(L.marker).mock.calls[1]?.[0]).toEqual([41.2756, 69.2045])
    })

    it('labels each pin with its compact price', () => {
      renderMap()

      expect(pinHtml(0)).toContain('5M UZS')
      expect(pinHtml(1)).toContain('12M UZS')
    })

    it('color-codes the pin dot by placement type', () => {
      renderMap()

      expect(pinHtml(0)).toContain('bg-blue-500')
      expect(pinHtml(1)).toContain('bg-emerald-500')
    })

    it('highlights the selected pin with a ring', () => {
      renderMap({ selectedMarkerId: billboard.id })

      expect(pinHtml(0)).toContain('ring-2')
      expect(pinHtml(1)).not.toContain('ring-2')
    })

    it('rebuilds pins when the marker list changes', () => {
      const { rerender, onBoundsChange } = renderMap()

      rerender(<PlacementMap markers={[billboard]} onBoundsChange={onBoundsChange} />)

      expect(clusterGroup().clearLayers).toHaveBeenCalled()
      expect(clusterGroup().addLayers.mock.lastCall?.[0]).toHaveLength(1)
    })

    it('reports a selection when a pin is clicked', () => {
      const onSelectMarker = vi.fn()
      renderMap({ onSelectMarker })

      const marker = vi.mocked(L.marker).mock.results[1]?.value as {
        on: ReturnType<typeof vi.fn>
      }
      const clickHandler = marker.on.mock.calls.find(
        ([name]) => name === 'click',
      )?.[1] as () => void
      clickHandler()

      expect(onSelectMarker).toHaveBeenCalledWith(ledScreen)
    })
  })

  describe('clustering', () => {
    it('configures the cluster group from the design doc', () => {
      renderMap()

      const options = vi.mocked(L.markerClusterGroup).mock.calls[0]?.[0]
      expect(options?.maxClusterRadius).toBe(60)
      expect(options?.disableClusteringAtZoom).toBe(17)
      expect(options?.spiderfyOnMaxZoom).toBe(true)
    })

    it('adds the viewport pins to the cluster group in one pass', () => {
      renderMap()

      expect(clusterGroup().addLayers.mock.lastCall?.[0]).toHaveLength(2)
    })

    it('renders a cluster badge showing the child count', () => {
      renderMap()

      const iconCreateFunction = vi.mocked(L.markerClusterGroup).mock.calls[0]?.[0]
        ?.iconCreateFunction as unknown as (cluster: { getChildCount: () => number }) => {
        html: string
      }

      expect(iconCreateFunction({ getChildCount: () => 7 }).html).toContain('7')
      expect(iconCreateFunction({ getChildCount: () => 128 }).html).toContain('128')
    })

    it('grows the cluster badge for larger counts', () => {
      renderMap()

      const iconCreateFunction = vi.mocked(L.markerClusterGroup).mock.calls[0]?.[0]
        ?.iconCreateFunction as unknown as (cluster: { getChildCount: () => number }) => void

      const small = vi.mocked(L.divIcon).mock.calls.length
      iconCreateFunction({ getChildCount: () => 5 })
      iconCreateFunction({ getChildCount: () => 150 })
      const sizes = vi
        .mocked(L.divIcon)
        .mock.calls.slice(small)
        .map((call) => (call[0] as { iconSize: [number, number] }).iconSize[0])

      expect(sizes[1]).toBeGreaterThan(sizes[0]!)
    })
  })

  describe('popups', () => {
    it('shows the title, address and price with a Details action', () => {
      renderMap()

      const html = popupHtmlFor(0)
      expect(html).toContain('Amir Temur Billboard')
      expect(html).toContain('Amir Temur Ave 10, Tashkent')
      expect(html).toContain('Billboard')
      expect(html).toContain(`data-view-placement-id="${billboard.id}"`)
      expect(html).toContain('Details')
    })

    it('includes the photo when the placement has one', () => {
      renderMap()

      expect(popupHtmlFor(0)).toContain('https://example.com/photo.jpg')
    })

    it('omits the image block when there is no photo', () => {
      renderMap({ markers: [withoutPhoto(billboard)] })

      expect(popupHtmlFor(0)).not.toContain('<img')
    })

    it('escapes placement text so vendor input cannot inject markup', () => {
      renderMap({
        markers: [
          {
            ...billboard,
            title: '<script>alert(1)</script>',
            address: '" onmouseover="alert(2)',
          },
        ],
      })

      const html = popupHtmlFor(0)
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('onmouseover="alert(2)"')
      expect(html).toContain('&quot;')
    })

    it('escapes placement text in the pin label too', () => {
      renderMap({ markers: [{ ...billboard, title: '<img src=x onerror=alert(1)>' }] })

      expect(pinHtml(0)).not.toContain('<img src=x')
    })

    it('opens the detail view from the popup Details button', async () => {
      const onViewDetails = vi.fn()
      const user = userEvent.setup()
      renderMap({ onViewDetails })

      // Leaflet renders popups outside React, so the component delegates
      // clicks from the map container.
      const container = screen.getByTestId('placement-map-container').firstElementChild!
      const button = document.createElement('button')
      button.setAttribute('data-view-placement-id', ledScreen.id)
      container.appendChild(button)

      await user.click(button)

      expect(onViewDetails).toHaveBeenCalledWith(ledScreen)
    })

    it('ignores clicks that are not on a Details button', async () => {
      const onViewDetails = vi.fn()
      const user = userEvent.setup()
      renderMap({ onViewDetails })

      await user.click(screen.getByTestId('placement-map-container').firstElementChild!)

      expect(onViewDetails).not.toHaveBeenCalled()
    })
  })

  describe('selection sync', () => {
    it('expands the cluster and opens the popup for the selected pin', () => {
      renderMap({ selectedMarkerId: ledScreen.id })

      expect(clusterGroup().zoomToShowLayer).toHaveBeenCalled()
      const marker = vi.mocked(L.marker).mock.results[1]?.value as {
        openPopup: ReturnType<typeof vi.fn>
      }
      expect(marker.openPopup).toHaveBeenCalled()
    })

    it('does not move the viewport again for an unchanged selection', () => {
      const { rerender, onBoundsChange } = renderMap({ selectedMarkerId: billboard.id })
      const callsAfterFirstRender = clusterGroup().zoomToShowLayer.mock.calls.length

      rerender(
        <PlacementMap
          markers={[billboard]}
          selectedMarkerId={billboard.id}
          onBoundsChange={onBoundsChange}
        />,
      )

      // Refetches must not drag the map back off what the user is looking at.
      expect(clusterGroup().zoomToShowLayer.mock.calls.length).toBe(callsAfterFirstRender)
    })

    it('does nothing when no pin is selected', () => {
      renderMap({ selectedMarkerId: null })

      expect(clusterGroup().zoomToShowLayer).not.toHaveBeenCalled()
    })
  })

  describe('controls', () => {
    it('zooms in and out', async () => {
      const user = userEvent.setup()
      renderMap()

      await user.click(screen.getByTitle('Zoom in'))
      await user.click(screen.getByTitle('Zoom out'))

      expect(mapInstance().zoomIn).toHaveBeenCalled()
      expect(mapInstance().zoomOut).toHaveBeenCalled()
    })

    it('recenters on Tashkent', async () => {
      const user = userEvent.setup()
      renderMap()

      await user.click(screen.getByTitle('Recenter to Tashkent'))

      expect(mapInstance().setView).toHaveBeenCalledWith([41.311081, 69.279737], 12, {
        animate: true,
      })
    })

    it('shows the current zoom level', () => {
      renderMap()

      expect(screen.getByText('Zoom: 12')).toBeInTheDocument()
    })

    it('reports a loading indicator while markers refresh', () => {
      renderMap({ isLoading: true })

      expect(screen.getByText('Updating placements…')).toBeInTheDocument()
    })
  })

  describe('search as I move', () => {
    it('debounces bounds updates while panning', () => {
      vi.useFakeTimers()
      const { onBoundsChange } = renderMap()
      onBoundsChange.mockClear()

      act(() => mapHandler('moveend')())
      expect(onBoundsChange).not.toHaveBeenCalled()

      act(() => void vi.advanceTimersByTime(299))
      expect(onBoundsChange).not.toHaveBeenCalled()

      act(() => void vi.advanceTimersByTime(1))
      expect(onBoundsChange).toHaveBeenCalledTimes(1)
    })

    it('collapses a burst of pans into a single query', () => {
      vi.useFakeTimers()
      const { onBoundsChange } = renderMap()
      onBoundsChange.mockClear()

      const moveEnd = mapHandler('moveend')
      act(() => {
        moveEnd()
        moveEnd()
        moveEnd()
      })
      act(() => void vi.advanceTimersByTime(300))

      expect(onBoundsChange).toHaveBeenCalledTimes(1)
    })

    it('offers a manual search button when the toggle is off', async () => {
      const user = userEvent.setup()
      const { onBoundsChange } = renderMap()

      await user.click(screen.getByText('Search as I move'))
      onBoundsChange.mockClear()

      act(() => mapHandler('moveend')())

      expect(onBoundsChange).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: /Search this area/i }))
      expect(onBoundsChange).toHaveBeenCalledTimes(1)
    })

    it('hides the manual search button while the toggle is on', () => {
      renderMap()

      expect(screen.queryByRole('button', { name: /Search this area/i })).not.toBeInTheDocument()
    })
  })
})
