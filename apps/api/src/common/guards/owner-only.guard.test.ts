import { OwnerOnlyGuard } from './owner-only.guard.js'
import { Reflector } from '@nestjs/core'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { OWNED_RESOURCE_KEY } from '../decorators/owned-resource.decorator.js'

const makeContext = (
  params: Record<string, string>,
  user?: { id: string; email: string },
  handlerMetadata?: Record<string, unknown>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params, user }),
    }),
    getHandler: () => handlerMetadata ?? {},
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
    jest.spyOn(reflector, 'get').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-1', email: 'a@b.com' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(check).toHaveBeenCalledWith('resource-1', 'user-1')
  })

  it('throws ForbiddenException when user is not the owner', async () => {
    const check = jest.fn().mockResolvedValue(false)
    jest.spyOn(reflector, 'get').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-2', email: 'b@b.com' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
    expect(check).toHaveBeenCalledWith('resource-1', 'user-2')
  })

  it('passes when no @OwnedResource decorator is set', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined)

    const ctx = makeContext({ id: 'resource-1' }, { id: 'user-1', email: 'a@b.com' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('throws ForbiddenException when user is not authenticated', async () => {
    const check = jest.fn().mockResolvedValue(true)
    jest.spyOn(reflector, 'get').mockReturnValue(check)

    const ctx = makeContext({ id: 'resource-1' })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
    expect(check).not.toHaveBeenCalled()
  })
})
