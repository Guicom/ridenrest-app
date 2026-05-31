import { AccessRequestSchema } from '@ridenrest/shared'
import type { AccessRequest } from '@ridenrest/shared'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js'

/**
 * DTO de l'endpoint `POST /pois/:id/access` (Story 2.3, AC #1/#2).
 *
 * Alignement Zod ↔ NestJS — option B (source unique) : le « DTO » n'est que le
 * type inféré du schéma Zod partagé ; la validation runtime est assurée par le
 * pipe ci-dessous (pas de DTO class-validator → zéro drift). `nestjs-zod` n'étant
 * pas installé, on utilise un `ZodValidationPipe` maison.
 */
export type AccessRequestDto = AccessRequest

/** Instance réutilisable du pipe pour `@Body(accessRequestValidationPipe)`. */
export const accessRequestValidationPipe = new ZodValidationPipe(AccessRequestSchema)
