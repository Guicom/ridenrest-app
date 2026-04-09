import changelogRaw from '../../CHANGELOG.md'

export interface ReleaseEntry {
  version: string
  date: string
  sections: { title: string; items: string[] }[]
}

export function parseChangelog(raw: string, targetVersion: string): ReleaseEntry | null {
  // Split by version headers (## x.y.z — date)
  const versionBlocks = raw.split(/^## /m).filter((b) => /^\d+\.\d+\.\d+/.test(b))

  for (const block of versionBlocks) {
    const headerMatch = block.match(/^(\d+\.\d+\.\d+)\s*[—–-]\s*(\d{4}-\d{2}-\d{2})/)
    if (!headerMatch || headerMatch[1] !== targetVersion) continue

    const version = headerMatch[1]
    const date = headerMatch[2]

    // Extract ### sections
    const sectionBlocks = block.split(/^### /m).slice(1)
    const sections: { title: string; items: string[] }[] = []

    for (const sectionBlock of sectionBlocks) {
      const lines = sectionBlock.trim().split('\n')
      const title = lines[0].trim()
      const items = lines
        .slice(1)
        .map((line) => line.replace(/^- /, '').trim())
        .filter((item) => item.length > 0)

      if (items.length > 0) {
        sections.push({ title, items })
      }
    }

    return { version, date, sections }
  }

  return null
}

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0'
export const currentRelease = parseChangelog(changelogRaw, appVersion)
