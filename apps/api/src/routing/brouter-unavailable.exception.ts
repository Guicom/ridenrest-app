import { HttpException, HttpStatus } from '@nestjs/common'

/** Motif typé de l'indisponibilité BRouter — utilisé pour le logging structuré et le fallback. */
export type BrouterFailureReason =
  | 'timeout'
  | 'network'
  | 'http_error'
  | 'parse_error'
  | 'circuit_open'

/**
 * Levée par RoutingService quand BRouter est injoignable / en erreur / circuit ouvert.
 *
 * Étend HttpException (503) pour être correctement filtrée par le HttpExceptionFilter global.
 * En pratique, AccessCalculatorService (Story 2.2) catch cette exception et retourne
 * `{ status: 'fallback' }` — le 503 ne sert que de fallback ultime hors de cette chaîne.
 */
export class BrouterUnavailableException extends HttpException {
  constructor(
    public readonly reason: BrouterFailureReason,
    public readonly detail?: string,
  ) {
    super(
      { message: `BRouter unavailable: ${reason}`, reason, detail },
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }
}
