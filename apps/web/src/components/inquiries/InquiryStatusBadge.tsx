import type { InquiryStatus } from '@reclo/shared'
import { Badge } from '@/components/ui/badge'
import { inquiryStatusLabel, inquiryStatusVariant } from '@/lib/inquiries'

/** The vendor's workflow status, read-only. The label carries the meaning, not the colour. */
export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  return <Badge variant={inquiryStatusVariant(status)}>{inquiryStatusLabel(status)}</Badge>
}
