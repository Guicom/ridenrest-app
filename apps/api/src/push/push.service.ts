import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk'
import { PushRepository } from './push.repository.js'

export interface DensityCompletedEvent {
  adventureId: string
}

// Libellé de la notification (story MOB-6.2 / AC2). ⚠️ Généré CÔTÉ SERVEUR : l'OS affiche
// ce texte alors que l'app n'est pas lancée → impossible de le localiser via l'i18n mobile.
// Aucune locale utilisateur n'est stockée en base → défaut **français** (langue primaire de
// l'app). Une vraie localisation par utilisateur nécessiterait une colonne `locale` (à voir
// avec MOB-6.3). RGPD : le payload ne transporte QUE `adventureId`, zéro coordonnée GPS.
const DENSITY_DONE_TITLE = 'Analyse de densité terminée'
const DENSITY_DONE_BODY =
  'Votre analyse d’hébergements est prête. Touchez pour voir les résultats.'

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  // `accessToken` optionnel : l'Expo Push API accepte les envois non authentifiés, mais un
  // token (`EXPO_ACCESS_TOKEN`, secret VPS) durcit la sécurité si fourni. Sans token → envoi
  // « ouvert » (suffisant pour le MVP). Jamais de clé dans le bundle mobile.
  private readonly expo = new Expo(
    process.env.EXPO_ACCESS_TOKEN
      ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
      : {},
  )

  constructor(private readonly repo: PushRepository) {}

  /** Enregistre (upsert) le token d'un device pour l'utilisateur courant (AC1). */
  registerToken(userId: string, token: string, platform: 'ios' | 'android') {
    return this.repo.upsertToken(userId, token, platform)
  }

  /** Désinscrit le token d'un device — scopé à l'utilisateur (AC4). */
  async removeToken(userId: string, token: string): Promise<void> {
    await this.repo.deleteByUserAndToken(userId, token)
  }

  // Découplage densité ↔ push via EventEmitter (décision Dev Notes). Le processor densité
  // émet `density.completed` après `setDensityStatus('success')` ; l'envoi est best-effort et
  // n'impacte JAMAIS le job densité (le listener tourne hors du flux du job).
  @OnEvent('density.completed')
  async handleDensityCompleted(payload: DensityCompletedEvent): Promise<void> {
    await this.notifyDensityComplete(payload.adventureId)
  }

  /**
   * Notifie tous les devices du propriétaire de l'aventure que l'analyse de densité est
   * terminée. Best-effort de bout en bout : toute erreur est loggée et avalée (AC2). Un
   * `DeviceNotRegistered` (token expiré/désinstallé) purge le token en base.
   */
  async notifyDensityComplete(adventureId: string): Promise<void> {
    try {
      const userId = await this.repo.findAdventureOwnerId(adventureId)
      if (!userId) return

      const rawTokens = await this.repo.findTokensByUserId(userId)
      const tokens = rawTokens.filter((t) => Expo.isExpoPushToken(t))
      if (tokens.length === 0) return

      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        sound: 'default',
        title: DENSITY_DONE_TITLE,
        body: DENSITY_DONE_BODY,
        data: { adventureId },
      }))

      const chunks = this.expo.chunkPushNotifications(messages)
      const invalidTokens: string[] = []

      for (const chunk of chunks) {
        let tickets: ExpoPushTicket[]
        try {
          tickets = await this.expo.sendPushNotificationsAsync(chunk)
        } catch (err) {
          // Échec réseau/HTTP sur ce chunk → log + continue (les autres chunks peuvent
          // réussir). JAMAIS de throw : le job densité ne doit pas échouer sur un envoi.
          this.logger.error(
            `[push] chunk send failed for adventure ${adventureId}`,
            err as Error,
          )
          continue
        }
        // Les tickets sont dans l'ordre du chunk → on corrèle `tickets[i]` ↔ `chunk[i].to`.
        tickets.forEach((ticket, i) => {
          if (
            ticket.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered'
          ) {
            const to = chunk[i]?.to
            const token = Array.isArray(to) ? to[0] : to
            if (typeof token === 'string') invalidTokens.push(token)
          }
        })
      }

      // Purge des tokens morts (DeviceNotRegistered) — best-effort, scopé à l'utilisateur.
      for (const token of invalidTokens) {
        await this.repo.deleteByUserAndToken(userId, token)
      }
    } catch (err) {
      this.logger.error(
        `[push] notifyDensityComplete failed for adventure ${adventureId}`,
        err as Error,
      )
    }
  }
}
