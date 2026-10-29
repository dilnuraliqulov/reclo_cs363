import { useState } from 'react'
import { ShoppingBag, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useT } from '@/i18n/useLocale'
import { formatPlacementType, formatPrice } from '@/lib/placements'
import { useCart } from './context'

/** The header button with a count, opening the list of collected placements. */
export function CartDialog() {
  const t = useT()
  const { items, count, remove, clear } = useCart()
  const [open, setOpen] = useState(false)
  const total = items.reduce((sum, item) => sum + item.pricePerMonth, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5" />
          {t('cart.open')}
          {count > 0 && <Badge className="h-4 px-1.5 text-[10px]">{count}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('cart.title')}</DialogTitle>
          <DialogDescription>
            {count > 0 ? t('cart.items', { count }) : t('cart.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {count === 0 ? (
          <div className="py-6 text-center space-y-1">
            <p className="font-medium">{t('cart.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('cart.emptyBody')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 border rounded-lg p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{item.title}</p>
                  <p className="text-muted-foreground">
                    {formatPlacementType(item.type)} · {item.city}
                  </p>
                  <p className="font-medium mt-1">{formatPrice(item.pricePerMonth)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`${t('cart.remove')}: ${item.title}`}
                  onClick={() => remove(item.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {count > 0 && (
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <p className="text-sm">
              <span className="text-muted-foreground">{t('cart.total')}: </span>
              <span className="font-semibold">{formatPrice(total)}</span>
            </p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={clear}>
              <Trash2 className="w-3.5 h-3.5" />
              {t('cart.clear')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
