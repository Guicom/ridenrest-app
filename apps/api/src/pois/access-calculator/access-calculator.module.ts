import { Module } from '@nestjs/common'
import { RoutingModule } from '../../routing/routing.module.js'
import { RedisModule } from '../../common/redis/redis.module.js'
import { AccessCalculatorService } from './access-calculator.service.js'

/**
 * AccessCalculatorModule (Story 2.2, étendu Story 3.1) — expose `AccessCalculatorService`
 * (consommé par PoisModule).
 *
 * Note vs story spec (AC #1) :
 *  - `RoutingModule` importé pour injecter `RoutingService`.
 *  - `RedisModule` importé pour injecter `RedisProvider` (cache Live, Story 3.1). Bien
 *    que `RedisModule` soit @Global, on le déclare explicitement ici : DI hygiène
 *    (dépendance visible) + module testable en isolation.
 *  - Pas de `DatabaseModule` : le projet utilise le singleton `db` de `@ridenrest/database`
 *    (aucun module/token Drizzle à importer).
 *  - Pas d'`EventEmitterModule` : `EventEmitterModule.forRoot()` est déjà global (app.module)
 *    et aucun AC n'exige d'émettre d'événement dans cette story.
 *  - `accessConfig.KEY` est disponible globalement (ConfigModule.forRoot isGlobal).
 */
@Module({
  imports: [RoutingModule, RedisModule],
  providers: [AccessCalculatorService],
  exports: [AccessCalculatorService],
})
export class AccessCalculatorModule {}
