const WEATHER_PACE_KEY = 'ridenrest:weather-pace'

export interface StoredWeatherPace {
  departureTime?: string
  speedKmh?: number
}

export function getStoredWeatherPace(): StoredWeatherPace {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(WEATHER_PACE_KEY) : null
    return raw ? (JSON.parse(raw) as StoredWeatherPace) : {}
  } catch {
    return {}
  }
}
