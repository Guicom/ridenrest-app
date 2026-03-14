import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()

    // Public paths — skip auth (story 2.1 will replace with @Public() decorator)
    if (request.path === '/api/health') return true

    const authHeader = request.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header')
    }

    const token = authHeader.slice(7).trim()
    if (!token) {
      throw new UnauthorizedException('Token is empty')
    }

    // TODO Story 2.1: Validate JWT signature with Better Auth
    // For now: token presence = authenticated (dev/test only)
    // req.user will be populated by Better Auth middleware in story 2.1
    return true
  }
}
