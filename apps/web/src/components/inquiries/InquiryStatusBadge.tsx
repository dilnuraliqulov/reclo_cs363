import type { InquiryStatus } from '@reclo/shared'
import { Badge } from '@/components/ui/badge'
import { statusKey, useT } from '@/i18n/useLocale'
import { inquiryStatusVariant } from '@/lib/inquiries'

/** The vendor's workflow status, read-only. The label carries the meaning, not the colour. */
export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const t = useT()
  return <Badge variant={inquiryStatusVariant(status)}>{t(statusKey(status))}</Badge>
}
