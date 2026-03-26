/** WMO weather code → icon emoji mapping */
export const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '❄️', 73: '❄️', 75: '❄️',
  80: '🌦', 81: '🌧', 82: '⛈',
  95: '⛈', 96: '⛈', 99: '⛈',
}

/** Fallback icon for unknown WMO codes */
export const WMO_ICON_FALLBACK = '🌡'
