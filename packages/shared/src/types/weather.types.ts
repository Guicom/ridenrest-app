export interface WeatherPoint {
  km: number         // Position along route
  forecastAt: string // ISO 8601 — estimated passage time
  temperatureC: number | null
  precipitationMm: number | null
  windSpeedKmh: number | null
  windDirection: number | null
  weatherCode: string | null
}

export interface WeatherForecast {
  segmentId: string
  waypoints: WeatherPoint[]
  cachedAt: string
  expiresAt: string
}
