import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  // CORS — allow requests from Next.js web app (cross-origin in local dev and production)
  app.enableCors({
    origin: process.env['WEB_URL'] ?? 'http://localhost:3011',
    credentials: true,
  })

  // Global middleware
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  // Note: HttpExceptionFilter is registered via APP_FILTER in AppModule — NOT here
  app.setGlobalPrefix('api')

  // Swagger — mounted at /api/docs (NOT /api — that's the API prefix)
  const config = new DocumentBuilder()
    .setTitle("Ride'n'Rest API")
    .setDescription('API for the bikepacking accommodation finder')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(process.env['PORT'] ?? 3010)
}

bootstrap().catch(console.error)
