import { Module } from '@nestjs/common'
import { RoutingModule } from '../../routing/routing.module.js'
import { AccessCalculatorService } from './access-calculator.service.js'

/**
 * AccessCalculatorModule (Story 2.2) — expose `AccessCalculatorService` (consommé par PoisModule).
 *
 * Note vs story spec (AC #1) :
 *  - `RoutingModule` importé pour injecter `RoutingService`.
 *  - Pas de `DatabaseModule` : le projet utilise le singleton `db` de `@ridenrest/database`
 *    (aucun module/token Drizzle à importer).
 *  - `accessConfig.KEY` est disponible globalement (ConfigModule.forRoot isGlobal).
 */
@Module({
  imports: [RoutingModule],
  providers: [AccessCalculatorService],
  exports: [AccessCalculatorService],
})
export class AccessCalculatorModule {}
