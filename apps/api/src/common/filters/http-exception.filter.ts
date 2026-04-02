import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import type { Response } from 'express'

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

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
      message = 'Internal server error'
    }

    if (status >= 500) {
      this.logger.error({ err: exception }, 'Unhandled exception')
    }

    response.status(status).json({ error: { code, message } })
  }
}
