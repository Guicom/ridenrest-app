import { Injectable } from '@nestjs/common'
import { Resend } from 'resend'
import type { CreateFeedbackDto } from './dto/create-feedback.dto.js'

@Injectable()
export class FeedbacksService {
  private readonly resend: Resend | null =
    process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

  async create(dto: CreateFeedbackDto, user: { id: string; email: string }): Promise<void> {
    if (!this.resend) {
      console.log('[FeedbacksService] No RESEND_API_KEY — feedback logged only:', { ...dto, userId: user.id, email: user.email })
      return
    }

    // Fire-and-forget — email failure must NOT block the HTTP response
    this.resend.emails.send({
      from: "Ride'n'Rest <noreply@ridenrest.app>",
      to: process.env.FEEDBACK_ADMIN_EMAIL ?? 'contact@ridenrest.app',
      subject: `[Feedback] ${dto.category} — ${dto.screen ?? 'N/A'}`,
      text: [
        `Catégorie: ${dto.category}`,
        `Page/feature: ${dto.screen ?? 'Non précisé'}`,
        `Description: ${dto.description}`,
        `Utilisateur: ${user.email}`,
        `Date: ${new Date().toISOString()}`,
      ].join('\n'),
    }).catch((err: unknown) => {
      console.error('[FeedbacksService] Resend email failed', err)
    })
  }
}
