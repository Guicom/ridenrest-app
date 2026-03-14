// Used for live mode connection issues
interface StatusBannerProps {
  message: string
  type?: 'warning' | 'error' | 'info'
}

export function StatusBanner({ message, type = 'warning' }: StatusBannerProps) {
  const colors = {
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  }

  return (
    <div className={`border px-4 py-2 rounded-md text-sm ${colors[type]}`}>
      {message}
    </div>
  )
}
