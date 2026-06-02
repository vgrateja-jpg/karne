import { useEffect, useState } from 'react'
import { fetchSettings, type AppSettings } from '../lib/settings'
import { fmtDayLabel, weekday } from '../lib/dates'
import { today } from '../lib/format'
import { Button, Card, Input, PageHeader } from '../components/ui'
import { DayDetail } from '../components/DayDetail'
import { StoreCheck } from '../components/StoreCheck'

export function Daily() {
  const [date, setDate] = useState(today())
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    fetchSettings().then(setSettings)
  }, [])

  return (
    <div>
      <PageHeader
        title="Daily Report"
        action={
          <div className="no-print flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button onClick={() => window.print()}>🖨 Download PDF</Button>
          </div>
        }
      />
      <p className="no-print mb-4 text-sm text-slate-500">
        Everything for {date === today() ? 'today' : 'this day'} at a glance. It fills in as the day
        goes, and a new day starts fresh.
      </p>

      <div className="mb-4 hidden text-center print:block">
        <div className="text-xl font-bold text-slate-900">{settings?.business_name}</div>
        <div className="text-sm text-slate-600">
          Daily report — {weekday(date)} {fmtDayLabel(date)}, {date.slice(0, 4)}
        </div>
      </div>

      <Card className="print-area">
        <div className="mb-2 text-sm font-medium text-slate-700">
          {weekday(date)} · {fmtDayLabel(date)}, {date.slice(0, 4)}
        </div>
        <DayDetail date={date} />
      </Card>

      <Card className="print-area mt-4">
        <StoreCheck date={date} />
      </Card>
    </div>
  )
}
