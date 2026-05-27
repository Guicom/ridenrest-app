import { OwnerOnlyGuard } from './owner-only.guard.js'
import { Reflector } from '@nestjs/core'
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'

const makeContext = (
  params: Record<string, string>,
  user?: { id: string; email: string },
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params, user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext

describe('OwnerOnlyGuard', () => {
  let guard: OwnerOnlyGuard
  let reflector: Reflector

  beforeEach(() => {
    reflector = new Reflector()
    guard = new OwnerOnlyGuard(reflector)
  })

  it('passes when user is the owner', async () => {
    const check = jest.fn().mockResolvedValue(true)
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-1', email: 'a@b.com' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(check).toHaveBeenCalledWith('resource-1', 'user-1')
  })

  it('throws ForbiddenException when user is not the owner', async () => {
    const check = jest.fn().mockResolvedValue(false)
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-2', email: 'b@b.com' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
    expect(check).toHaveBeenCalledWith('resource-1', 'user-2')
  })

  it('passes when no @OwnedResource decorator is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-1', email: 'a@b.com' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('throws UnauthorizedException when user is not authenticated', async () => {
    const check = jest.fn().mockResolvedValue(true)
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
    expect(check).not.toHaveBeenCalled()
  })

  it('throws ForbiddenException when resourceId is missing', async () => {
    const check = jest.fn().mockResolvedValue(true)
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(check)

    const ctx = makeContext({}, { id: 'user-1', email: 'a@b.com' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
    expect(check).not.toHaveBeenCalled()
  })
})
