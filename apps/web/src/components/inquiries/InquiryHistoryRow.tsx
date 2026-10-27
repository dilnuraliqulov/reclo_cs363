import type { InquiryHistoryItem } from '@reclo/shared'
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatInquiryDate, formatUzPhone } from '@/lib/inquiries'
import { InquiryStatusBadge } from './InquiryStatusBadge'

// All user-visible strings for this row, in one place for the future translation task (KAN-19).
const copy = {
  message: 'Message',
  campaign: 'Campaign',
  contact: 'Contact',
  start: 'Preferred start',
  duration: 'Duration',
  month: 'month',
  months: 'months',
  unavailable: 'This placement is no longer listed',
  deleted: 'Placement removed',
}

function campaignSummary(inquiry: InquiryHistoryItem): string | null {
  const parts: string[] = []
  if (inquiry.desiredStartDate) {
    parts.push(`${copy.start}: ${formatInquiryDate(inquiry.desiredStartDate)}`)
  }
  if (inquiry.durationMonths !== null) {
    const unit = inquiry.durationMonths === 1 ? copy.month : copy.months
    parts.push(`${copy.duration}: ${inquiry.durationMonths} ${unit}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/** One inquiry: a summary row that expands to the message and the contact details that were sent. */
export function InquiryHistoryRow({ inquiry }: { inquiry: InquiryHistoryItem }) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const { placement } = inquiry
  const campaign = campaignSummary(inquiry)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <li className="rounded-lg border border-border/80 bg-background">
        <CollapsibleTrigger
          aria-controls={panelId}
          className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none rounded-lg"
        >
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{placement?.title ?? copy.deleted}</p>
            <p className="truncate text-xs text-muted-foreground">{placement?.city ?? ''}</p>
          </div>
          <InquiryStatusBadge status={inquiry.status} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatInquiryDate(inquiry.createdAt)}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent id={panelId}>
          <div className="space-y-3 border-t border-border/60 p-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.message}</p>
              {/* Stored and rendered as plain text; nothing in this pipeline renders it as HTML. */}
              <p className="whitespace-pre-wrap">{inquiry.message}</p>
            </div>

            {campaign && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.campaign}</p>
                <p>{campaign}</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{copy.contact}</p>
              <p>
                {inquiry.contactName} · {formatUzPhone(inquiry.contactPhone)} ·{' '}
                {inquiry.contactEmail}
              </p>
            </div>

            {/* Only an ACTIVE placement is reachable on the map. An archived one keeps its row — the
                client's record of what they sent — but has nowhere to link to. */}
            {placement?.isViewable ? (
              <Link
                to={`/placements?focus=${placement.id}`}
                className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {placement.title}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">{copy.unavailable}</p>
            )}
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  )
}
