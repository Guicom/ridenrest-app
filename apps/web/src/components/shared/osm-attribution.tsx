// ALWAYS render on map views — ODbL license requirement (non-dismissable)
export function OsmAttribution() {
  return (
    <div className="absolute bottom-5 right-2 z-10 bg-white/80 dark:bg-black/60 text-[10px] text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded pointer-events-none select-none">
      ©{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto underline"
      >
        OpenStreetMap
      </a>{' '}
      contributors
    </div>
  )
}
