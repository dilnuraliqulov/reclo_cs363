import type { PlacementType } from '@reclo/shared'
import { FilterX, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPlacementType } from '@/lib/placements'
import { cn } from '@/lib/utils'

const PLACEMENT_TYPES: PlacementType[] = ['BILLBOARD', 'LED_SCREEN', 'WALL_MURAL', 'CITY_FORMAT']

export interface PlacementFilterState {
  type?: PlacementType
  city: string
  minPrice: string
  maxPrice: string
}

interface PlacementFiltersProps {
  filters: PlacementFilterState
  onChange: (updater: (prev: PlacementFilterState) => PlacementFilterState) => void
  onReset: () => void
  hasActiveFilters: boolean
}

export function PlacementFilters({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
}: PlacementFiltersProps) {
  return (
    <div className="space-y-3 p-3 bg-muted/40 rounded-lg border border-border/60">
      {/* Type Filter Pills */}
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
          Placement Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={filters.type === undefined ? 'default' : 'outline'}
            className={cn(
              'h-7 text-xs px-2.5 rounded-full',
              filters.type === undefined ? 'shadow-xs' : 'bg-background hover:bg-muted',
            )}
            onClick={() => onChange((prev) => ({ ...prev, type: undefined }))}
          >
            All Types
          </Button>
          {PLACEMENT_TYPES.map((type) => {
            const isSelected = filters.type === type
            return (
              <Button
                key={type}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                className={cn(
                  'h-7 text-xs px-2.5 rounded-full',
                  isSelected ? 'shadow-xs' : 'bg-background hover:bg-muted',
                )}
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    type: isSelected ? undefined : type,
                  }))
                }
              >
                {formatPlacementType(type)}
              </Button>
            )
          })}
        </div>
      </div>

      {/* City & Price Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="City (e.g. Tashkent)"
            value={filters.city}
            onChange={(e) => onChange((prev) => ({ ...prev, city: e.target.value }))}
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>

        <div>
          <Input
            type="number"
            placeholder="Min UZS"
            value={filters.minPrice}
            onChange={(e) => onChange((prev) => ({ ...prev, minPrice: e.target.value }))}
            className="h-8 text-xs bg-background"
            min={0}
          />
        </div>

        <div>
          <Input
            type="number"
            placeholder="Max UZS"
            value={filters.maxPrice}
            onChange={(e) => onChange((prev) => ({ ...prev, maxPrice: e.target.value }))}
            className="h-8 text-xs bg-background"
            min={0}
          />
        </div>
      </div>

      {/* Reset Bar */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs text-muted-foreground">
          <span>Filters applied</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
            onClick={onReset}
          >
            <FilterX className="w-3.5 h-3.5 mr-1" />
            Reset filters
          </Button>
        </div>
      )}
    </div>
  )
}
