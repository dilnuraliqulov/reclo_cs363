import type { AdminInquiryDetail, AdminInquirySummary } from '@reclo/shared'
import type { Prisma, PrismaClient } from '../generated/prisma/client'
import { placementSummarySelect, toPlacementSummary } from '../inquiries/prisma-store'
import type { AdminInquiryStore, ListAdminInquiriesInput } from './inquiry-store'

const summarySelect = {
  id: true,
  status: true,
  contactName: true,
  contactEmail: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, email: true } },
  vendor: { select: { id: true, email: true, companyName: true } },
  placement: { select: placementSummarySelect },
} as const

const detailSelect = {
  ...summarySelect,
  message: true,
  contactPhone: true,
  desiredStartDate: true,
  durationMonths: true,
} as const

type SummaryRow = Prisma.InquiryGetPayload<{ select: typeof summarySelect }>
type DetailRow = Prisma.InquiryGetPayload<{ select: typeof detailSelect }>

function toSummary(row: SummaryRow): AdminInquirySummary {
  return {
    id: row.id,
    status: row.status,
    client: { id: row.client.id, email: row.client.email },
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    vendor: { id: row.vendor.id, email: row.vendor.email, companyName: row.vendor.companyName },
    placement: toPlacementSummary(row.placement),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toDetail(row: DetailRow): AdminInquiryDetail {
  return {
    ...toSummary(row),
    contactPhone: row.contactPhone,
    // Date only over the wire; the stored time component is unused.
    desiredStartDate: row.desiredStartDate?.toISOString().slice(0, 10) ?? null,
    durationMonths: row.durationMonths,
    // An inquiry carries one message today, the client's; vendor replies arrive with KAN-17.
    messages: [{ author: 'CLIENT', body: row.message, createdAt: row.createdAt.toISOString() }],
  }
}

function buildWhere({
  clientQuery,
  status,
  createdFrom,
  createdBefore,
}: ListAdminInquiriesInput): Prisma.InquiryWhereInput {
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })
  return {
    ...(status ? { status } : {}),
    ...(createdFrom || createdBefore
      ? {
          createdAt: {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdBefore ? { lt: createdBefore } : {}),
          },
        }
      : {}),
    ...(clientQuery
      ? {
          OR: [
            { client: { email: contains(clientQuery) } },
            { contactName: contains(clientQuery) },
            { contactEmail: contains(clientQuery) },
          ],
        }
      : {}),
  }
}

export function createPrismaAdminInquiryStore(prisma: PrismaClient): AdminInquiryStore {
  return {
    async listInquiries(input) {
      const where = buildWhere(input)
      // One snapshot, so the total matches the page it is shown with.
      const [rows, total] = await prisma.$transaction([
        prisma.inquiry.findMany({
          where,
          select: summarySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: input.skip,
          take: input.take,
        }),
        prisma.inquiry.count({ where }),
      ])
      return { inquiries: rows.map(toSummary), total }
    },

    async findInquiry(id) {
      const row = await prisma.inquiry.findUnique({ where: { id }, select: detailSelect })
      return row ? toDetail(row) : null
    },
  }
}
