import { JwtAuthGuard } from './jwt-auth.guard.js'
import { Reflector } from '@nestjs/core'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

// Mock jose — createRemoteJWKSet returns a sentinel, jwtVerify is controlled per-test
const mockJwks = jest.fn()

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => mockJwks),
  jwtVerify: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jose = require('jose') as { jwtVerify: jest.Mock; createRemoteJWKSet: jest.Mock }

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
    jest.clearAllMocks()
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector
    guard = new JwtAuthGuard(reflector)
  })

  it('calls createRemoteJWKSet with the JWKS endpoint on instantiation', () => {
    expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/api/auth/jwks') }),
    )
  })

  it('allows @Public() routes without token', async () => {
    ;(reflector.getAllAndOverride as jest.Mock).mockReturnValue(true)
    await expect(guard.canActivate(makeContext())).resolves.toBe(true)
  })

  it('throws UnauthorizedException when no Authorization header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when token is not Bearer', async () => {
    await expect(guard.canActivate(makeContext('Basic abc123'))).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('throws UnauthorizedException when token is empty', async () => {
    await expect(guard.canActivate(makeContext('Bearer '))).rejects.toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when jwtVerify rejects', async () => {
    jose.jwtVerify.mockRejectedValue(new Error('Invalid signature'))
    await expect(guard.canActivate(makeContext('Bearer invalid.token.here'))).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('populates req.user and returns true for valid JWT', async () => {
    jose.jwtVerify.mockResolvedValue({
      payload: { sub: 'user-123', email: 'user@test.com' },
      protectedHeader: { alg: 'EdDSA' },
    })

    const request = { headers: { authorization: 'Bearer valid.token.here' }, user: undefined }
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext

    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
    expect(request.user).toEqual({ id: 'user-123', email: 'user@test.com' })
    expect(jose.jwtVerify).toHaveBeenCalledWith('valid.token.here', mockJwks)
  })
})
