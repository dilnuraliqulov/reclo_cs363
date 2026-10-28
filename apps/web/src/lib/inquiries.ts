import { INTL_LOCALE, type InquiryStatus, type Locale } from '@reclo/shared'

/**
 * Formats a stored E.164 number for display: "+998901234567" -> "+998 90 123 45 67".
 * The stored value stays canonical; this is presentation only.
 *
 * Locale-independent: a phone number is digits and spaces in every language.
 */
export function formatUzPhone(phone: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  if (!match) return phone
  const [, operator, first, second, third] = match
  return `+998 ${operator} ${first} ${second} ${third}`
}

/**
 * A short date for naming when an inquiry was sent: "26 Oct 2026", "26-okt, 2026", "26 окт. 2026 г."
 * The tag comes from `INTL_LOCALE`, so Russian readers keep Uzbek date order.
 */
export function formatInquiryDate(isoDate: string, locale: Locale): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * The badge variant for a status. The labels themselves live in the catalogs under
 * `inquiry.status.*`, because they are copy; this is decoration, so a row still reads correctly
 * without colour.
 */
const INQUIRY_STATUS_VARIANT: Record<InquiryStatus, 'default' | 'secondary' | 'outline'> = {
  NEW: 'secondary',
  READ: 'outline',
  RESPONDED: 'default',
  CLOSED: 'outline',
}

export function inquiryStatusVariant(status: InquiryStatus) {
  return INQUIRY_STATUS_VARIANT[status]
}
