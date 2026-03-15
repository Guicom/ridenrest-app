import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js'
import type { CurrentUserPayload } from '../decorators/current-user.decorator.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(private reflector: Reflector) {
    const betterAuthUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3011'
    // Better Auth JWT plugin exposes its public keys at /api/auth/jwks
    this.jwks = createRemoteJWKSet(new URL(`${betterAuthUrl}/api/auth/jwks`))
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
      // Verify JWT using Better Auth's JWKS endpoint (EdDSA asymmetric keys)
      const { payload } = await jwtVerify(token, this.jwks)

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
