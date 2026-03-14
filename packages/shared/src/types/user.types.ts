export type Tier = 'free' | 'pro' | 'team'
export type UnitPref = 'km' | 'mi'
export type Currency = 'EUR' | 'USD' | 'GBP'

export interface UserProfile {
  id: string
  email: string
  name: string
  tier: Tier
  unitPref: UnitPref
  currency: Currency
  stravaAthleteId: string | null
}
