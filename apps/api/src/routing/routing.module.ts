import { Module } from '@nestjs/common'
import { RoutingService } from './routing.service.js'

/**
 * RoutingModule — expose le wrapper BRouter (RoutingService) au reste de l'app.
 *
 * Note vs story spec (AC #1) :
 *  - Pas de `HttpModule` (@nestjs/axios) : le service utilise `fetch` natif (cohérence
 *    projet — weather/strava/geo), donc aucun module HTTP à importer.
 *  - Pas d'import explicite de `ConfigModule` : `access.config.ts` est chargé via
 *    `ConfigModule.forRoot({ isGlobal: true, load: [accessConfig] })` dans app.module.ts,
 *    le token `accessConfig.KEY` est donc disponible globalement par DI.
 */
@Module({
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
