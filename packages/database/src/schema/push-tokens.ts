import { pgTable, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { user } from './auth'

// Tokens push Expo (APNs iOS / FCM Android) — story MOB-6.2.
// Un token `ExponentPushToken[...]` par device, rattaché à l'utilisateur (`user.id`).
// RGPD : un token push n'est PAS une donnée de position — aucune coordonnée GPS n'est
// jamais stockée ici. Le token sert uniquement à router une notification via l'Expo Push API.
//
// Convention projet : `id` en `text` + `crypto.randomUUID()` (comme `adventures`), PAS `uuid`
// (la story dit « uuid pk », mais `user.id` est `text` → la FK doit l'être aussi).
export const pushPlatformEnum = pgEnum('push_platform', ['ios', 'android'])

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Unique : un même token appartient à un seul device/enregistrement (upsert on conflict).
    token: text('token').notNull().unique(),
    platform: pushPlatformEnum('platform').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('idx_push_tokens_user_id').on(table.userId),
  }),
)
