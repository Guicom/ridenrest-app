import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/**
 * Pipe de validation générique adossé à un schéma Zod (source UNIQUE de vérité,
 * partagée web ↔ api via `@ridenrest/shared`). Évite le drift d'un DTO
 * class-validator parallèle (cf. Story 2.3 Discovery #1, option B).
 *
 * Appliqué au niveau du paramètre — `@Body(new ZodValidationPipe(schema))`. Le
 * `ValidationPipe` global (class-validator) ne touche pas le body car son metatype
 * inféré est `Object` (type TS effacé au runtime) → `toValidate()` renvoie false.
 *
 * En cas d'échec : `BadRequestException`. Le `HttpExceptionFilter` global ne
 * propage que `.message` → la réponse HTTP est `{ error: { code: 'BAD_REQUEST',
 * message: 'Validation failed' } }` (cf. Doc Sync : l'AC #3 décrivait `{ message,
 * errors }`, mais le filtre global du projet impose ce format).
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      throw new BadRequestException({ message: 'Validation failed', errors })
    }
    return result.data
  }
}
