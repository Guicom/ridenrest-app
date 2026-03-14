import { JwtAuthGuard } from './jwt-auth.guard.js'
import { ExecutionContext, UnauthorizedException } from '@nestjs/common'

const mockContext = (authHeader?: string, path = '/api/something'): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  }) as unknown as ExecutionContext

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard

  beforeEach(() => {
    guard = new JwtAuthGuard()
  })

  it('throws UnauthorizedException when no Authorization header', () => {
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when header does not start with Bearer', () => {
    expect(() => guard.canActivate(mockContext('Basic abc123'))).toThrow(UnauthorizedException)
  })

  it('throws UnauthorizedException when token is empty', () => {
    expect(() => guard.canActivate(mockContext('Bearer '))).toThrow(UnauthorizedException)
  })

  it('returns true when valid Bearer token is present', () => {
    expect(guard.canActivate(mockContext('Bearer valid-token-here'))).toBe(true)
  })

  it('returns true for /health path without Authorization header (public endpoint)', () => {
    expect(guard.canActivate(mockContext(undefined, '/health'))).toBe(true)
  })
})
