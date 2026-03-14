import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { jwtVerify } from 'jose'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js'
import type { CurrentUserPayload } from '../decorators/current-user.decorator.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: Uint8Array

  constructor(private reflector: Reflector) {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('BETTER_AUTH_SECRET environment variable is required')
    }
    // Encode once at startup instead of on every request
    this.secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @Public() decorator — skip auth for public endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>()
    const authHeader = request.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7).trim()
    if (!token) {
      throw new UnauthorizedException('Token is empty')
    }

    try {
      // Verify JWT with BETTER_AUTH_SECRET — HS256 only (explicit algorithm constraint)
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] })

      // Populate req.user — available via @CurrentUser() in controllers
      request.user = {
        id: payload.sub!,
        email: payload['email'] as string,
      }

      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
