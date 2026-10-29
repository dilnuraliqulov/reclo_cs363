# Client-side cart ("media plan"): design (KAN-18 / KAN-73)

A client collects placements while browsing and the list must survive a reload, a closed tab and a
new session on the same browser. This is the **storage and restore** half of the media-plan idea. It
is frontend-only: no API route, no table, no `schema.prisma` change. Turning a cart into inquiries
(checkout) is out of scope (KAN-7).

## Decisions

- **`localStorage`, not IndexedDB.** The cart is at most a few dozen small records, read
  synchronously on first render. IndexedDB is asynchronous, which would force a loading state for
  data that is needed before the header can show a count. `localStorage` also fires the `storage`
  event across tabs for free. The locale choice already uses it (`i18n/context.ts`).
- **One key, one versioned JSON document.** Key `reclo.cart`. Value:
  `{ "version": 1, "items": [ { "id", "title", "type", "city", "address", "pricePerMonth", "photo?", "addedAt" } ] }`.
  Any change to the item shape bumps `version`; there is no migration code until a second version
  exists. An unknown version is treated like corrupt data.
- **Store a snapshot, and revalidate it.** The item keeps the placement `id` plus the fields a row
  needs to render (title, type, city, address, price, optional photo, `addedAt` as ISO string). The
  cart therefore renders immediately and offline. The snapshot is **not** authoritative: on load the
  app re-fetches each placement through the existing public `GET /api/placements/:id` and
  - refreshes the snapshot when the placement is still `ACTIVE` (price and title may have changed),
  - **removes** the item when the endpoint answers `404` or the status is not `ACTIVE` (archived,
    inactive, pending review, deleted), and tells the client with one toast,
  - **keeps** the item untouched on network errors or 5xx. An offline visit must not empty the cart.
- **Schema in `packages/shared`.** `cartItemSchema`, `cartStateSchema`, `CART_STORAGE_KEY`,
  `CART_VERSION` and `CART_MAX_ITEMS` live there, per the validation rule. Types come from
  `z.infer`.
- **Validate on read, never trust storage.** Reading does `JSON.parse` then `cartStateSchema`.
  Malformed JSON, a wrong shape, a wrong `version`, or foreign data under the key all yield an
  **empty cart**, never an exception. Valid items in an otherwise bad array are not salvaged:
  partial recovery would hide corruption and re-adding is cheap. Reading has no side effects; the
  corrupt value stays until the next write overwrites it.
- **Duplicates collapse.** `add` of an id already present is a no-op; the button then reads
  "In media plan" and removes on click. The schema also rejects duplicate ids on read.
- **Max 20 items.** A media plan larger than that is unusable as one inquiry batch, and it bounds
  the restore fan-out (one detail request per item) and the stored size (about 1 KB per item).
  `add` past the limit is refused and the UI says so. A stored list longer than the limit fails
  validation and the cart is empty.
- **Storage failures degrade to an in-memory cart.** Reading or writing can throw
  (`SecurityError` when storage is blocked, `QuotaExceededError` when full, Safari private mode).
  The store catches both: the cart keeps working for the page's lifetime and a notice tells the
  client it will not be remembered.
- **Multi-tab sync via the `storage` event.** The store subscribes to `storage` for the cart key
  (and `key === null`, which means `clear()` in another tab), re-reads and validates, and notifies
  subscribers. The tab that wrote does not receive its own event, so there is no loop. The store is
  exposed with `useSyncExternalStore`, so every consumer re-renders from one snapshot.
- **One cart per browser, not per account.** Logged-out visitors can build a plan (the map is
  public) and signing in must not lose it. The cart is not cleared on sign-out and not keyed by
  user id. Consequence on a shared computer: the next person sees the previous plan; Clear is one
  click in the cart. Revisit when checkout (KAN-7) attaches a cart to an account.
- **Privacy.** The cart holds only public listing data the client already saw, plus a timestamp. No
  contact details, no account id, no analytics. It never leaves the browser; revalidation only
  requests placement ids the client chose. Clearing site data removes it.
- **Pruning runs once per page load, not on every render.** A provider runs the restore pass on
  mount (not again on a multi-tab update), without retries, to avoid hammering the API.

## Data model

```ts
const cartItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: placementTypeSchema,
  city: z.string(),
  address: z.string(),
  pricePerMonth: z.number().int().nonnegative(),
  photo: z.string().url().optional(),
  addedAt: z.string().datetime(),
})
const cartStateSchema = z.object({
  version: z.literal(1),
  items: z.array(cartItemSchema).max(CART_MAX_ITEMS), // + unique ids
})
```

Store API (`useCart()`): `items`, `count`, `has(id)`, `add(marker)` returning `'added' | 'duplicate'
| 'full'`, `remove(id)`, `clear()`, `isPersistent`. A `PlacementMarker` is enough to build an item,
so the button works before the detail request resolves.

## States

| State                                | Behaviour                                                         |
| ------------------------------------ | ----------------------------------------------------------------- |
| No stored value                      | Empty cart.                                                       |
| Corrupt JSON / wrong shape / version | Empty cart, no error shown.                                       |
| Valid stored cart                    | Items render at once from the snapshot; revalidation runs behind. |
| Placement 404 or not `ACTIVE`        | Item removed, one summary toast.                                  |
| Network or 5xx during revalidation   | Item kept as is.                                                  |
| Add duplicate                        | No-op; the button already reads "In media plan".                  |
| Add at 20 items                      | Refused, toast says the plan is full.                             |
| Storage throws (blocked/quota)       | In-memory cart, one notice that it will not be remembered.        |
| Another tab changes the cart         | `storage` event: re-read, validate, re-render.                    |

## UI

- Detail modal footer: **Add to media plan** button that toggles to **In media plan** (with a check)
  and removes on click. Built from the shadcn `Button`.
- Header: a cart button with a count badge (shadcn `Button` + `Badge`) opening a shadcn `Dialog`
  listing items (title, type, city, price), a remove button per row, the total monthly price and
  **Clear**. The empty state points back to the map.
- No new route, no redesign of the map.

## i18n keys

All in `en`, `uz`, `ru` under `cart.*`: `open`, `title`, `subtitle`, `empty`, `emptyBody`, `add`,
`inPlan`, `remove`, `clear`, `total`, `full` (`{max}`), `added`, `pruned` (plural, `{count}`),
`notPersistent`, `items` (plural, `{count}`), `close`. Placement type labels reuse the existing ones.

## Open questions

- Should checkout (KAN-7) send the whole cart as one multi-placement inquiry or one inquiry per
  item? This design stores only what either needs.
- Should a signed-in client's cart sync to the account so it follows them across devices? Not done
  here; it needs an API and a merge rule.
- 20 items is a guess; adjust if clients hit it.
