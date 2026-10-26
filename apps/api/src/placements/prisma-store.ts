import type { MapBoundsQuery, PlacementDetail, PlacementMarker } from '@reclo/shared'
import type { PrismaClient } from '../generated/prisma/client'
import type { PlacementStore } from './store'
import { getPlacementTier } from './tier'

export class PrismaPlacementStore implements PlacementStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findMapMarkers(query: MapBoundsQuery): Promise<PlacementMarker[]> {
    const { minLat, maxLat, minLng, maxLng, type, city, minPrice, maxPrice } = query

    const placements = await this.prisma.placement.findMany({
      where: {
        status: 'ACTIVE',
        latitude: {
          gte: minLat,
          lte: maxLat,
        },
        longitude: {
          gte: minLng,
          lte: maxLng,
        },
        ...(type ? { type } : {}),
        ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
        ...(minPrice !== undefined || maxPrice !== undefined
          ? {
              pricePerMonth: {
                ...(minPrice !== undefined ? { gte: minPrice } : {}),
                ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        latitude: true,
        longitude: true,
        address: true,
        city: true,
        pricePerMonth: true,
        photos: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return placements.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      status: p.status,
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
      city: p.city,
      pricePerMonth: p.pricePerMonth,
      ...(p.photos.length > 0 ? { photo: p.photos[0] } : {}),
    }))
  }

  async findPlacementDetail(id: string): Promise<PlacementDetail | null> {
    const placement = await this.prisma.placement.findFirst({
      where: {
        id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        latitude: true,
        longitude: true,
        address: true,
        city: true,
        pricePerMonth: true,
        description: true,
        width: true,
        height: true,
        lighting: true,
        photos: true,
        vendorId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!placement) {
      return null
    }

    return {
      id: placement.id,
      title: placement.title,
      type: placement.type,
      status: placement.status,
      latitude: placement.latitude,
      longitude: placement.longitude,
      address: placement.address,
      city: placement.city,
      pricePerMonth: placement.pricePerMonth,
      ...(placement.photos.length > 0 ? { photo: placement.photos[0] } : {}),
      tier: getPlacementTier(placement.pricePerMonth),
      description: placement.description,
      width: placement.width,
      height: placement.height,
      lighting: placement.lighting,
      photos: placement.photos,
      vendorId: placement.vendorId,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
    }
  }
}
