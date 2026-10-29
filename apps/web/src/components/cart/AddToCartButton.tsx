import { CART_MAX_ITEMS, type PlacementDetail, type PlacementMarker } from '@reclo/shared'
import { Check, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useLocale'
import { useCart } from './context'

/** Adds the placement to the media plan; once it is in, the same button takes it back out. */
export function AddToCartButton({ placement }: { placement: PlacementMarker | PlacementDetail }) {
  const t = useT()
  const { has, add, remove } = useCart()
  const inPlan = has(placement.id)

  return (
    <Button
      variant={inPlan ? 'secondary' : 'outline'}
      className="gap-1.5"
      aria-pressed={inPlan}
      onClick={() => {
        if (inPlan) return remove(placement.id)
        const result = add(placement)
        if (result === 'full') toast.error(t('cart.full', { max: CART_MAX_ITEMS }))
        else if (result === 'added') toast.success(t('cart.added'))
      }}
    >
      {inPlan ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
      {inPlan ? t('cart.inPlan') : t('cart.add')}
    </Button>
  )
}
