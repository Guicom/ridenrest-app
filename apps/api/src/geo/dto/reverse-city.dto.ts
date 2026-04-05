import { IsNumber, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class ReverseCityDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat!: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng!: number
}
