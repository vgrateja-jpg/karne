import { useEffect, useState, type InputHTMLAttributes } from 'react'
import { Input } from './ui'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | ''
  onChange: (v: number | '') => void
}

// A number field that types reliably on phones/tablets. It keeps the raw text
// while typing (so a half-typed "0." isn't wiped) and is forgiving of keyboards
// that send a comma as the decimal key — it cleans the input instead of blocking
// it, so a stray character never makes the field feel "stuck".
export function NumberInput({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(value === '' ? '' : String(value))

  // Adopt the parent's value only when it differs numerically from what's shown
  // (e.g. after a save/reset), so we never clobber what the user is typing.
  useEffect(() => {
    setText((cur) => {
      const curNum = cur === '' || cur === '.' ? '' : Number(cur)
      return curNum === value ? cur : value === '' ? '' : String(value)
    })
  }, [value])

  function handle(raw: string) {
    let t = raw.replace(/,/g, '.').replace(/[^\d.]/g, '') // comma → dot, drop anything else
    const dot = t.indexOf('.')
    if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '') // at most one dot
    setText(t)
    onChange(t === '' || t === '.' ? '' : Number(t))
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handle(e.target.value)}
    />
  )
}
