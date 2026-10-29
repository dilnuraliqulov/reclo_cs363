import type L from 'leaflet'

// Shared by the discovery map and the listing editor's location picker.

// Default center: Tashkent, Uzbekistan
export const TASHKENT_CENTER: L.LatLngTuple = [41.311081, 69.279737]
export const DEFAULT_ZOOM = 12

// Uzbekistan bounds clamping
export const UZBEKISTAN_BOUNDS: L.LatLngBoundsLiteral = [
  [37.0, 56.0], // South-West
  [45.6, 73.2], // North-East
]

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
