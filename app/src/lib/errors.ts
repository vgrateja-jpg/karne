// Turn raw Postgres/Supabase error text into something she can act on.
export function friendlyError(msg: string): string {
  if (/numeric field overflow/i.test(msg))
    return 'That number is too large to save — please check for an extra digit (amount, price, weight, or quantity).'
  if (/duplicate key|already exists/i.test(msg)) return 'That already exists.'
  return msg
}
