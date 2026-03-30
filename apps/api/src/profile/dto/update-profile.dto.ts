import { IsBoolean } from 'class-validator'

export class UpdateProfileDto {
  @IsBoolean()
  overpassEnabled!: boolean
}
