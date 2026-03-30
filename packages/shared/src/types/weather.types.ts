export interface StageWeatherPoint {
  forecastAt: string           // ISO 8601 — ETA at stage endpoint
  temperatureC: number
  precipitationMmH: number     // mm/h (Open-Meteo precipitation field)
  windSpeedKmh: number
  windDirectionDeg: number     // degrees, meteorological (0=N, clockwise)
  iconEmoji: string | null
}

export interface WeatherPoint {
  km: number                         // Position along route (segment-relative)
  forecastAt: string                 // ISO 8601 — estimated passage time (ETA)
  temperatureC: number | null
  precipitationProbability: number | null  // 0–100 %
  windSpeedKmh: number | null
  windDirection: number | null       // degrees, meteorological (0=N, clockwise)
  weatherCode: number | null         // WMO weather code integer
  iconEmoji: string | null           // Mapped from WMO_ICON
}

export interface WeatherForecast {
  segmentId: string
  waypoints: WeatherPoint[]
  cachedAt: string
  expiresAt: string
}
