'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { api, ApiFail, initials } from './lib';
import { PasswordInput } from './PasswordInput';

type Persona = { id: number; name: string; role_name: string; description: string };

export function LoginView({ personas }: { personas: Persona[] | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); window.location.href = '/'; }
    catch (e) { setErr((e as ApiFail).message); setBusy(false); }
  };
  const submit = () => {
    if (!email.trim() || !password) { setErr('Enter your email and password'); return; }
    go(() => api('/api/auth/login', { method: 'POST', body: { email, password } }));
  };

  return (
    <div className="login">
      <div className="lh">
        <div className="lgcard"><img src="/logo-full.webp" alt="Shree Guruji, Swad bhi Sehat bhi" width={200} height={167} /></div>
        <div>
          <h2>Every enquiry and complaint in one place.</h2>
          <p>From WhatsApp, the website, email and phone calls. Assigned, followed up and closed.</p>
          <ul>
            <li>Each team sees only what is assigned to them</li>
            <li>Received and resolution dates on every enquiry</li>
            <li>One-tap WhatsApp and call for every lead</li>
          </ul>
        </div>
        <div className="by">Built on Pucho · pucho.ai</div>
      </div>
      <div className="lf">
        <div className="lc">
          <div><h3>Sign in</h3><p>Use the email and password your administrator gave you.</p></div>
          <form className="rform" onSubmit={e => { e.preventDefault(); submit(); }}>
            <div className="fld"><label htmlFor="l_e">Email</label>
              <input id="l_e" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} autoFocus />
            </div>
            <div className="fld"><label htmlFor="l_p">Password</label>
              <PasswordInput id="l_p" value={password} onChange={setPassword} autoComplete="current-password" />
            </div>
            {err && <div className="err" role="alert">{err}</div>}
            <button className="btn" style={{ justifyContent: 'center' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          {personas && personas.length > 0 && (
            <>
              <p className="fine" style={{ marginTop: 4 }}>Demo database: pick a persona to enter without a password.</p>
              <div className="pers">
                {personas.map(r => (
                  <button key={r.id} disabled={busy} onClick={() => go(() => api('/api/auth/demo', { method: 'POST', body: { user_id: r.id } }))}>
                    <div className="av">{initials(r.name)}</div>
                    <div><b>{r.name}</b><small>{r.role_name} · {r.description}</small></div>
                    <Icon k="arrow" />
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="fine">Forgot your password? Ask an administrator to reset it on Users &amp; roles.</p>
        </div>
      </div>
    </div>
  );
}
