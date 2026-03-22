import { IsUUID, IsArray, IsString, IsIn, ArrayMinSize } from 'class-validator'
import { DENSITY_ACCOMMODATION_CATEGORIES } from '@ridenrest/shared'

export class TriggerDensityDto {
  @IsUUID()
  adventureId!: string

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn([...DENSITY_ACCOMMODATION_CATEGORIES], { each: true })
  categories!: string[]
}
