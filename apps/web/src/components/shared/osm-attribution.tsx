// ALWAYS render on map views — ODbL license requirement
export function OsmAttribution() {
  return (
    <div className="text-xs text-muted-foreground">
      ©{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        OpenStreetMap
      </a>{' '}
      contributors
    </div>
  )
}
