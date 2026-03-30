import { Injectable } from '@nestjs/common'
import { ProfileRepository } from './profile.repository.js'

export interface ProfileResponse {
  overpassEnabled: boolean
}

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  async getProfile(userId: string): Promise<ProfileResponse> {
    const row = await this.profileRepository.findByUserId(userId)
    return { overpassEnabled: row?.overpassEnabled ?? false }
  }

  async updateOverpassEnabled(userId: string, enabled: boolean): Promise<ProfileResponse> {
    await this.profileRepository.updateOverpassEnabled(userId, enabled)
    return this.getProfile(userId)
  }
}
