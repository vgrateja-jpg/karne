// ============================================================================
// sms-inbound — Supabase Edge Function (webhook)
//
// A free Android SMS-forwarder app on her business SIM POSTs each incoming text
// here. We authenticate with a shared secret, best-effort parse the message into
// order line-items (matching the product catalog + aliases), match the sender to
// a customer by phone, and drop a row into `sms_inbox` for her to review & confirm
// in the app. Uses the service role (server-side only) so it can write past RLS.
//
// Deploy: see SMS_SETUP.md  (deploy with JWT verification OFF; we use our own
// shared secret instead, so the forwarder app doesn't need a Supabase token).
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface ProductRow {
  id: string
  name: string
  price: number
  unit: string
}
interface AliasRow {
  product_id: string
  alias: string
}
interface ParsedItem {
  product_id: string | null
  name: string
  matched: boolean
  quantity: number
  unit_price: number
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Use POST' }, 405)
  }

  // --- shared-secret auth (header or ?secret=) ---
  const secret = Deno.env.get('SMS_WEBHOOK_SECRET')
  const url = new URL(req.url)
  const provided = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret')
  if (!secret || provided !== secret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // --- read {from, text} from JSON or form-encoded (forwarder apps vary) ---
  let from = ''
  let text = ''
  const ct = req.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      const b = await req.json()
      from = String(b.from ?? b.sender ?? b.phone ?? b.number ?? '')
      text = String(b.text ?? b.message ?? b.body ?? b.msg ?? b.content ?? '')
    } else {
      const f = await req.formData()
      const g = (k: string) => (f.get(k) ?? '').toString()
      from = g('from') || g('sender') || g('phone') || g('number')
      text = g('text') || g('message') || g('body') || g('msg') || g('content')
    }
  } catch {
    // ignore parse errors; handled below
  }

  text = text.trim()
  if (!text) return json({ error: 'No message text found in request' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const [{ data: products }, { data: aliases }, { data: customers }] = await Promise.all([
    supabase.from('products').select('id,name,price,unit').eq('is_active', true),
    supabase.from('product_aliases').select('product_id,alias'),
    supabase.from('customers').select('id,phone'),
  ])

  const parsed = parseOrder(text, (products ?? []) as ProductRow[], (aliases ?? []) as AliasRow[])
  const matched = matchCustomer(from, (customers ?? []) as { id: string; phone: string | null }[])

  const { error } = await supabase.from('sms_inbox').insert({
    from_number: from || null,
    raw_text: text,
    parsed,
    matched_customer: matched,
    status: 'pending',
  })
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true, parsed_items: parsed.length, matched_customer: matched })
})

// --- helpers ---------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function matchCustomer(
  from: string,
  customers: { id: string; phone: string | null }[],
): string | null {
  const digits = (from || '').replace(/\D/g, '')
  if (digits.length < 7) return null
  const tail = digits.slice(-10)
  const hit = customers.find(
    (c) => c.phone && c.phone.replace(/\D/g, '').slice(-10) === tail,
  )
  return hit?.id ?? null
}

// Best-effort: split the message into segments, match each to a product
// (longest catalog name/alias that appears), and pull a quantity number.
function parseOrder(text: string, products: ProductRow[], aliases: AliasRow[]): ParsedItem[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const keys: { key: string; product_id: string }[] = []
  for (const p of products) keys.push({ key: norm(p.name), product_id: p.id })
  for (const a of aliases) if (byId.has(a.product_id)) keys.push({ key: norm(a.alias), product_id: a.product_id })
  keys.sort((a, b) => b.key.length - a.key.length) // match longest first

  const segments = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
  const items: ParsedItem[] = []

  for (const seg of segments) {
    const nseg = norm(seg)
    const hit = keys.find((k) => k.key.length >= 2 && nseg.includes(k.key))
    const qty = extractQty(seg)
    if (hit) {
      const p = byId.get(hit.product_id)!
      items.push({ product_id: p.id, name: p.name, matched: true, quantity: qty, unit_price: p.price })
    } else if (qty > 0) {
      // a quantity but no recognized product — keep it so she can fix it
      items.push({ product_id: null, name: seg, matched: false, quantity: qty, unit_price: 0 })
    }
  }
  return items
}

function extractQty(seg: string): number {
  // first number in the segment; treat a trailing k/kg/kl/kilo as a unit, not ×1000
  const m = seg.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}
