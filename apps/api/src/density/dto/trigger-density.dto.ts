import { IsUUID } from 'class-validator'

export class TriggerDensityDto {
  @IsUUID()
  adventureId!: string
}
