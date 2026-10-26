import {
  type ApiError,
  mapBoundsQuerySchema,
  type MapMarkersResponse,
  type PlacementDetail,
} from '@reclo/shared'
import { Router } from 'express'
import { z } from 'zod'
import type { PlacementStore } from './store'

export function createPlacementRouter({ store }: { store: PlacementStore }): Router {
  const router = Router()

  router.get('/map', async (req, res) => {
    const parsed = mapBoundsQuerySchema.safeParse(req.query)

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.') || 'query'
        fieldErrors[path] = fieldErrors[path] ?? []
        fieldErrors[path].push(issue.message)
      }

      res.status(400).json({
        error: 'Invalid query parameters',
        fieldErrors,
      } satisfies ApiError)
      return
    }

    try {
      const markers = await store.findMapMarkers(parsed.data)
      res.json({
        markers,
        total: markers.length,
      } satisfies MapMarkersResponse)
    } catch (error) {
      console.error('Failed to query map markers', error)
      res.status(500).json({ error: 'Failed to query map markers' } satisfies ApiError)
    }
  })

  router.get('/:id', async (req, res) => {
    const parsedId = z.string().uuid().safeParse(req.params.id)
    if (!parsedId.success) {
      res.status(400).json({ error: 'Invalid placement id' } satisfies ApiError)
      return
    }

    try {
      const placement = await store.findPlacementDetail(parsedId.data)

      if (!placement) {
        res.status(404).json({ error: 'Placement not found' } satisfies ApiError)
        return
      }

      res.json(placement satisfies PlacementDetail)
    } catch (error) {
      console.error('Failed to fetch placement detail', error)
      res.status(500).json({ error: 'Failed to fetch placement detail' } satisfies ApiError)
    }
  })

  return router
}
