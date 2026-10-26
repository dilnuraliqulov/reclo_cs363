import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app'
import { createMemoryAuthStore } from './test-helpers'

describe('GET /health', () => {
  it('returns ok when the database is reachable', async () => {
    const app = createApp({
      checkDatabase: async () => {},
      authStore: createMemoryAuthStore().store,
    })

    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('returns 503 when the database is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createApp({
      authStore: createMemoryAuthStore().store,
      checkDatabase: async () => {
        throw new Error('connection refused')
      },
    })

    const response = await request(app).get('/health')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ status: 'error' })
  })
})
