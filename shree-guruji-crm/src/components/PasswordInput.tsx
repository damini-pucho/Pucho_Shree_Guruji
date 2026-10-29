'use client';
import { useState } from 'react';
import { Icon } from './Icon';

// Password field with a show / hide eye.
export function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} maxLength={200} />
      <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(s => !s)}>
        <Icon k={show ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </div>
  );
}
