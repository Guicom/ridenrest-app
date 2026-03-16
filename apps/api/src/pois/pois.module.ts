import { Module } from '@nestjs/common'
import { PoisController } from './pois.controller.js'
import { PoisService } from './pois.service.js'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider } from './providers/google-places.provider.js'

@Module({
  controllers: [PoisController],
  providers: [PoisService, PoisRepository, OverpassProvider, GooglePlacesProvider],
})
export class PoisModule {}
