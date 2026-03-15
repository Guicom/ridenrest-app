import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import type { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    const code = HttpStatus[status]

    let message: unknown
    if (exception instanceof HttpException) {
      const res = exception.getResponse()
      message = typeof res === 'string' ? res : (res as Record<string, unknown>).message
    } else {
      console.error('[HttpExceptionFilter] Unhandled exception:', exception)
      message = 'Internal server error'
    }

    response.status(status).json({ error: { code, message } })
  }
}
