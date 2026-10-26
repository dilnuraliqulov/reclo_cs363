import { OPEN_INQUIRY_STATUSES, type Inquiry } from '@reclo/shared'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { OpenInquiryExistsError, type CreateInquiryInput, type InquiryStore } from './store'

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

type InquiryRow = Prisma.InquiryGetPayload<{ select: typeof inquirySelect }>

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

export function createPrismaInquiryStore(prisma: PrismaClient): InquiryStore {
  return {
    findActivePlacement: (id) =>
      prisma.placement.findFirst({
        where: { id, status: 'ACTIVE' },
        select: { id: true, vendorId: true },
      }),

    findOpenInquiry: ({ clientId, placementId, since }) =>
      prisma.inquiry.findFirst({
        where: {
          clientId,
          placementId,
          status: { in: [...OPEN_INQUIRY_STATUSES] },
          createdAt: { gte: since },
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),

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
  }
}
