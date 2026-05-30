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
