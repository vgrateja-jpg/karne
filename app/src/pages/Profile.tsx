import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Banner, Button, Card, Field, Input, PageHeader } from '../components/ui'

export function Profile() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const email = session?.user?.email ?? ''

  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setFullName(data?.full_name ?? '')
        setLoading(false)
      })
  }, [userId])

  async function saveName() {
    if (!userId) return
    setSavingName(true)
    setNameMsg(null)
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() || null }).eq('id', userId)
    setSavingName(false)
    setNameMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved. This name now shows in the Audit Trail.' })
  }

  async function changePassword() {
    setPwMsg(null)
    if (pw1.length < 6) {
      setPwMsg({ ok: false, text: 'Use at least 6 characters.' })
      return
    }
    if (pw1 !== pw2) {
      setPwMsg({ ok: false, text: "The two passwords don't match." })
      return
    }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setSavingPw(false)
    if (error) setPwMsg({ ok: false, text: error.message })
    else {
      setPwMsg({ ok: true, text: 'Password changed. Use the new one next time you sign in.' })
      setPw1('')
      setPw2('')
    }
  }

  return (
    <div>
      <PageHeader title="My Profile" />

      <Card className="mb-4 max-w-xl">
        <div className="mb-1 text-sm font-medium text-slate-700">Your name</div>
        <p className="mb-3 text-xs text-slate-500">
          This is the name shown in the Audit Trail (instead of your email), so changes are easy to recognize.
        </p>
        {nameMsg && (
          <div className="mb-3">
            <Banner kind={nameMsg.ok ? 'success' : 'error'}>{nameMsg.text}</Banner>
          </div>
        )}
        <div className="space-y-3">
          <Field label="Email (sign-in)">
            <Input value={email} disabled className="bg-slate-50 text-slate-500" />
          </Field>
          <Field label="Display name">
            <Input
              value={loading ? '' : fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aling Maria"
            />
          </Field>
          <Button onClick={saveName} disabled={savingName || loading}>
            {savingName ? 'Saving…' : 'Save name'}
          </Button>
        </div>
      </Card>

      <Card className="max-w-xl">
        <div className="mb-1 text-sm font-medium text-slate-700">Change password</div>
        <p className="mb-3 text-xs text-slate-500">Pick a password only you know. You'll use it the next time you sign in.</p>
        {pwMsg && (
          <div className="mb-3">
            <Banner kind={pwMsg.ok ? 'success' : 'error'}>{pwMsg.text}</Banner>
          </div>
        )}
        <div className="space-y-3">
          <Field label="New password">
            <Input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </Field>
          <Button onClick={changePassword} disabled={savingPw || !pw1 || !pw2}>
            {savingPw ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
