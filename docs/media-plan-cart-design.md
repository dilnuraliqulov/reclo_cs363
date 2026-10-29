# Media plan cart on the account: design (KAN-7 / KAN-30)

KAN-18 gave every browser a media-plan cart in `localStorage` (`docs/cart-design.md`). A client
can already collect up to 20 placements, but the plan lives on one device and is lost to a cleared
browser. KAN-7 makes the cart of a **signed-in client** live on the account, behind an API to add
and remove placements, so it follows them across devices. Visitors who are signed out, and vendors
and admins browsing the map, keep the local cart exactly as it is.

Turning a cart into inquiries (checkout) is still out of scope.

## Decisions

- **One row per placement in a `CartItem` table.** Composite primary key `(userId, placementId)`:
  a placement is in a cart at most once, which is the duplicate rule of KAN-18 enforced by the
  database. `addedAt` orders the list. Both foreign keys cascade on delete: a deleted user or
  placement takes its cart rows with it. No snapshot columns: title, price and photo are read from
  `Placement` on every response, so the account cart is never stale.
- **Only `CLIENT`s have an account cart.** The routes sit behind `requireAuth` and
  `requireRole('CLIENT')`, like the inquiry history. A vendor or admin gets `403`; their browser
  keeps the local cart. The user id always comes from the session, never from the request.
- **Only `ACTIVE` placements count.** Reading the cart first deletes the rows whose placement is no
  longer `ACTIVE` (archived, paused, back in review), then returns the rest. This is the restore
  pass of KAN-18 moved to the server: one query instead of one detail request per item. Adding a
  placement that is missing or not `ACTIVE` answers `404 PLACEMENT_NOT_FOUND`, the same answer as
  the public detail route, so the cart reveals nothing about hidden listings.
- **Same limit: 20.** `CART_MAX_ITEMS` from `packages/shared` bounds both carts. Adding a 21st
  placement answers `409 CART_FULL`. The count and the insert run in one transaction that first
  locks the user's row (`SELECT … FOR UPDATE`), so two racing adds cannot both pass the check.
- **Writes are idempotent.** `PUT` of a placement already in the cart and `DELETE` of one that is
  not both succeed. A retried request or a second tab never turns into an error. Every write
  answers with the whole cart, so the client never has to guess the result.
- **Merge on sign-in, then the server wins.** When a client signs in, or a page loads with a client
  session, the web app sends the ids in the local cart to `POST /api/cart/merge`. The server adds
  the ones that are `ACTIVE` and not yet in the cart, in the order given, until the cart is full,
  and answers with the merged cart. That answer replaces the local list. Anything that did not fit
  or is no longer `ACTIVE` is dropped, and the client is told with the existing `cart.pruned` toast.
- **`localStorage` becomes a mirror for clients.** The account cart is still written to the
  `reclo.cart` key, so a reload renders at once and other tabs sync through the `storage` event, as
  before. The merge on load replaces the per-item revalidation for clients.
- **Optimistic writes.** Add, remove and clear change the local list at once, then call the API.
  The server's answer replaces the list. If the call fails, a toast explains why and the app reloads
  the account cart with `GET /api/cart`; if that fails too, the local list stays as it is.
- **Sign-out clears the local mirror.** The plan is safe on the account, and leaving it in the
  browser would show it to the next person on a shared computer. KAN-18 could not do this because
  the browser was the only copy. A signed-out visitor's own local cart is untouched.

## API

All routes need a `CLIENT` session (`401 NOT_AUTHENTICATED`, `403 FORBIDDEN` otherwise). Writes are
rate limited per IP like the other write routes. Every `200` body is `{ items: CartItem[] }`,
oldest first, using `cartItemSchema` from `packages/shared` so both carts have one shape.

| Method and path                       | Body                       | Answers                                                                       |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/cart`                       | none                       | `200` the cart, after dropping placements that are not `ACTIVE`               |
| `PUT /api/cart/items/:placementId`    | none                       | `200`; `400 INVALID_PLACEMENT_ID`; `404 PLACEMENT_NOT_FOUND`; `409 CART_FULL` |
| `DELETE /api/cart/items/:placementId` | none                       | `200`, also when it was not in the cart; `400 INVALID_PLACEMENT_ID`           |
| `DELETE /api/cart`                    | none                       | `200` with `items: []`                                                        |
| `POST /api/cart/merge`                | `{ placementIds: uuid[] }` | `200` the merged cart; `400 INVALID_INPUT`                                    |

`placementIds` holds at most `CART_MAX_ITEMS` unique uuids (`mergeCartRequestSchema`); it may be
empty, which simply reads the cart.

## Data model

```prisma
model CartItem {
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  placementId String
  placement   Placement @relation(fields: [placementId], references: [id], onDelete: Cascade)
  addedAt     DateTime  @default(now())

  @@id([userId, placementId])
  @@index([placementId])
}
```

The primary key also serves "this user's cart". The `placementId` index serves the cascade.

Shared schemas (`packages/shared/src/cart.ts`): `cartResponseSchema` (`{ items }`, at most
`CART_MAX_ITEMS`), `mergeCartRequestSchema`, and the new error code `CART_FULL`.

## States (signed-in client)

| State                                  | Behaviour                                                             |
| -------------------------------------- | --------------------------------------------------------------------- |
| Page load or sign-in                   | Local ids merged into the account cart; the answer replaces the list. |
| Merge drops items (not `ACTIVE`, full) | One `cart.pruned` toast with the count.                               |
| Merge fails (offline, 5xx)             | Local list kept; next add/remove retries against the API.             |
| Add                                    | Shown at once; the server's cart replaces it.                         |
| Add at 20 items                        | Refused locally, as before; `409 CART_FULL` if the server disagrees.  |
| Add or remove fails                    | Toast with the error, then the account cart is reloaded.              |
| Placement archived meanwhile           | Gone from the next `GET` or merge.                                    |
| Sign-out                               | Local mirror cleared; the account keeps the cart.                     |
| Another tab changes the cart           | `storage` event, as in KAN-18.                                        |

## UI

No new screens. The cart dialog's subtitle says the plan is saved to the account instead of to this
device. The add button, the header badge and the dialog are unchanged.

## i18n keys

In `en`, `uz` and `ru`: `cart.subtitleAccount`, `cart.syncFailed`, and `error.CART_FULL`.

## Out of scope

- Checkout: sending the cart as inquiries.
- A cart for vendors and admins on their accounts.
