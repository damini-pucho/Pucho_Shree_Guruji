'use client';
import { useState } from 'react';
import { STAGES } from '@/lib/access';
import { api, emitChange } from './lib';
import { Loading } from './ui';
import { useApp } from './Shell';

type Kind = 'sources' | 'types' | 'purposes' | 'cities';
const CATEGORY: Record<string, string> = { sales: 'Sales (counts toward conversion)', complaint: 'Complaint', job: 'Job / hiring', other: 'Other' };

export function Setup() {
  const { options, toast, reloadOptions } = useApp();
  if (!options) return <section className="panel"><Loading /></section>;

  const done = async (msg: string) => { await reloadOptions(); emitChange(); toast(msg); };
  const remove = async (kind: Kind, id: number, label: string) => {
    try { await api(`/api/setup/${kind}/${id}`, { method: 'DELETE' }); await done(`Removed ${label}`); }
    catch (e: any) { toast(e.message); }
  };
  const patch = async (kind: Kind, id: number, body: object, msg: string) => {
    try { await api(`/api/setup/${kind}/${id}`, { method: 'PATCH', body }); await done(msg); }
    catch (e: any) { toast(e.message); }
  };
  const roleName = (id: string) => options.roles.find(r => r.id === id)?.short_name || id;

  return (
    <>
      <div className="note">These are the lists Shree Guruji uses for lead tracking. Every enquiry also records its received date, handler, resolution date and remarks. A value already used by an enquiry cannot be removed.</div>
      <div className="g2">
        <ChipList kind="sources" title="Lead sources" hint="Where enquiries are received from." items={options.sources} onRemove={remove} onAdded={done} />
        <ChipList kind="cities" title="Cities" hint="Operators pick a city from this list instead of typing it, so filters stay clean." items={options.cities} onRemove={remove} onAdded={done} withState />
      </div>
      <section className="panel tbl">
        <div className="ph"><h2>Lead types and routing</h2><small className="num">{options.types.length}</small></div>
        <div className="pb" style={{ paddingBottom: 0 }}>
          <p className="phint">Who is making the enquiry, and which team a new one goes to. Complaints always go to CS and job enquiries to HR; inside the team, the person with the fewest open items gets it.</p>
        </div>
        <table className="stbl">
          <thead><tr><th>Lead type</th><th>New enquiries go to</th><th>Used by</th><th></th></tr></thead>
          <tbody>
            {options.types.map(t => (
              <tr key={t.id}>
                <td>{t.label}</td>
                <td><select className="sel" aria-label={`Team for ${t.label}`} value={t.default_role}
                  onChange={e => patch('types', t.id, { default_role: e.target.value }, `${t.label} now goes to ${roleName(e.target.value)}`)}>
                  {options.roles.filter(r => r.id !== 'admin').map(r => <option key={r.id} value={r.id}>{r.short_name}</option>)}
                </select></td>
                <td className="num">{t.used}</td>
                <td><button className="btn sec sm" onClick={() => remove('types', t.id, t.label)} aria-label={`Remove ${t.label}`}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddRow kind="types" onAdded={done} extra={{ name: 'default_role', label: 'Team', options: options.roles.filter(r => r.id !== 'admin').map(r => [r.id, r.short_name]) }} />
      </section>
      <section className="panel tbl">
        <div className="ph"><h2>Enquiry purpose</h2><small className="num">{options.purposes.length}</small></div>
        <div className="pb" style={{ paddingBottom: 0 }}>
          <p className="phint">What the enquiry is about. A purpose of the Complaint kind puts the record on the Complaints page.</p>
        </div>
        <table className="stbl">
          <thead><tr><th>Purpose</th><th>Kind</th><th>Used by</th><th></th></tr></thead>
          <tbody>
            {options.purposes.map(p => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td><select className="sel" aria-label={`Kind of ${p.label}`} value={p.category}
                  onChange={e => patch('purposes', p.id, { category: e.target.value }, `${p.label} updated`)}>
                  {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></td>
                <td className="num">{p.used}</td>
                <td><button className="btn sec sm" onClick={() => remove('purposes', p.id, p.label)} aria-label={`Remove ${p.label}`}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddRow kind="purposes" onAdded={done} extra={{ name: 'category', label: 'Kind', options: Object.entries(CATEGORY) }} />
      </section>
      <section className="panel">
        <div className="ph"><h2>Lead stages</h2><small className="num">{STAGES.length} items</small></div>
        <div className="pb stg">
          <p style={{ margin: 0, color: 'var(--mut)', fontSize: 13 }}>The five standard stages agreed in the 28 Sep 2026 review. Change a stage from the Leads or Complaints table, the board, or the enquiry drawer. Closed, Rejected and Converted fill in the resolution date. Complaints are closed or rejected, never converted.</p>
          <h3>Stage</h3>
          <div className="chips">{STAGES.map(s => <span key={s} style={{ paddingRight: 10 }}>{s}</span>)}</div>
          <h3>Recorded with every stage</h3>
          <div className="chips">{['Enquiry Received Date', 'Enquiry Handler / Assigned To', 'Resolution Date', 'Remarks'].map(x => <span className="fx" key={x}>{x}</span>)}</div>
        </div>
      </section>
    </>
  );
}

function ChipList({ kind, title, hint, items, onRemove, onAdded, withState }: {
  kind: Kind; title: string; hint: string; items: { id: number; label: string; used: number; state?: string }[];
  onRemove: (k: Kind, id: number, label: string) => void; onAdded: (m: string) => Promise<void>; withState?: boolean;
}) {
  return (
    <section className="panel">
      <div className="ph"><h2>{title}</h2><small className="num">{items.length}</small></div>
      <div className="pb">
        <p className="phint">{hint}</p>
        <div className="chips">
          {items.map(x => (
            <span key={x.id} title={x.used ? `Used by ${x.used}` : 'Not used yet'}>{x.label}{x.state ? <small className="chst">{x.state}</small> : null}
              <button aria-label={`Remove ${x.label}`} onClick={() => onRemove(kind, x.id, x.label)}>✕</button></span>
          ))}
        </div>
      </div>
      <AddRow kind={kind} onAdded={onAdded} extra={withState ? { name: 'state', label: 'State', text: true } : undefined} />
    </section>
  );
}

function AddRow({ kind, onAdded, extra }: {
  kind: Kind; onAdded: (m: string) => Promise<void>;
  extra?: { name: string; label: string; options?: string[][]; text?: boolean };
}) {
  const { toast } = useApp();
  const [v, setV] = useState('');
  const [x, setX] = useState(extra?.options?.[0]?.[0] || '');
  const [err, setErr] = useState('');
  const add = async () => {
    const label = v.trim();
    if (!label) { setErr('Type a value first'); return; }
    try {
      await api(`/api/setup/${kind}`, { method: 'POST', body: { label, ...(extra && x ? { [extra.name]: x } : {}) } });
      setV(''); setErr(''); if (extra?.text) setX('');
      await onAdded(`Added ${label}`);
    } catch (e: any) { setErr(e.fields?.label || e.message); toast(e.message); }
  };
  return (
    <div className="pb" style={{ paddingTop: 0 }}>
      <div className="addrow">
        <input aria-label={`Add to ${kind}`} placeholder="Add a value" maxLength={60} value={v} onChange={e => { setV(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && add()} />
        {extra?.options && <select className="sel" aria-label={extra.label} value={x} onChange={e => setX(e.target.value)}>{extra.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        {extra?.text && <input aria-label={extra.label} placeholder={extra.label} maxLength={60} value={x} onChange={e => setX(e.target.value)} style={{ maxWidth: 140 }} />}
        <button className="btn sec sm" onClick={add}>Add</button>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
    </div>
  );
}
