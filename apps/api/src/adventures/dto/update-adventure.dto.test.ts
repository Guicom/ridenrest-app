import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateAdventureDto } from './update-adventure.dto.js'

const validateDto = async (payload: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateAdventureDto, payload)
  return validate(dto)
}

describe('UpdateAdventureDto — routingProfile', () => {
  it.each(['road', 'gravel', 'bikepacking'])('accepts the valid profile "%s"', async (profile) => {
    const errors = await validateDto({ routingProfile: profile })
    expect(errors).toHaveLength(0)
  })

  it('accepts an absent routingProfile (optional)', async () => {
    const errors = await validateDto({ name: 'Rename only' })
    const profileErrors = errors.filter((e) => e.property === 'routingProfile')
    expect(profileErrors).toHaveLength(0)
  })

  it('rejects an invalid routingProfile value', async () => {
    const errors = await validateDto({ routingProfile: 'mountain' })
    const profileError = errors.find((e) => e.property === 'routingProfile')
    expect(profileError).toBeDefined()
    expect(profileError?.constraints?.isIn).toContain('road, gravel, bikepacking')
  })

  it('rejects a non-string routingProfile value', async () => {
    const errors = await validateDto({ routingProfile: 42 })
    expect(errors.some((e) => e.property === 'routingProfile')).toBe(true)
  })
})
