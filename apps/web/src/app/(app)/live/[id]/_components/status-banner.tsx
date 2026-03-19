interface StatusBannerProps {
  variant: 'error' | 'offline'
  message: string
}

export function StatusBanner({ variant, message }: StatusBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="status-banner"
      className={`absolute bottom-24 left-0 right-0 z-30 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm ${
        variant === 'offline'
          ? 'bg-destructive/90 text-destructive-foreground'
          : 'bg-amber-500/90 text-white'
      }`}
    >
      {message}
    </div>
  )
}
