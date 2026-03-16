import { IsString, IsNotEmpty, IsUUID } from 'class-validator'

export class GetGoogleDetailsDto {
  @IsString()
  @IsNotEmpty()
  externalId!: string

  @IsUUID()
  segmentId!: string
}
