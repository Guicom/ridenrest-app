import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export interface CurrentUserPayload {
  id: string
  email: string
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>()
    // req.user is populated by Better Auth middleware (story 2.1)
    // Until then, returns undefined — protected routes require JwtAuthGuard
    return request.user
  },
)
