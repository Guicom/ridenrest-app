export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 1024
}
