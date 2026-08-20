import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, Logger } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PoisService } from './pois.service.js'
import { FindPoisDto } from './dto/find-pois.dto.js'
import { CountNearMissDto } from './dto/count-near-miss.dto.js'
import { GetGoogleDetailsDto } from './dto/get-google-details.dto.js'
import { accessRequestValidationPipe } from './dto/access-request.dto.js'
import type { AccessRequestDto } from './dto/access-request.dto.js'
import { AccessCalculatorService } from './access-calculator/access-calculator.service.js'
import { checkPoiOwnership } from './access-calculator/ownership-check.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { OwnerOnlyGuard } from '../common/guards/owner-only.guard.js'
import { OwnedResource } from '../common/decorators/owned-resource.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('pois')
@Controller('pois')
export class PoisController {
  private readonly logger = new Logger(PoisController.name)

  constructor(
    private readonly poisService: PoisService,
    private readonly accessCalculator: AccessCalculatorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get POIs for a segment corridor' })
  async findPois(@Query() dto: FindPoisDto, @CurrentUser() user: CurrentUserPayload) {
    return this.poisService.findPois(dto, user.id)
  }

  /**
   * Compteur des POI écartés par le filtre corridor, juste au-delà de la limite.
   *
   * Endpoint SÉPARÉ volontairement : le `ResponseInterceptor` enveloppe tout dans `{ data }`,
   * donc ajouter un champ à `/pois` transformerait `data` d'un tableau en objet et casserait
   * les binaires mobiles déjà distribués.
   */
  // IMPORTANT: Must be declared BEFORE @Get(':id') to avoid NestJS route conflicts
  @Get('near-miss-count')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Count POIs just beyond the display corridor' })
  async countNearMissPois(@Query() dto: CountNearMissDto, @CurrentUser() user: CurrentUserPayload) {
    return this.poisService.countNearMissPois(dto, user.id)
  }

  // IMPORTANT: Must be declared BEFORE @Get(':id') to avoid NestJS route conflicts
  @Get('google-details')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Places enrichment for a specific POI' })
  async getPoiGoogleDetails(@Query() dto: GetGoogleDetailsDto) {
    return this.poisService.getPoiGoogleDetails(dto.externalId, dto.segmentId)
  }

  /**
   * POST /pois/:id/access — métriques d'itinéraire d'accès d'un POI.
   *
   * Origine = point de la trace le plus proche du POI (`nearest-trace`), en Planning
   * comme en Live (décision 2026-05-30) : aucune position GPS n'est transmise, le serveur
   * résout l'origine côté DB. Cache DB durable (`accommodations_cache`).
   *
   * Guards : `JwtAuthGuard` (global, ré-explicité) + `OwnerOnlyGuard` (vérifie que le
   * POI appartient à une aventure du user via `checkPoiOwnership`). Throttling 60/min via
   * `@Throttle` (`ThrottlerGuard` global). Réponse 429 + `Retry-After` au dépassement.
   *
   * Le retour brut (`AccessResult`) est wrappé par le `ResponseInterceptor` global
   * (`{ data: ... }`). BRouter down → `status: 'fallback'` en HTTP 200.
   */
  @Post(':id/access')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, OwnerOnlyGuard)
  @OwnedResource(checkPoiOwnership)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compute POI access route metrics' })
  async computeAccess(
    @Param('id') poiId: string,
    @Body(accessRequestValidationPipe) dto: AccessRequestDto,
  ) {
    return this.accessCalculator.compute({
      poiId,
      origin: dto.origin,
      profileOverride: dto.profileOverride,
    })
  }
}
