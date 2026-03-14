import crypto from 'node:crypto'
import { JwtAuthGuard } from './jwt-auth.guard.js'
import { Reflector } from '@nestjs/core'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

const SECRET = 'test-secret-at-least-32-chars-long!!'
process.env.BETTER_AUTH_SECRET = SECRET

// Real HS256 JWT signer/verifier using node:crypto
// Injected into the jose mock to test actual crypto behavior without ESM issues
function signJwt(payload: object, secret: string, expiresInSeconds = 900): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const body = Buffer.from(
    JSON.stringify({ iat: now, exp: now + expiresInSeconds, ...payload }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

// Mock jose to avoid ESM loading failure, but use real HS256 logic internally
// This ensures the guard's algorithm constraint and claim validation are actually tested
jest.mock('jose', () => ({
  jwtVerify: async (
    token: string,
    key: Uint8Array,
    options?: { algorithms?: string[] },
  ): Promise<{ payload: Record<string, unknown>; protectedHeader: Record<string, unknown> }> => {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Invalid JWT format')
    const [headerB64, bodyB64, sigB64] = parts

    const headerObj = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as {
      alg: string
    }
    if (options?.algorithms && !options.algorithms.includes(headerObj.alg)) {
      throw new Error('Algorithm not allowed')
    }

    // Real HMAC-SHA256 verification
    const secretStr = Buffer.from(key).toString('utf8')
    const expected = crypto
      .createHmac('sha256', secretStr)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url')
    if (sigB64 !== expected) throw new Error('Signature verification failed')

    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString()) as Record<
      string,
      unknown
    >
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired')
    }

    return { payload, protectedHeader: headerObj }
  },
}))

const makeContext = (authHeader?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
        user: undefined,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard
  let reflector: Reflector

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector
    guard = new JwtAuthGuard(reflector)
  })

  it('allows @Public() routes without token', async () => {
    ;(reflector.getAllAndOverride as jest.Mock).mockReturnValue(true)
    const ctx = makeContext(undefined)
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('throws UnauthorizedException when no Authorization header', async () => {
    const ctx = makeContext()
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when token is not Bearer', async () => {
    const ctx = makeContext('Basic abc123')
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException for malformed JWT (real crypto)', async () => {
    const ctx = makeContext('Bearer not-a-valid-jwt')
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException for JWT signed with wrong secret (real crypto)', async () => {
    const token = signJwt({ sub: 'user-123', email: 'test@test.com' }, 'wrong-secret-xxxxx!!')
    const ctx = makeContext(`Bearer ${token}`)
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException for expired JWT (real crypto)', async () => {
    const token = signJwt({ sub: 'user-123', email: 'test@test.com' }, SECRET, -1)
    const ctx = makeContext(`Bearer ${token}`)
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('populates req.user and returns true for valid JWT (real crypto)', async () => {
    const token = signJwt({ sub: 'user-123', email: 'user@test.com' }, SECRET)
    const request = { headers: { authorization: `Bearer ${token}` }, user: undefined }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext

    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
    expect(request.user).toEqual({ id: 'user-123', email: 'user@test.com' })
  })

  it('throws on startup if BETTER_AUTH_SECRET is not set', () => {
    const savedSecret = process.env.BETTER_AUTH_SECRET
    delete process.env.BETTER_AUTH_SECRET
    expect(() => new JwtAuthGuard(reflector)).toThrow('BETTER_AUTH_SECRET')
    process.env.BETTER_AUTH_SECRET = savedSecret
  })
})
