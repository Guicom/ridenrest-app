import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
import { Transform } from 'class-transformer'

export class RenameAdventureDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string
}
