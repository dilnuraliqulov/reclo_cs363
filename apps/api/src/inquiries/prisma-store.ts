import { OPEN_INQUIRY_STATUSES, type Inquiry, type InquiryHistoryItem } from '@reclo/shared'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import {
  OpenInquiryExistsError,
  type CreateInquiryInput,
  type InquiryStore,
  type ListClientInquiriesInput,
} from './store'

/** The columns that make up the client-facing `Inquiry`. */
const inquirySelect = {
  id: true,
  placementId: true,
  status: true,
  message: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  desiredStartDate: true,
  durationMonths: true,
  createdAt: true,
} as const

/**
 * A history row also carries its placement, so the list renders without a second fetch. The join
 * deliberately does not filter on `status: 'ACTIVE'`: a vendor archiving a listing must not erase
 * the client's record of what they sent.
 */
const historySelect = {
  ...inquirySelect,
  placement: { select: { id: true, title: true, city: true, type: true, status: true } },
} as const

type InquiryRow = Prisma.InquiryGetPayload<{ select: typeof inquirySelect }>
type HistoryRow = Prisma.InquiryGetPayload<{ select: typeof historySelect }>

function toInquiry(row: InquiryRow): Inquiry {
  return {
    id: row.id,
    placementId: row.placementId,
    status: row.status,
    message: row.message,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    // Date only over the wire; the stored time component is unused.
    desiredStartDate: row.desiredStartDate?.toISOString().slice(0, 10) ?? null,
    durationMonths: row.durationMonths,
    createdAt: row.createdAt.toISOString(),
  }
}

function toHistoryItem(row: HistoryRow): InquiryHistoryItem {
  return {
    ...toInquiry(row),
    placement: row.placement
      ? {
          id: row.placement.id,
          title: row.placement.title,
          city: row.placement.city,
          type: row.placement.type,
          // Only an ACTIVE placement is reachable on the map, so only it gets a link.
          isViewable: row.placement.status === 'ACTIVE',
        }
      : null,
  }
}

export function createPrismaInquiryStore(prisma: PrismaClient): InquiryStore {
  return {
    findActivePlacement: (id) =>
      prisma.placement.findFirst({
        where: { id, status: 'ACTIVE' },
        select: { id: true, vendorId: true },
      }),

    findOpenInquiry: ({ clientId, placementId }) =>
      prisma.inquiry.findFirst({
        where: { clientId, placementId, status: { in: [...OPEN_INQUIRY_STATUSES] } },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),

    async closeStaleInquiry(id) {
      // Scoped to the open statuses, so this cannot reopen or overwrite a vendor's own transition.
      const { count } = await prisma.inquiry.updateMany({
        where: { id, status: { in: [...OPEN_INQUIRY_STATUSES] } },
        data: { status: 'CLOSED' },
      })
      return count > 0
    },

    async createInquiry(input: CreateInquiryInput) {
      try {
        const row = await prisma.inquiry.create({ data: input, select: inquirySelect })
        return toInquiry(row)
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new OpenInquiryExistsError()
        }
        throw error
      }
    },

    async listClientInquiries({ clientId, status, cursor, limit }: ListClientInquiriesInput) {
      const rows = await prisma.inquiry.findMany({
        where: {
          clientId,
          ...(status ? { status } : {}),
          // Strictly older than the cursor by (createdAt, id). The id tie-break is what keeps two
          // inquiries sharing a createdAt from looping or skipping.
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: historySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      })
      return rows.map(toHistoryItem)
    },
  }
}
