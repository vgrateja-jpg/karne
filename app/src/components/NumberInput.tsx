import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { Input } from './ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | ''
  onChange: (v: number | '') => void
}

// A number field that's actually typable on phones/tablets: it uses a text input
// with a decimal keypad and keeps the raw text while typing, so intermediate
// states like "0." or "" aren't wiped (the old type="number" + Number() pattern
// cleared the field mid-decimal). Emits a number (or '' when empty) to the parent.
export function NumberInput({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(value === '' ? '' : String(value))
  const editing = useRef(false)

  // Re-sync from the parent only when not actively typing (e.g. after a reset/save),
  // and only if the numeric meaning actually differs — so we never clobber "0.".
  useEffect(() => {
    if (editing.current) return
    const parsed = text === '' || text === '.' ? '' : Number(text)
    if (value !== parsed) setText(value === '' ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => (editing.current = true)}
      onBlur={() => (editing.current = false)}
      onChange={(e) => {
        const t = e.target.value
        if (!/^\d*\.?\d*$/.test(t)) return // digits and at most one dot
        setText(t)
        onChange(t === '' || t === '.' ? '' : Number(t))
      }}
    />
  )
}
