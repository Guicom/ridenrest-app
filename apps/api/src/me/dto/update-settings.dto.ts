import { IsBoolean } from 'class-validator'

/**
 * Body de `PATCH /me/settings` (Story 3.2, AC #2/#5).
 *
 * `liveAccessConsent` est REQUIS et strictement booléen :
 *  - toute autre valeur (`null`, `"yes"`, `1`, absente) → 400 via `ValidationPipe`.
 *
 * ⚠️ Déviation assumée vs Discovery #5 (qui suggérait `@IsOptional()`) : l'AC #5 exige
 * explicitement que `null` renvoie 400, et l'AC #7 tranche `PATCH {}` → 400
 * ("PATCH ne devrait jamais être un GET déguisé"). `@IsOptional()` laisserait passer
 * `null`/absence → on l'écarte. Quand d'autres settings seront ajoutés, chacun pourra
 * être indépendamment optionnel selon son propre contrat.
 */
export class UpdateSettingsDto {
  @IsBoolean()
  liveAccessConsent!: boolean
}
