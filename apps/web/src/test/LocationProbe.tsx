import { useLocation } from 'react-router'

/** Prints the current location, which is how a test sees a redirect. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}
