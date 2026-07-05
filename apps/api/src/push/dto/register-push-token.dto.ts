import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator'

// Body de `POST /push-tokens` (story MOB-6.2 / T2). `token` = `ExponentPushToken[...]`
// obtenu côté mobile via `getExpoPushTokenAsync`. `platform` restreint à l'enum DB.
export class RegisterPushTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be a valid Expo push token (ExponentPushToken[...])',
  })
  token!: string

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android'
}
