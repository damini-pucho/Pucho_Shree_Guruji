'use client';
import { useCallback, useEffect, useState } from 'react';
import { PAGES } from '@/lib/access';
import { Icon } from './Icon';
import { api, ApiFail, emitChange, initials, stamp } from './lib';
import { Empty, Field, Loading, Modal } from './ui';
import { useApp } from './Shell';

type Person = {
  id: number; name: string; email: string; role_id: string; role_name: string; role_short: string; handles: string;
  is_active: boolean; must_change_password: boolean; last_login_at: string | null; open_items: number;
};

export function Users() {
  const { me, options, toast, reloadOptions } = useApp();
  const [rows, setRows] = useState<Person[] | null>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const load = useCallback(() => { api<Person[]>('/api/users').then(r => { setRows(r); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const roles = options?.roles || [];

  return (
    <>
      <section className="panel tbl">
        <div className="ph"><h2>People</h2><button className="btn sm" onClick={() => setEdit('new')} disabled={!options}><Icon k="plus" size={15} />Add person</button></div>
        {err ? <Empty title="Could not load people">{err}</Empty> : !rows ? <Loading /> : (
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Handles</th><th>Open items</th><th>Last sign-in</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} onClick={() => setEdit(p)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setEdit(p)}>
                  <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><div className="av">{initials(p.name)}</div>
                    <div><b style={{ fontWeight: 500 }}>{p.name}{p.id === me.id ? ' (you)' : ''}</b><small>{p.email}</small></div></div></td>
                  <td>{p.role_name}</td>
                  <td style={{ color: 'var(--mut)' }}>{p.handles}</td>
                  <td className="num">{p.open_items}</td>
                  <td className="num" style={{ color: 'var(--mut)' }}>{p.last_login_at ? stamp(p.last_login_at) : 'Never'}</td>
                  <td>{!p.is_active ? <span className="badge t-mute">Deactivated</span> : p.must_change_password ? <span className="badge t-warn">Password to set</span> : <span className="badge t-ok">Active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel tbl perm">
        <div className="ph"><h2>Page access by role</h2><small>Rows are always limited to what is assigned</small></div>
        <table>
          <thead><tr><th>Page</th>{roles.map(r => <th key={r.id}>{r.short_name}</th>)}</tr></thead>
          <tbody>
            {PAGES.filter(p => p.group).map(p => (
              <tr key={p.key}><td>{p.label}</td>{roles.map(r => <td key={r.id}>{p.roles.includes(r.id as any) ? <span className="yes">✓</span> : <span className="no">—</span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="note"><b>Who sees what.</b> Admin sees every enquiry. Everyone else sees what is assigned to them, plus their team’s enquiries nobody has picked up yet. Deactivating a person sends their open work back to the team queue.</div>
      {edit && <PersonModal person={edit === 'new' ? null : edit} onClose={() => setEdit(null)}
        onSaved={async m => { setEdit(null); toast(m); load(); await reloadOptions(); emitChange(); }} />}
    </>
  );
}

function PersonModal({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (m: string) => void }) {
  const { me, options, toast } = useApp();
  const self = person?.id === me.id;
  const [f, setF] = useState({ name: person?.name || '', email: person?.email || '', role_id: person?.role_id || 'cs', password: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      if (person) await api(`/api/users/${person.id}`, { method: 'PATCH', body });
      else await api('/api/users', { method: 'POST', body });
      onSaved(msg);
    } catch (e) { const x = e as ApiFail; setErrs(x.fields); toast(x.message); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (!person) return run(f, `${f.name} added. Share the temporary password with them.`);
    const body: Record<string, unknown> = {};
    if (f.name !== person.name) body.name = f.name;
    if (f.role_id !== person.role_id) body.role_id = f.role_id;
    if (f.password) body.password = f.password;
    if (!Object.keys(body).length) { onClose(); return; }
    return run(body, f.password ? 'Saved. They must set a new password at next sign-in.' : 'Saved');
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: '' }); };

  return (
    <Modal title={person ? `Edit ${person.name}` : 'Add person'} onClose={onClose} footer={
      <>
        {person && !self && (
          <button className="btn sec" style={{ marginRight: 'auto', color: person.is_active ? 'var(--bad)' : undefined }} disabled={busy}
            onClick={() => {
              if (person.is_active && !window.confirm(`Deactivate ${person.name}? They are signed out and their ${person.open_items} open item(s) go back to the team queue.`)) return;
              run({ is_active: !person.is_active }, person.is_active ? `${person.name} deactivated` : `${person.name} reactivated`);
            }}>{person.is_active ? 'Deactivate' : 'Reactivate'}</button>
        )}
        <button className="btn sec" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>
    }>
      <Field label="Name" htmlFor="u_n" error={errs.name}><input id="u_n" value={f.name} onChange={set('name')} maxLength={120} autoFocus /></Field>
      <Field label="Email (sign-in)" htmlFor="u_e" error={errs.email}>
        <input id="u_e" type="email" value={f.email} onChange={set('email')} maxLength={200} disabled={!!person} />
      </Field>
      <Field label="Role" htmlFor="u_r" error={errs.role_id} hint={self ? 'You cannot change your own role.' : undefined} full>
        <select id="u_r" value={f.role_id} onChange={set('role_id')} disabled={self}>
          {options?.roles.map(r => <option key={r.id} value={r.id}>{r.name} — {r.description}</option>)}
        </select>
      </Field>
      <Field label={person ? 'Reset password (optional)' : 'Temporary password'} htmlFor="u_p" error={errs.password} full
        hint="At least 8 characters with a number. They must change it at first sign-in.">
        <input id="u_p" type="text" autoComplete="new-password" value={f.password} onChange={set('password')} maxLength={200} />
      </Field>
    </Modal>
  );
}
