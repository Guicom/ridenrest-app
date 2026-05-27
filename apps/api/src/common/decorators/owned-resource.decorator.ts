import { SetMetadata } from '@nestjs/common'

export type OwnerCheckFn = (resourceId: string, userId: string) => Promise<boolean>

export const OWNED_RESOURCE_KEY = 'ownedResource'

export const OwnedResource = (check: OwnerCheckFn) =>
  SetMetadata(OWNED_RESOURCE_KEY, check)
