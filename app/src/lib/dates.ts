// Month helpers for the reporting views. month is 0-based (0 = January).

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month + 1, 0).getDate()
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`
}

export function addMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// 'YYYY-MM-DD' → 'Jun 01'
export function fmtDayLabel(iso: string): string {
  return `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(8, 10)}`
}
export function weekday(iso: string): string {
  return WD[new Date(iso + 'T00:00:00').getDay()]
}
export function quarterRange(year: number, q: number): { from: string; to: string } {
  const startM = (q - 1) * 3 // 0-based
  const last = new Date(year, startM + 3, 0).getDate()
  return { from: `${year}-${pad(startM + 1)}-01`, to: `${year}-${pad(startM + 3)}-${pad(last)}` }
}
export function quarterMonths(q: number): number[] {
  const s = (q - 1) * 3
  return [s, s + 1, s + 2]
}
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}
