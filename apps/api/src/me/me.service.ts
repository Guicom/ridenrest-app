import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { MeRepository } from './me.repository.js'
import type { UpdateSettingsDto } from './dto/update-settings.dto.js'

/**
 * Event émis lorsqu'un user RÉVOQUE son consentement Live (transition `true` → `false`).
 * Consommé par Story 4.2 pour purger best-effort le cache Redis Live (`access:live:*`).
 * (Story 3.2, AC #3.)
 */
export const PROFILE_LIVE_CONSENT_REVOKED_EVENT = 'profile.live-consent-revoked' as const

export interface ProfileLiveConsentRevokedPayload {
  userId: string
}

/**
 * Settings exposés via `/me/settings`. Inclut `overpassEnabled` (déjà géré par
 * `ProfileModule`) pour cohérence — cf. Discovery #2 ("inclure tous les settings existants").
 */
export interface MeSettingsResponse {
  liveAccessConsent: boolean | null
  overpassEnabled: boolean
}

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name)

  constructor(
    private readonly meRepository: MeRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getSettings(userId: string): Promise<MeSettingsResponse> {
    const row = await this.meRepository.getSettings(userId)
    return {
      liveAccessConsent: row?.liveAccessConsent ?? null,
      overpassEnabled: row?.overpassEnabled ?? false,
    }
  }

  /**
   * Met à jour les settings (AC #2/#3/#6).
   * - Persiste `liveAccessConsent` (UPDATE exécuté même si valeur identique → idempotence AC #6).
   * - Émet `profile.live-consent-revoked` UNIQUEMENT sur transition `true` → `false`,
   *   et APRÈS le commit DB (atomicité AC #3 : si le UPDATE échoue, pas d'event).
   *
   * L'émission est best-effort (purge cache côté Story 4.2) : `emit` est synchrone, donc
   * un listener qui throw remonterait en 500 APRÈS que le consentement est déjà persisté.
   * On isole donc l'émission dans un try/catch — l'échec d'un listener ne doit jamais faire
   * échouer le PATCH ni annuler une révocation déjà committée.
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<MeSettingsResponse> {
    const previous = (await this.meRepository.getSettings(userId))?.liveAccessConsent ?? null

    await this.meRepository.setLiveAccessConsent(userId, dto.liveAccessConsent)

    if (previous === true && dto.liveAccessConsent === false) {
      const payload: ProfileLiveConsentRevokedPayload = { userId }
      try {
        this.eventEmitter.emit(PROFILE_LIVE_CONSENT_REVOKED_EVENT, payload)
      } catch (err) {
        this.logger.error(
          `Listener de ${PROFILE_LIVE_CONSENT_REVOKED_EVENT} a échoué (userId=${userId}) — révocation persistée, purge cache best-effort à reprendre`,
          err instanceof Error ? err.stack : String(err),
        )
      }
    }

    return this.getSettings(userId)
  }
}
