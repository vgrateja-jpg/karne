// Peso formatting + small helpers.

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

export function money(n: number | null | undefined): string {
  return peso.format(Number(n ?? 0))
}

const qtyFmt = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 })

export function qty(n: number | null | undefined): string {
  return qtyFmt.format(Number(n ?? 0))
}

// Calendar date (YYYY-MM-DD) in Philippine business time (Asia/Manila, UTC+8),
// regardless of the device's own timezone — so the shop's "day" is the same for
// everyone (her in PH, the dev elsewhere). toISOString()/device-local could be
// off by a day. Uses formatToParts so it's not affected by locale separators.
const phParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function phDate(d: Date): string {
  const p = phParts.formatToParts(d)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function today(): string {
  return phDate(new Date())
}
