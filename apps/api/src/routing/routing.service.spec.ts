import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import accessConfig from '../config/access.config.js'
import { RoutingService } from './routing.service.js'
import { BrouterUnavailableException } from './brouter-unavailable.exception.js'
import type { BrouterFailureReason } from './brouter-unavailable.exception.js'
import type { BrouterProfile } from './routing.types.js'

const fixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__/brouter-paris-versailles.geojson.json'), 'utf-8'),
) as unknown

const mockConfig = {
  brouterBaseUrl: 'http://localhost:17777',
  brouterTimeoutMs: 5000,
  brouterDefaultProfile: 'trekking',
  eagerThresholdM: 1500,
  traceBufferM: 10,
  candidateRadiusM: 10000,
  maxCandidates: 4,
  engineVersion: 'brouter-1.7.9+trekking',
}

const PARIS: readonly [number, number] = [2.3522, 48.8566]
const VERSAILLES: readonly [number, number] = [2.1301, 48.8014]

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
}
function errResponse(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as unknown as Response
}
function abortError(): Error {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
}

/** Capture the reason of a thrown BrouterUnavailableException. */
async function expectReason(p: Promise<unknown>): Promise<BrouterFailureReason> {
  try {
    await p
  } catch (err) {
    expect(err).toBeInstanceOf(BrouterUnavailableException)
    return (err as BrouterUnavailableException).reason
  }
  throw new Error('Expected BrouterUnavailableException, but no error was thrown')
}

describe('RoutingService', () => {
  let service: RoutingService
  let fetchMock: jest.Mock

  const call = (profile: BrouterProfile = 'trekking') =>
    service.computeRoute({ from: PARIS, to: VERSAILLES, profile })

  beforeEach(async () => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const module = await Test.createTestingModule({
      providers: [RoutingService, { provide: accessConfig.KEY, useValue: mockConfig }],
    }).compile()

    service = module.get(RoutingService)
    // Silence structured WARN logs during tests.
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  describe('happy path', () => {
    it('parses a real BRouter GeoJSON fixture (Paris→Versailles)', async () => {
      fetchMock.mockResolvedValue(okResponse(fixture))

      const route = await call('trekking')

      expect(route.distanceM).toBe(20471)
      expect(route.timeS).toBe(4264) // properties['total-time'] (s), profil-aware
      expect(route.elevationGainM).toBe(139) // properties['filtered ascend']
      expect(route.elevationLossM).toBe(134) // cumulative negative delta of 3D points
      expect(route.geometry.type).toBe('LineString')
      expect(route.geometry.coordinates).toHaveLength(828)
      expect(route.geometry.coordinates[0]).toEqual([2.352139, 48.857038, 33.75])
    })

    it('builds the BRouter URL with lonlats, profile, alternativeidx and geojson format', async () => {
      fetchMock.mockResolvedValue(okResponse(fixture))

      await call('fastbike')

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(
        'http://localhost:17777/brouter?lonlats=2.3522,48.8566|2.1301,48.8014&profile=fastbike&alternativeidx=0&format=geojson',
      )
      // second arg carries the AbortController signal for timeout enforcement
      expect(init.signal).toBeInstanceOf(AbortSignal)
    })
  })

  describe('failure mapping', () => {
    it('maps HTTP 500 to reason "http_error"', async () => {
      fetchMock.mockResolvedValue(errResponse(500))
      expect(await expectReason(call())).toBe('http_error')
    })

    it('maps an AbortError (timeout) to reason "timeout"', async () => {
      fetchMock.mockRejectedValue(abortError())
      expect(await expectReason(call())).toBe('timeout')
    })

    it('maps a generic network error to reason "network"', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
      expect(await expectReason(call())).toBe('network')
    })

    it('maps a malformed body (no features) to reason "parse_error"', async () => {
      fetchMock.mockResolvedValue(okResponse({ type: 'FeatureCollection', features: [] }))
      expect(await expectReason(call())).toBe('parse_error')
    })

    it('maps a non-LineString geometry to reason "parse_error"', async () => {
      const pointFixture = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { 'track-length': '1000' }, geometry: { type: 'Point', coordinates: [2.35, 48.85, 33] } }],
      }
      fetchMock.mockResolvedValue(okResponse(pointFixture))
      expect(await expectReason(call())).toBe('parse_error')
    })

    it('defaults elevationGainM to 0 when "filtered ascend" is absent', async () => {
      const noAscendFixture = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { 'track-length': '5000' },
          geometry: { type: 'LineString', coordinates: [[2.35, 48.85, 30], [2.36, 48.86, 35]] },
        }],
      }
      fetchMock.mockResolvedValue(okResponse(noAscendFixture))
      const route = await call()
      expect(route.elevationGainM).toBe(0)
    })

    it('maps a JSON deserialization failure to reason "parse_error"', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('Unexpected token')),
      } as unknown as Response)
      expect(await expectReason(call())).toBe('parse_error')
    })
  })

  describe('circuit breaker', () => {
    it('opens after 5 consecutive failures; 6th call short-circuits with "circuit_open"', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      for (let i = 0; i < 5; i++) {
        expect(await expectReason(call())).toBe('network')
      }
      expect(fetchMock).toHaveBeenCalledTimes(5)

      // 6th call must NOT reach BRouter
      expect(await expectReason(call())).toBe('circuit_open')
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    it('half-open after 30s: a successful test request closes the circuit', async () => {
      jest.useFakeTimers()
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      for (let i = 0; i < 5; i++) {
        expect(await expectReason(call())).toBe('network')
      }
      // still open immediately
      expect(await expectReason(call())).toBe('circuit_open')
      expect(fetchMock).toHaveBeenCalledTimes(5)

      // advance past the 30s open window → next call is allowed as a half-open test
      jest.advanceTimersByTime(30_000)
      fetchMock.mockResolvedValue(okResponse(fixture))

      const route = await call()
      expect(route.distanceM).toBe(20471)
      expect(fetchMock).toHaveBeenCalledTimes(6)

      // circuit fully closed: subsequent calls flow through normally
      await call()
      expect(fetchMock).toHaveBeenCalledTimes(7)
    })

    it('half-open: a failing test request re-opens the circuit for another 30s', async () => {
      jest.useFakeTimers()
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

      for (let i = 0; i < 5; i++) await expectReason(call())
      expect(fetchMock).toHaveBeenCalledTimes(5)

      jest.advanceTimersByTime(30_000)
      // half-open test request fails → counts as the failing probe
      expect(await expectReason(call())).toBe('network')
      expect(fetchMock).toHaveBeenCalledTimes(6)

      // re-opened: immediate next call short-circuits again
      expect(await expectReason(call())).toBe('circuit_open')
      expect(fetchMock).toHaveBeenCalledTimes(6)
    })
  })
})
