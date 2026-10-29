'use client';
import { useState } from 'react';
import { api, ApiFail, initials } from './lib';
import { Field } from './ui';
import { setTheme, useApp, useDark } from './Shell';
import { PasswordInput } from './PasswordInput';

export function Profile() {
  const { me, toast } = useApp();
  const dark = useDark();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (f.next !== f.confirm) { setErrs({ confirm: 'The two passwords do not match' }); return; }
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'POST', body: { current: f.current, next: f.next } });
      toast('Password changed. Other devices were signed out.');
      setF({ current: '', next: '', confirm: '' }); setErrs({});
      if (me.must_change_password) window.location.href = '/';
    } catch (e) { const x = e as ApiFail; setErrs(x.fields); toast(x.message); }
    finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setErrs({ ...errs, [k]: '' }); };

  return (
    <>
      {me.must_change_password && <div className="note warnnote"><b>Set your own password to continue.</b> An administrator gave you a temporary one.</div>}
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="ph"><h2>Profile</h2></div>
        <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="av" style={{ width: 44, height: 44 }}>{initials(me.name)}</div>
            <div><b>{me.name}</b><div style={{ color: 'var(--mut)', fontSize: 13 }}>{me.role_name} · {me.email}</div></div>
          </div>
          <div className="fld"><label>Theme</label>
            <div className="seg">
              <button className={!dark ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
              <button className={dark ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
            </div>
          </div>
        </div>
      </section>
      <section className="panel" style={{ maxWidth: 560 }}>
        <div className="ph"><h2>Change password</h2></div>
        <form className="pb rform" onSubmit={e => { e.preventDefault(); change(); }}>
          <Field label="Current password" htmlFor="pw_c" error={errs.current}>
            <PasswordInput id="pw_c" value={f.current} onChange={set('current')} autoComplete="current-password" />
          </Field>
          <Field label="New password" htmlFor="pw_n" error={errs.next} hint="At least 8 characters, with letters and a number.">
            <PasswordInput id="pw_n" value={f.next} onChange={set('next')} autoComplete="new-password" />
          </Field>
          <Field label="Repeat new password" htmlFor="pw_r" error={errs.confirm}>
            <PasswordInput id="pw_r" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
          </Field>
          <div><button className="btn" disabled={busy || !f.current || !f.next}>{busy ? 'Saving…' : 'Change password'}</button></div>
        </form>
      </section>
    </>
  );
}
