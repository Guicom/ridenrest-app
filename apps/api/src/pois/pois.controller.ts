import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, Logger } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PoisService } from './pois.service.js'
import { FindPoisDto } from './dto/find-pois.dto.js'
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

  // IMPORTANT: Must be declared BEFORE @Get(':id') to avoid NestJS route conflicts
  @Get('google-details')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Places enrichment for a specific POI' })
  async getPoiGoogleDetails(@Query() dto: GetGoogleDetailsDto) {
    return this.poisService.getPoiGoogleDetails(dto.externalId, dto.segmentId)
  }

  /**
   * POST /pois/:id/access — métriques d'itinéraire d'accès d'un POI (Planning OU Live).
   *
   * Mode (Story 3.1, AC #1) : dérivé du body — `origin.type === 'gps'` → mode `live`
   * (consent gate + cache Redis anonyme) ; sinon mode `planning` (cache DB).
   *
   * Guards : `JwtAuthGuard` (global, ré-explicité) + `OwnerOnlyGuard` (vérifie que le
   * POI appartient à une aventure du user via `checkPoiOwnership`). Le throttling est
   * porté par `AccessThrottlerGuard` (APP_GUARD global) : `@Throttle` fixe la limite
   * Planning (60/min) ; le guard la relève à 120/min quand `origin.type === 'gps'`
   * (AC #4, Discovery #1 option B). On ne ré-ajoute pas le guard à `@UseGuards` (cela
   * doublerait le comptage). Réponse 429 + `Retry-After` au dépassement.
   *
   * `userId` n'est transmis au service QUE pour le lookup consent (mode Live) ; il
   * n'entre JAMAIS dans la clé Redis (anonymisation, NFR-PA-006).
   *
   * Le retour brut (`AccessResult`) est wrappé par le `ResponseInterceptor` global
   * (`{ data: ... }`). BRouter down ou no_consent → `status: 'fallback'` en HTTP 200.
   */
  @Post(':id/access')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, OwnerOnlyGuard)
  @OwnedResource(checkPoiOwnership)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compute POI access route metrics (planning or live mode)' })
  async computeAccess(
    @Param('id') poiId: string,
    @Body(accessRequestValidationPipe) dto: AccessRequestDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const mode = dto.origin.type === 'gps' ? 'live' : 'planning'
    return this.accessCalculator.compute({
      poiId,
      origin: dto.origin,
      profileOverride: dto.profileOverride,
      mode,
      userId: user.id,
    })
  }
}
