import { Module } from '@nestjs/common'
import { PoisController } from './pois.controller.js'
import { PoisService } from './pois.service.js'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider } from './providers/google-places.provider.js'
import { AccessCalculatorModule } from './access-calculator/access-calculator.module.js'

@Module({
  imports: [AccessCalculatorModule],
  controllers: [PoisController],
  providers: [PoisService, PoisRepository, OverpassProvider, GooglePlacesProvider],
  exports: [OverpassProvider, GooglePlacesProvider],
})
export class PoisModule {}
