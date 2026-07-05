import { z } from 'zod'

// Schémas de validation auth PARTAGÉS (web + mobile) — story MOB-2.2 / T1.
//
// Source de vérité unique : on ne duplique JAMAIS la validation email/mot de passe.
// Contraintes alignées sur le serveur Better Auth (`apps/web/src/lib/auth/auth.ts`,
// `emailAndPassword.minPasswordLength: 8`).
//
// ⚠️ Les messages sont des **clés i18n** (ex. `auth.errors.emailInvalid`), pas du
// texte en dur : le client les résout via `t(error.message)`. Cela garde les
// schémas agnostiques de la langue et conforme à l'exigence « zéro chaîne en dur ».

/** Longueur minimale du mot de passe — DOIT rester alignée sur le serveur Better Auth. */
export const PASSWORD_MIN_LENGTH = 8

// `.trim()` avant `.email()` : un espace de fin (fréquent via l'autofill / les
// gestionnaires de mots de passe mobiles) ne doit pas faire échouer une adresse valide
// ni polluer le `name` dérivé côté signup. Better Auth lowercase déjà côté serveur.

/** Inscription email/mot de passe. Le `name` requis par Better Auth est dérivé côté client. */
export const signUpSchema = z.object({
  email: z.string().trim().email('auth.errors.emailInvalid'),
  password: z.string().min(PASSWORD_MIN_LENGTH, 'auth.errors.passwordTooShort'),
})
export type SignUpInput = z.infer<typeof signUpSchema>

/** Connexion email/mot de passe. Mot de passe simplement non vide (la longueur est
 *  vérifiée serveur ; on ne révèle pas la politique à la connexion). */
export const signInSchema = z.object({
  email: z.string().trim().email('auth.errors.emailInvalid'),
  password: z.string().min(1, 'auth.errors.passwordRequired'),
})
export type SignInInput = z.infer<typeof signInSchema>

/** Demande de réinitialisation — email seul (FR-007). */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('auth.errors.emailInvalid'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
