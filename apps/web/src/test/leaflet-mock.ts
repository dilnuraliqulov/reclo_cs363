import { vi } from 'vitest'

// Mock Leaflet so jsdom tests don't hang on map initialization. Registered from
// vitest `setupFiles`, so it applies before any test module imports leaflet.

// The markercluster plugin patches the real Leaflet global, which the mock below
// replaces, so stub the plugin out and expose markerClusterGroup on the mock.
vi.mock('leaflet.markercluster', () => ({}))

vi.mock('leaflet', () => {
  const createMarker = () => {
    let popupOpen = false
    return {
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      getLatLng: vi.fn(() => ({ lat: 41.311, lng: 69.279 })),
      setLatLng: vi.fn().mockReturnThis(),
      isPopupOpen: vi.fn(() => popupOpen),
      openPopup: vi.fn(() => {
        popupOpen = true
      }),
    }
  }

  const clusterGroup = {
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(),
    addLayers: vi.fn(),
    zoomToShowLayer: vi.fn((_marker: unknown, cb: () => void) => cb()),
  }

  const map = {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getBounds: vi.fn(() => ({
      getSouth: () => 41.0,
      getNorth: () => 41.6,
      getWest: () => 69.0,
      getEast: () => 69.6,
    })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    panTo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    whenReady: vi.fn((cb: () => void) => {
      cb()
      return map
    }),
  }

  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      markerClusterGroup: vi.fn(() => clusterGroup),
      marker: vi.fn(() => createMarker()),
      divIcon: vi.fn((options: unknown) => options),
    },
  }
})
