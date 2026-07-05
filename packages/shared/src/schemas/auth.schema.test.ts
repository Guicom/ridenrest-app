import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MIN_LENGTH,
  forgotPasswordSchema,
  signInSchema,
  signUpSchema,
} from './auth.schema'

describe('auth schemas partagés (MOB-2.2 / T1)', () => {
  describe('signUpSchema', () => {
    it('accepte email valide + mot de passe ≥ 8 caractères', () => {
      const r = signUpSchema.safeParse({ email: 'a@b.com', password: 'motdepasse1' })
      expect(r.success).toBe(true)
    })

    it('rejette un email invalide avec la clé i18n', () => {
      const r = signUpSchema.safeParse({ email: 'pasunemail', password: 'motdepasse1' })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues[0].message).toBe('auth.errors.emailInvalid')
      }
    })

    it('rejette un mot de passe trop court avec la clé i18n', () => {
      const r = signUpSchema.safeParse({ email: 'a@b.com', password: 'court' })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues[0].message).toBe('auth.errors.passwordTooShort')
      }
    })

    it('exige exactement PASSWORD_MIN_LENGTH (8) caractères au minimum', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(8)
      const short = signUpSchema.safeParse({ email: 'a@b.com', password: '1234567' })
      const ok = signUpSchema.safeParse({ email: 'a@b.com', password: '12345678' })
      expect(short.success).toBe(false)
      expect(ok.success).toBe(true)
    })

    it('trim l’email (espaces de bord d’autofill) avant validation', () => {
      const r = signUpSchema.safeParse({ email: '  a@b.com  ', password: 'motdepasse1' })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.email).toBe('a@b.com')
      }
    })
  })

  describe('signInSchema', () => {
    it('accepte email valide + mot de passe non vide (pas de contrainte de longueur)', () => {
      const r = signInSchema.safeParse({ email: 'a@b.com', password: 'x' })
      expect(r.success).toBe(true)
    })

    it('rejette un mot de passe vide avec la clé i18n', () => {
      const r = signInSchema.safeParse({ email: 'a@b.com', password: '' })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues[0].message).toBe('auth.errors.passwordRequired')
      }
    })
  })

  describe('forgotPasswordSchema', () => {
    it('accepte un email valide', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    })

    it('rejette un email invalide avec la clé i18n', () => {
      const r = forgotPasswordSchema.safeParse({ email: 'nope' })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues[0].message).toBe('auth.errors.emailInvalid')
      }
    })
  })
})
