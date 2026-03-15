import { IsUUID } from 'class-validator'

export class ImportRouteDto {
  @IsUUID('4')
  adventureId!: string
}
