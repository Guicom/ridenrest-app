import { UnauthorizedException, type ExecutionContext } from '@nestjs/common'
import { HealthTokenGuard } from './health-token.guard.js'

/** Construit un ExecutionContext minimal portant les headers donnés. */
function ctx(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext
}

describe('HealthTokenGuard', () => {
  const guard = new HealthTokenGuard()
  const ORIGINAL = process.env['HEALTH_ENDPOINT_TOKEN']

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['HEALTH_ENDPOINT_TOKEN']
    else process.env['HEALTH_ENDPOINT_TOKEN'] = ORIGINAL
  })

  it('refuse (fail-closed) si HEALTH_ENDPOINT_TOKEN non configuré', () => {
    delete process.env['HEALTH_ENDPOINT_TOKEN']
    expect(() => guard.canActivate(ctx({ 'x-health-token': 'whatever' }))).toThrow(UnauthorizedException)
  })

  it('refuse si aucun token fourni', () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = 'secret-token'
    expect(() => guard.canActivate(ctx({}))).toThrow(UnauthorizedException)
  })

  it('refuse si le token est incorrect', () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = 'secret-token'
    expect(() => guard.canActivate(ctx({ 'x-health-token': 'wrong' }))).toThrow(UnauthorizedException)
  })

  it('refuse si le token a la bonne valeur mais une longueur différente (pas de match partiel)', () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = 'secret-token'
    expect(() => guard.canActivate(ctx({ 'x-health-token': 'secret-token-extra' }))).toThrow(UnauthorizedException)
  })

  it('autorise si le token correspond exactement', () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = 'secret-token'
    expect(guard.canActivate(ctx({ 'x-health-token': 'secret-token' }))).toBe(true)
  })

  it('gère un header répété (array) en prenant la première valeur', () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = 'secret-token'
    expect(guard.canActivate(ctx({ 'x-health-token': ['secret-token', 'other'] }))).toBe(true)
  })
})
