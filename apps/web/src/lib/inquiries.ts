/**
 * Formats a stored E.164 number for display: "+998901234567" -> "+998 90 123 45 67".
 * The stored value stays canonical; this is presentation only.
 */
export function formatUzPhone(phone: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  if (!match) return phone
  const [, operator, first, second, third] = match
  return `+998 ${operator} ${first} ${second} ${third}`
}

/** "26 Oct 2026", for naming the date an earlier inquiry was sent. */
export function formatInquiryDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
