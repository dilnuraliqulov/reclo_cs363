import type { Inquiry, Locale, PlacementType } from '@reclo/shared'

/** What the new-inquiry email shows. Everything here is already validated or stored data. */
export interface NewInquiryEmailData {
  inquiry: Inquiry
  placement: { id: string; title: string; address: string; city: string; type: PlacementType }
  vendorCompanyName: string | null
  /** Origin of the web app, for the link to the listing. */
  webPublicUrl: string
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

/** The languages the email is written in, in the order the blocks appear. */
type EmailLocale = Extract<Locale, 'uz' | 'ru'>
const EMAIL_LOCALES: readonly EmailLocale[] = ['uz', 'ru']

const SUBJECT_TITLE_MAX_LENGTH = 80

// Uzbekistan is UTC+5 all year: it has had no daylight saving since 1991.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000

const ruMonthRules = new Intl.PluralRules('ru')

const copy = {
  uz: {
    greeting: (company: string | null) =>
      company ? `Assalomu alaykum, ${company}!` : 'Assalomu alaykum!',
    intro: "E'loningiz bo'yicha yangi so'rov keldi.",
    heading: "Yangi so'rov",
    client: 'Mijoz',
    phone: 'Telefon',
    email: 'Email',
    startDate: 'Boshlanish sanasi',
    duration: 'Muddat',
    // Uzbek does not inflect a noun after a numeral.
    months: (count: number) => `${count} oy`,
    message: 'Xabar',
    replyHint: "Javob berish uchun ushbu xatga javob yozing — u to'g'ridan-to'g'ri mijozga boradi.",
    listing: "E'lon",
    openListing: "E'lonni ochish",
    types: { BILLBOARD: 'Bilbord', LED_SCREEN: 'LED ekran' },
  },
  ru: {
    // "Уважаемый" would have to agree with a gender the account does not record.
    greeting: (company: string | null) => (company ? `Здравствуйте, ${company}!` : 'Здравствуйте!'),
    intro: 'По вашему объявлению пришёл новый запрос.',
    heading: 'Новый запрос',
    client: 'Клиент',
    phone: 'Телефон',
    email: 'Email',
    startDate: 'Дата начала',
    duration: 'Срок',
    months: (count: number) => {
      const forms = { one: 'месяц', few: 'месяца', many: 'месяцев', other: 'месяца' } as const
      const category = ruMonthRules.select(count) as keyof typeof forms
      return `${count} ${forms[category]}`
    },
    message: 'Сообщение',
    replyHint: 'Чтобы ответить, просто ответьте на это письмо — оно уйдёт напрямую клиенту.',
    listing: 'Объявление',
    openListing: 'Открыть объявление',
    types: { BILLBOARD: 'Билборд', LED_SCREEN: 'LED-экран' },
  },
} satisfies Record<EmailLocale, unknown>

/** Renders the vendor notification for one new inquiry, in Uzbek then Russian. Does no I/O. */
export function renderNewInquiryEmail(data: NewInquiryEmailData): RenderedEmail {
  return {
    subject: renderSubject(data.placement.title),
    text: renderText(data),
    html: renderHtml(data),
  }
}

function renderSubject(title: string): string {
  // A title with a line break must not be able to start a new header.
  const oneLine = title.replace(/[\r\n]+/g, ' ').trim()
  const short =
    oneLine.length > SUBJECT_TITLE_MAX_LENGTH
      ? `${oneLine.slice(0, SUBJECT_TITLE_MAX_LENGTH - 1).trimEnd()}…`
      : oneLine
  return `Yangi so'rov / Новый запрос: ${short}`
}

interface Row {
  label: string
  text: string
  /** Pre-escaped HTML for the value; defaults to the escaped `text`. */
  html?: string
}

function detailRows(data: NewInquiryEmailData, locale: EmailLocale): Row[] {
  const t = copy[locale]
  const { inquiry } = data
  const phone = formatUzPhone(inquiry.contactPhone)
  const telegram = telegramUrl(inquiry.contactPhone)
  const rows: Row[] = [
    { label: t.client, text: inquiry.contactName },
    {
      label: t.phone,
      text: `${phone} (Telegram: ${telegram})`,
      html:
        `<a href="tel:${escapeHtml(inquiry.contactPhone)}" style="color:#18181b;">${escapeHtml(phone)}</a>` +
        ` · <a href="${escapeHtml(telegram)}" style="color:#2563eb;">Telegram</a>`,
    },
    {
      label: t.email,
      text: inquiry.contactEmail,
      html: `<a href="mailto:${escapeHtml(inquiry.contactEmail)}" style="color:#2563eb;">${escapeHtml(inquiry.contactEmail)}</a>`,
    },
  ]
  if (inquiry.desiredStartDate) {
    rows.push({ label: t.startDate, text: formatDate(inquiry.desiredStartDate) })
  }
  if (inquiry.durationMonths !== null) {
    rows.push({ label: t.duration, text: t.months(inquiry.durationMonths) })
  }
  return rows
}

function listingUrl(data: NewInquiryEmailData): string {
  const origin = data.webPublicUrl.replace(/\/+$/, '')
  return `${origin}/vendor/placements/${encodeURIComponent(data.placement.id)}/edit`
}

function placementLine(data: NewInquiryEmailData, locale: EmailLocale): string {
  const { address, city, type } = data.placement
  return `${address}, ${city} · ${copy[locale].types[type]}`
}

function footerLine(inquiry: Inquiry): string {
  return `Reclo · so'rov / запрос ${inquiry.id} · ${formatTashkentDateTime(inquiry.createdAt)} (Toshkent)`
}

const TEXT_DIVIDER = '─'.repeat(32)

function renderText(data: NewInquiryEmailData): string {
  const blocks = EMAIL_LOCALES.map((locale) => {
    const t = copy[locale]
    return [
      t.greeting(data.vendorCompanyName),
      t.intro,
      '',
      `${t.heading}: ${data.placement.title}`,
      placementLine(data, locale),
      '',
      ...detailRows(data, locale).map((row) => `${row.label}: ${row.text}`),
      '',
      `${t.message}:`,
      data.inquiry.message,
      '',
      t.replyHint,
      `${t.listing}: ${listingUrl(data)}`,
    ].join('\n')
  })
  return [...blocks, footerLine(data.inquiry)].join(`\n\n${TEXT_DIVIDER}\n\n`) + '\n'
}

function renderHtml(data: NewInquiryEmailData): string {
  const url = escapeHtml(listingUrl(data))
  const blocks = EMAIL_LOCALES.map((locale) => {
    const t = copy[locale]
    const rows = detailRows(data, locale)
      .map(
        (row) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#71717a;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>` +
          `<td style="padding:4px 0;">${row.html ?? escapeHtml(row.text)}</td></tr>`,
      )
      .join('')
    return `<tr><td lang="${locale}" style="padding:24px;">
<p style="margin:0 0 4px;">${escapeHtml(t.greeting(data.vendorCompanyName))}</p>
<p style="margin:0 0 16px;color:#52525b;">${escapeHtml(t.intro)}</p>
<h2 style="margin:0 0 4px;font-size:18px;">${escapeHtml(t.heading)}: ${escapeHtml(data.placement.title)}</h2>
<p style="margin:0 0 16px;color:#52525b;">${escapeHtml(placementLine(data, locale))}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px;">${rows}</table>
<p style="margin:0 0 4px;color:#71717a;font-size:14px;">${escapeHtml(t.message)}</p>
<div style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:14px;">${multiline(data.inquiry.message)}</div>
<p style="margin:0 0 16px;font-size:14px;">${escapeHtml(t.replyHint)}</p>
<a href="${url}" style="display:inline-block;padding:10px 16px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;">${escapeHtml(t.openListing)}</a>
</td></tr>`
  })

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 8px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5;">
${blocks.join('\n<tr><td style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;">&nbsp;</td></tr>\n')}
<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;">${escapeHtml(footerLine(data.inquiry))}</td></tr>
</table>
</td></tr></table>
</body></html>
`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapes first, then keeps the line breaks: never the other way round. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>')
}

/** `+998901234567` -> `+998 90 123 45 67`. Anything else passes through unchanged. */
export function formatUzPhone(e164: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164)
  return match ? `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : e164
}

function telegramUrl(e164: string): string {
  return `https://t.me/${e164}`
}

/** `2026-12-01` -> `01.12.2026`, from the parts, so no timezone can shift the day. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

/** An ISO instant as `DD.MM.YYYY HH:mm` in Tashkent. */
export function formatTashkentDateTime(iso: string): string {
  const local = new Date(new Date(iso).getTime() + TASHKENT_OFFSET_MS)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
  )
}
