export interface WebsiteTextRow {
  key: string
  section: string
  label: string
  default_text: string
  value: string | null
  revision: number
  updated_at: string | null
}
export type TextVariables = Record<string, string | number>
export function websiteTextLookup(rows: readonly WebsiteTextRow[]) {
  const lookup = new Map<string, string | null>()
  for (const row of rows) lookup.set(`${row.section}\0${row.default_text}`, row.value)
  return lookup
}
/** Values are returned as plain strings; React handles escaping at the render site. */
export function resolveWebsiteText(lookup: ReadonlyMap<string,string | null>, section: string, original: string, variables?: TextVariables, currentFallback?: string, usePublishedDefault = false): string {
  const key = `${section}\0${original}`
  const template = lookup.get(key) ?? (usePublishedDefault && lookup.has(key) ? original : currentFallback ?? original)
  return variables ? template.replace(/\{([^{}]+)\}/g, (token, key: string) => Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : token) : template
}
