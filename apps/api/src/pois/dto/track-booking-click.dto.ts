import { IsString, IsNotEmpty, IsIn } from 'class-validator'

const BOOKING_PLATFORMS = ['booking_com', 'hotels_com', 'airbnb'] as const

export class TrackBookingClickDto {
  @IsString()
  @IsNotEmpty()
  externalId!: string

  @IsIn(BOOKING_PLATFORMS)
  platform!: 'booking_com' | 'hotels_com' | 'airbnb'
}
