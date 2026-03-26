export const MAP_STYLES = [
  { id: 'liberty',  label: 'Liberty',  description: 'Clair · équilibré', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'bright',   label: 'Bright',   description: 'Coloré · vif',      url: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'positron', label: 'Positron', description: 'Minimaliste',       url: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'dark',     label: 'Dark',     description: 'Nuit',               url: 'https://tiles.openfreemap.org/styles/dark' },
] as const

export type MapStyleId = typeof MAP_STYLES[number]['id']
