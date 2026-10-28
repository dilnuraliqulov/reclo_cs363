# Uzbek and Russian UI: design (KAN-19 / KAN-76)

The client-facing UI currently exists in English only. This task makes it readable in Uzbek and
Russian, which is what the Uzbekistan market actually needs, and adds a way to switch between them.

Every page built so far keeps its user-visible strings in a single `copy` object at the top of the
file, with a comment pointing at this task. That groundwork means the work here is largely
mechanical: the open questions are not "where are the strings" but which locales exist, who resolves
them, what happens to the strings the **server** sends, and what we deliberately do not translate.

## Scope

Translated:

- Every string in the client-facing React app: pages, components, button labels, empty states,
  toasts, `aria-label`s and placeholders.
- Enum labels the UI invents — placement types, inquiry statuses — which are presentation, not data.
- Dates, numbers and prices, through `Intl` with the active locale.
- The validation messages in `packages/shared`, which surface in forms through `FieldError`.
- The error messages the API returns, which surface in forms and toasts.

Not translated:

- **Vendor-authored content**: `Placement.title`, `description` and `address`. A vendor writes a
  listing once, in whichever language they chose; translating user content is a different product
  decision with a different cost, and guessing at it would put machine-translated Russian under a
  vendor's name. See "Localized content" below for what it would take.
- **`Placement.city`** is the exception: it is a short, effectively closed set shown in the filter
  bar, so known city names are mapped and unknown ones pass through unchanged.
- The admin and vendor screens. The requirement says _client-facing_, and the admin UI is internal.
  The machinery here is not client-only, so those screens can adopt it later for free.
- Email bodies (KAN-17, not yet built). Vendor notifications are a vendor-facing surface and should
  pick the recipient's locale, which needs a `User.locale` column — out of scope here, noted below.

## Decisions

- **Three locales, with Uzbek the default.** `uz` (Latin script), `ru`, and `en`. English stays for
  two reasons: it is the language every string is authored in, so it is the natural fallback for a
  key not yet translated, and it is what the team develops against. Uzbek is the default for a new
  visitor because this is an Uzbek marketplace. Uzbek Cyrillic is not a separate locale here — the
  Latin script is standard for commercial use, and adding `uz-Cyrl` later is a fourth catalog, not a
  redesign.
- **No i18n library.** `react-i18next` and `react-intl` both solve a harder problem than this one:
  runtime catalog loading, namespaces, interpolation parsers, ICU message syntax. What this app needs
  is a lookup, plural selection, and compile-time proof that a key exists in all three languages.
  A typed module in `apps/web/src/i18n` does that in about sixty lines and gives something no library
  gives us: the `en` catalog _is_ the key type, so a missing or misspelled Uzbek key is a TypeScript
  error rather than an English string appearing in production. The three catalogs are small enough
  (~115 keys, see the inventory) that shipping them in the bundle costs less than a loader.
- **The locale enum lives in `packages/shared`.** The API negotiates locale too, so by the project's
  one-definition rule `localeSchema` is a shared Zod enum. The _catalogs_ are not shared: they are
  presentation and belong in `apps/web`.
- **Resolution order: stored choice, then the browser, then Uzbek.** A `LocaleProvider` reads
  `localStorage['reclo.locale']`, validates it with `localeSchema` (a stale or hand-edited value must
  not crash the app), and otherwise walks `navigator.languages` for a prefix match. There is no
  `?lang=` parameter: a language is a property of the reader, not of the page, and putting it in the
  URL means every shared link carries one person's preference.
- **`<html lang>` follows the locale.** It drives hyphenation, screen-reader pronunciation and
  Chrome's translate prompt; leaving it at `en` while rendering Russian is the one i18n bug that is
  invisible on screen and obvious to a screen-reader user.
- **Plural categories, not a singular/plural pair.** Russian has three for counted nouns — 1 месяц,
  3 месяца, 5 месяцев — and the existing `durationMonths === 1 ? copy.month : copy.months` cannot
  express it. A counted entry is therefore an object keyed by `Intl.PluralRules` category, not a
  string. CLDR gives Uzbek and English two categories each (`one`, `other`), and Uzbek fills both
  with the same words because the noun does not inflect after a numeral.
- **The server returns codes; the client owns the words.** Localizing on the server means the API
  guesses the reader's language from a header, and means the same failure reads differently in a log
  and on screen. Instead each error response gains a stable `code`, and the web maps the code to
  copy. The English `error` string stays in the body unchanged: it is the fallback for a code the
  client does not recognise, and it is what belongs in a log line.
- **Shared validation messages become codes too**, for the same reason: `uzPhoneSchema` is used by
  both the form and the route, so its message cannot be in any one language.

## Locales and the catalog

```ts
// packages/shared/src/locale.ts
export const localeSchema = z.enum(['uz', 'ru', 'en'])
export type Locale = z.infer<typeof localeSchema>
export const DEFAULT_LOCALE: Locale = 'uz'
```

```ts
// apps/web/src/i18n/en.ts — the source catalog, and the shape the other two must match.
export const en = {
  'auth.signIn': 'Sign in',
  'inquiry.history.title': 'Your inquiries',
  // A counted noun carries one entry per plural category the locale uses.
  'inquiry.duration.months': { one: '{count} month', other: '{count} months' },
} as const

// apps/web/src/i18n/catalog.ts
export type MessageKey = keyof typeof en
/** Every locale must cover every key, in the plural categories that locale uses. */
type Catalog = { [K in MessageKey]: (typeof en)[K] extends string ? string : PluralForms }
export const catalogs: Record<Locale, Catalog> = { uz, ru, en }
```

Keys are dotted and grouped by surface (`inquiry.history.*`, `placement.filters.*`, `error.*`), not
by file, so moving a component does not rename a string. Interpolation is a single `{name}`
placeholder replaced by `String(value)` — deliberately not an expression language.

`useT()` returns the lookup bound to the active locale:

```ts
const t = useT()
t('auth.signIn') // 'Kirish'
t('inquiry.duration.months', { count: 3 }) // '3 месяца'
```

A missing key cannot compile. A key whose entry is missing at runtime (a hand-edited catalog, a
locale file that failed to load) falls back to the `en` entry and warns in development, rather than
rendering the key itself at a user.

## Plural selection

`Intl.PluralRules` decides the category; the catalog supplies the words. Verified in this repo's
Node:

| n   | `uz`  | `ru` | `en`  |
| --- | ----- | ---- | ----- |
| 1   | one   | one  | one   |
| 2   | other | few  | other |
| 5   | other | many | other |
| 21  | other | one  | other |

So Russian needs `one`, `few` and `many`, plus `other` for fractions such as 1.5; `21 месяц` taking
the same form as `1 месяц` is exactly the case a hand-written `n === 1` check gets wrong. Because
`other` exists in every locale, it is also the safe fallback when a number lands in a category the
catalog does not list. The only counted nouns in the UI today are campaign
duration in months (the inquiry dialog and the history row) and the filter bar's applied-filter
count, but the mechanism has to exist before the first Russian string is written.

## Dates, numbers and prices

Two formatters currently hardcode a locale: `formatInquiryDate` uses `'en-GB'` and `formatPrice` uses
`'uz-UZ'`. Both take the active locale instead, mapped to a BCP-47 tag:

| App locale | Intl tag | Date (26 Oct 2026) | Number (1234567) |
| ---------- | -------- | ------------------ | ---------------- |
| `uz`       | `uz-UZ`  | `26-okt, 2026`     | `1 234 567`      |
| `ru`       | `ru-UZ`  | `26 окт. 2026 г.`  | `1 234 567`      |
| `en`       | `en-GB`  | `26 Oct 2026`      | `1,234,567`      |

Russian maps to `ru-UZ`, not `ru-RU`: the reader is in Uzbekistan, so number grouping and date order
should stay local even when the words are Russian. All three tags resolve with real data in the
bundled ICU — checked, not assumed.

`UZS` stays as a literal suffix rather than becoming `style: 'currency'`. Intl renders the UZS symbol
as `UZS` or `сўм` depending on locale and version, and the compact forms (`2M UZS`) are hand-built
anyway; a currency style would make the map pins inconsistent with the cards for no gain.

`formatUzPhone` is locale-independent: a phone number is digits and spaces in every language.

**The Cyrillic subset is already covered.** `@fontsource-variable/geist` ships `cyrillic` and
`cyrillic-ext` woff2 files and the `index.css` the app imports declares all of them with
`unicode-range`, so Russian text uses Geist and loads only the subset it needs. No font work.

## The language switcher

A new `apps/web/src/components/i18n/LanguageSwitcher.tsx`, built from the shadcn `select` already
vendored in `components/ui` — no new component to add, and `Select` gives keyboard and screen-reader
behaviour that a hand-rolled menu would not.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Your inquiries                              ┌────────┐  ┌──────────┐ │
│ Everything you have sent to vendors…        │ UZ  ▾  │  │ AuthCtrl │ │
└──────────────────────────────────────────────────────────────────────┘
```

- Sits in the page header, immediately before `AuthControls`, at the same `h-8 text-xs` scale as the
  buttons beside it.
- The trigger shows the two-letter code (`UZ`, `RU`, `EN`); the open list shows the endonym —
  `O'zbekcha`, `Русский`, `English`. A language is named in its own language: someone who cannot read
  the current UI still has to find their own.
- Visible to signed-out visitors, which is why it is its own component rather than part of
  `AuthControls` — choosing a language must not require an account.
- Changing it writes `localStorage` and updates `<html lang>` synchronously. No reload: the provider
  re-renders and React swaps the strings.

Both `InquiryHistoryPage` and `PlacementsDiscoveryPage` carry their own hand-written header, so the
switcher is placed twice. The sign-in and sign-up pages have no header at all, so it sits at their
top right: a visitor who cannot read the form has to be able to switch before signing in. That duplication predates this task and is left alone here; pulling the two
headers into one component is a worthwhile cleanup but not one to bundle into a translation change.

## API changes (KAN-77)

### Error codes

`apiErrorSchema` gains an optional `code`, and every error response sets it:

```ts
export const apiErrorSchema = z.object({
  error: z.string(), // English, for logs and as a last-resort fallback
  code: errorCodeSchema.optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})
```

`code` is optional so existing clients and tests keep parsing, and so a route that has not been
updated yet degrades to its English string rather than failing validation. The thirteen messages in
the API map to codes one for one:

| Code                     | Current message                                     |
| ------------------------ | --------------------------------------------------- |
| `NOT_AUTHENTICATED`      | Not authenticated                                   |
| `FORBIDDEN`              | Forbidden                                           |
| `INVALID_CREDENTIALS`    | Invalid email or password                           |
| `EMAIL_TAKEN`            | Email is already registered                         |
| `INVALID_INPUT`          | Invalid input                                       |
| `INVALID_QUERY`          | Invalid query parameters                            |
| `MALFORMED_JSON`         | Malformed JSON                                      |
| `INVALID_PLACEMENT_ID`   | Invalid placement id                                |
| `PLACEMENT_NOT_FOUND`    | Placement not found                                 |
| `DUPLICATE_INQUIRY`      | You already have an open inquiry for this placement |
| `RATE_LIMITED`           | Too many attempts, try again later                  |
| `MARKER_QUERY_FAILED`    | Failed to query map markers                         |
| `PLACEMENT_FETCH_FAILED` | Failed to fetch placement detail                    |
| `INTERNAL`               | Something went wrong                                |

`errorCodeSchema` is a shared Zod enum, so the web's `error.*` catalog keys and the API's codes
cannot drift apart without a type error. Field-level codes live in the separate `validation.*`
namespace and are listed in `VALIDATION_CODES`, because a field error and a whole-response error are
shown in different places; `validation.email.taken` is the field counterpart of `EMAIL_TAKEN`. `ApiRequestError` already carries the parsed body, so it
gains a `code` field and the call sites that currently show `error.message` show `t(...)` instead.

### Validation messages

The custom messages in shared schemas become codes in the same namespace:

```ts
.pipe(z.string().regex(/^\+998\d{9}$/, 'validation.phone.uz'))
.min(MESSAGE_MIN_LENGTH, 'validation.message.tooShort')
```

`FieldError` renders `t(code)` when the string is a known key and the raw string otherwise, so a
Zod built-in message that we never customised still displays. Two consequences worth stating plainly:
the `fieldErrors` an API response carries become codes rather than sentences, and a handful of
existing tests assert on those sentences and will need updating — that work belongs to KAN-77, not
to KAN-79.

Messages that interpolate a shared constant (`Message must be at least 10 characters`) lose the
interpolation on the wire and regain it in the catalog, which can read `MESSAGE_MIN_LENGTH` directly.

### Localized content

No schema change. `Accept-Language` is not read, and no `?locale=` parameter is added: nothing the
API returns is language-dependent once error strings are codes.

If the product later wants vendor listings in two languages, the shape is a `PlacementTranslation`
table (`placementId`, `locale`, `title`, `description`) with the `Placement` columns kept as the
vendor's original, plus locale negotiation on the read routes. That is a feature, not a refactor, and
it should not be smuggled into this task. The same applies to `User.locale`, which KAN-17's vendor
emails will need in order to pick a language for a recipient who is not holding a browser.

## String inventory

What KAN-78 has to touch, counted from the current `main`:

| Surface                           | Strings | State today               |
| --------------------------------- | ------: | ------------------------- |
| `InquiryFormDialog`               |      20 | `copy` object             |
| `InquiryHistoryPage`              |      12 | `copy` object             |
| `InquiryHistoryRow`               |       9 | `copy` object             |
| `AuthControls`                    |       7 | `copy` object             |
| `SignInPage` / `SignUpPage`       |      17 | `copy` objects            |
| `lib/inquiries.ts` status labels  |       4 | `INQUIRY_STATUS` map      |
| `lib/placements.ts` type labels   |       4 | `formatPlacementType`     |
| `PlacementMap`                    |       7 | inline, no `copy` object  |
| `PlacementFilters`                |       4 | inline, no `copy` object  |
| `PlacementDetailModal`            |       4 | inline, no `copy` object  |
| `PlacementList` / `PlacementCard` |       5 | inline, no `copy` object  |
| `PlacementsDiscoveryPage`         |       2 | inline, no `copy` object  |
| API error codes                   |      13 | English in route handlers |
| Shared validation messages        |      ~8 | English in Zod schemas    |

Roughly 115 keys, written three times over. The city-name map is separate and short: the seeded cities
plus whatever vendors have entered.

## Sequencing

The screens split cleanly into work that is safe now and work that is not:

1. **Catalogs, provider, switcher, formatters** — new files, no conflicts.
2. **Auth and inquiry screens** — all merged and stable, and all already have `copy` objects.
3. **Placement screens** — `PlacementsDiscoveryPage`, `PlacementMap`, `PlacementFilters`,
   `PlacementCard`, `PlacementDetailModal`. These are the ones with no `copy` object, and they are
   also the ones teammates are editing right now: KAN-10 is in progress and PR #35 (KAN-12) has open
   changes to `PlacementsDiscoveryPage.tsx`. Converting them to keyed lookups rewrites nearly every
   JSX line that holds text, which is the worst possible diff to put under someone else's open
   branch. **KAN-78 should do groups 1 and 2, and take group 3 only after KAN-10 and KAN-12 land**;
   if they have not landed, group 3 moves to a follow-up subtask rather than blocking the rest.
   The switcher itself is still placed in that page's header in group 2, as a one-line insertion:
   leaving the app's main page with no way to change language would be worse than leaving some of
   its own strings in English for a while.

KAN-77 (error codes) is independent of all three and can go first or last; the web falls back to the
English `error` string until it lands, so neither side waits on the other.

## Testing notes (KAN-79)

- **The provider's default in tests is `en`.** The existing web suite asserts English copy in a few
  hundred places, and flipping the default to `uz` would rewrite all of it to prove nothing. The test
  wrapper pins `en`; a test that cares about language says so. The honest consequence: pinning `en`
  means English is the only locale the existing suite covers, which is precisely what the tests below
  are for.
- A catalog completeness test: for each locale, every `MessageKey` resolves to a non-empty string,
  and for each counted key, every plural category `Intl.PluralRules` lists for that locale is
  present. This is the test that catches a half-finished translation, and it is worth more than any
  number of rendered-screen assertions.
- Plural selection per locale, driven by the table above: Russian `1 / 3 / 5 / 21` months each render
  their own form.
- One full screen per locale — the inquiry history page in `uz` and `ru` — asserting a translated
  heading and a translated status label, so a catalog that type-checks but is wired up wrong fails.
- Resolution: a stored locale wins over the browser; an invalid stored value falls back rather than
  throwing; `navigator.languages` of `['ru-RU']` resolves `ru`; nothing recognisable resolves `uz`.
- The switcher: changing it swaps the rendered strings, persists to `localStorage`, and updates
  `<html lang>`; the list names each language in its own language.
- Formatters: the same date and price through all three locales, matching the table above.
- Error codes end to end: a route returning `DUPLICATE_INQUIRY` renders the Russian sentence, and an
  unknown code falls back to the response's `error` string rather than rendering the code.

**What KAN-79 found.** The last item above did not hold. `apiErrorSchema` validated `code` against
the enum, so a code from a newer API failed the whole body and the client threw away the server's
`error` sentence along with it, showing a generic apology instead. `code` is now
`errorCodeSchema.optional().catch(undefined)`: an unrecognised code falls away, the sentence
survives, and the reader gets English rather than nothing. This is the only production change in a
testing subtask, and it is here because a test asked for the behaviour the design had promised.

## Open questions

- **Is `uz` the right default, or should a first-time visitor get what their browser asks for with no
  Uzbek bias?** The design resolves browser languages first and only falls back to `uz`, which gives
  both — but it means a Tashkent user with an English-configured laptop sees English. That is a
  product call, not a technical one.
- **Who writes the translations?** This design produces the slots, not the words. ~115 keys need a
  native Uzbek and Russian speaker; machine translation of UI copy in a marketplace that handles
  money is not good enough, and a wrong status label ("Replied" vs "Seen") actively misleads.
- **Uzbek Cyrillic** is deliberately absent. Worth asking whether any part of the audience needs it.
