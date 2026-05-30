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

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
