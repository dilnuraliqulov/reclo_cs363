import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlacementFilters, type PlacementFilterState } from './PlacementFilters'

const emptyFilters: PlacementFilterState = {
  type: undefined,
  city: '',
  minPrice: '',
  maxPrice: '',
  ledDurationSeconds: '',
  ledPlaysPerDay: '',
}

/** Drives the controlled component the way the discovery page does. */
function Harness({
  initial = emptyFilters,
  onReset = vi.fn(),
}: {
  initial?: PlacementFilterState
  onReset?: () => void
}) {
  const [filters, setFilters] = useState(initial)
  const hasActiveFilters = Boolean(
    filters.type ||
      filters.city.trim() ||
      filters.minPrice.trim() ||
      filters.maxPrice.trim() ||
      filters.ledDurationSeconds.trim() ||
      filters.ledPlaysPerDay.trim(),
  )

  return (
    <>
      <PlacementFilters
        filters={filters}
        onChange={setFilters}
        onReset={() => {
          setFilters(emptyFilters)
          onReset()
        }}
        hasActiveFilters={hasActiveFilters}
      />
      <output data-testid="state">{JSON.stringify(filters)}</output>
    </>
  )
}

function readState(): PlacementFilterState {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}')
}

describe('PlacementFilters', () => {
  it('offers static placement type pills plus All Types', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'All Types' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Billboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LED Screen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wall Mural' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'City Format' })).not.toBeInTheDocument()
  })

  it('selects a type when its pill is clicked', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))

    expect(readState().type).toBe('LED_SCREEN')
  })

  it('clears the type when the active pill is clicked again', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...emptyFilters, type: 'LED_SCREEN' }} />)

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))

    expect(readState().type).toBeUndefined()
  })

  it('clears the type via All Types', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...emptyFilters, type: 'BILLBOARD' }} />)

    await user.click(screen.getByRole('button', { name: 'All Types' }))

    expect(readState().type).toBeUndefined()
  })

  it('records the typed city', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByPlaceholderText('City (e.g. Tashkent)'), 'Samarkand')

    expect(readState().city).toBe('Samarkand')
  })

  it('records the price range as numeric inputs', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const min = screen.getByPlaceholderText('Min UZS')
    const max = screen.getByPlaceholderText('Max UZS')
    expect(min).toHaveAttribute('type', 'number')
    expect(max).toHaveAttribute('type', 'number')

    await user.type(min, '1000000')
    await user.type(max, '9000000')

    expect(readState().minPrice).toBe('1000000')
    expect(readState().maxPrice).toBe('9000000')
  })

  it('hides the reset bar while no filter is active', () => {
    render(<Harness />)

    expect(screen.queryByRole('button', { name: /Reset filters/i })).not.toBeInTheDocument()
  })

  it('shows the reset bar once a filter is active', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Billboard' }))

    expect(screen.getByText('Filters applied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset filters/i })).toBeInTheDocument()
  })

  it('clears every filter through reset', async () => {
    const onReset = vi.fn()
    const user = userEvent.setup()
    render(
      <Harness
        initial={{
          type: 'BILLBOARD',
          city: 'Tashkent',
          minPrice: '100',
          maxPrice: '900',
          ledDurationSeconds: '',
          ledPlaysPerDay: '',
        }}
        onReset={onReset}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Reset filters/i }))

    expect(onReset).toHaveBeenCalled()
    expect(readState()).toEqual(emptyFilters)
  })

  it('shows LED-specific fields only when LED type is selected', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByPlaceholderText('LED duration (sec)')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('LED plays/day')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'LED Screen' }))

    expect(screen.getByPlaceholderText('LED duration (sec)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('LED plays/day')).toBeInTheDocument()
  })

  it('captures LED-specific filters and clears them when switching type', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...emptyFilters, type: 'LED_SCREEN' }} />)

    await user.type(screen.getByPlaceholderText('LED duration (sec)'), '15')
    await user.type(screen.getByPlaceholderText('LED plays/day'), '120')

    expect(readState().ledDurationSeconds).toBe('15')
    expect(readState().ledPlaysPerDay).toBe('120')

    await user.click(screen.getByRole('button', { name: 'Billboard' }))

    expect(readState().type).toBe('BILLBOARD')
    expect(readState().ledDurationSeconds).toBe('')
    expect(readState().ledPlaysPerDay).toBe('')
  })
})
