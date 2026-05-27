import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { OWNED_RESOURCE_KEY, type OwnerCheckFn } from '../decorators/owned-resource.decorator.js'
import type { CurrentUserPayload } from '../decorators/current-user.decorator.js'

@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const check = this.reflector.getAllAndOverride<OwnerCheckFn | undefined>(
      OWNED_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!check) return true

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>()
    const resourceId = request.params['id'] as string
    const userId = request.user?.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    if (!resourceId) {
      throw new ForbiddenException('Missing resource identifier')
    }

    const isOwner = await check(resourceId, userId)
    if (!isOwner) {
      throw new ForbiddenException('Not the owner')
    }

    return true
  }
}
