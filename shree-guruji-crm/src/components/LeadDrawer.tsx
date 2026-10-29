'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { stagesFor } from '@/lib/access';
import { Icon } from './Icon';
import { api, emitChange, fmtPhone, relDay, shortDate, shortPur, shortSrc, stamp, t12, todayIST } from './lib';
import { Contact, Lead, Loading, StageCell, useEscape } from './ui';
import { useApp } from './Shell';

type Detail = {
  lead: Lead;
  activity: { id: number; type: string; message: string; created_at: string; user_name: string | null }[];
  reminders: { id: number; title: string; due_date: string; due_time: string | null; user_name: string }[];
};

export function LeadDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { options, toast, openForm, me } = useApp();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'details' | 'act'>('details');
  const [note, setNote] = useState('');
  const [rmk, setRmk] = useState('');
  const [saving, setSaving] = useState(false);
  useEscape(onClose);

  const load = useCallback(() => {
    api<Detail>(`/api/leads/${id}`).then(x => { setD(x); setRmk(x.lead.remarks); setErr(''); }).catch(e => setErr(e.message));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('crm:changed', load);
    return () => window.removeEventListener('crm:changed', load);
  }, [load]);

  const upd = async (patch: Record<string, unknown>, ok: string) => {
    setSaving(true);
    try {
      const r = await api(`/api/leads/${id}`, { method: 'PATCH', body: patch });
      toast(r.lead?.stage === 'Converted' && patch.stage === 'Converted' ? 'Lead converted' : ok);
      emitChange();
      if (!r.visible) { toast('It now sits with someone else, so it left your list'); onClose(); return; }
      load();
    } catch (e: any) {
      toast(e.message);
      load();
    } finally { setSaving(false); }
  };

  const saveNote = async () => {
    const v = note.trim();
    if (!v) { toast('Write a note first'); return; }
    try {
      await api(`/api/leads/${id}/activity`, { method: 'POST', body: { message: v } });
      setNote(''); toast('Note saved'); load();
    } catch (e: any) { toast(e.message); }
  };

  const r = d?.lead;
  const c = r?.kind === 'complaint';
  const today = todayIST();

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={r?.name || 'Enquiry'}>
        {!r ? (
          <div className="db">{err ? <div className="empty"><b>Could not open this record</b>{err}<div style={{ marginTop: 12 }}><button className="btn sec sm" onClick={onClose}>Close</button></div></div> : <Loading />}</div>
        ) : (
          <>
            <div className="dh">
              <div className="top">
                <h2>{r.name}</h2>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="ib" aria-label="Edit details" title="Edit details" onClick={() => openForm({ mode: 'edit', lead: r })}><Icon k="edit" /></button>
                  <button className="ib" aria-label="Close" onClick={onClose}><Icon k="x" /></button>
                </div>
              </div>
              <div className="meta">
                <StageCell r={r} />
                <span className="type">{r.type}</span><span className="type">{shortPur(r.purpose)}</span><span className="type">{shortSrc(r.source)}</span>
              </div>
              <Contact r={r} big />
            </div>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>Details</button>
              <button role="tab" aria-selected={tab === 'act'} className={tab === 'act' ? 'on' : ''} onClick={() => setTab('act')}>Activity · {d.activity.length}</button>
            </div>
            <div className="db">
              {tab === 'details' ? (
                <>
                  <dl className="kv">
                    <dt>Phone</dt><dd className="num">{fmtPhone(r.phone) || '—'}</dd>
                    {r.email && <><dt>Email</dt><dd style={{ overflowWrap: 'anywhere' }}>{r.email}</dd></>}
                    <dt>City</dt><dd>{r.city || '—'}</dd>
                    <dt>Lead type</dt><dd>{r.type}</dd>
                    <dt>Purpose</dt><dd>{r.purpose}</dd>
                    <dt>Source</dt><dd>{r.source}</dd>
                    <dt>Team</dt><dd>{r.team}</dd>
                    <dt>{c ? 'Issue' : 'Enquiry'}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.details || '—'}</dd>
                  </dl>
                  <div className="two">
                    <div className="fld"><label htmlFor="d_st">Stage</label>
                      <select id="d_st" value={r.stage} disabled={saving} onChange={e => upd({ stage: e.target.value }, 'Stage updated')}>
                        {stagesFor(r.kind).map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="fld"><label htmlFor="d_as">Assigned to</label>
                      <select id="d_as" value={r.assigned_to ?? ''} disabled={saving}
                        onChange={e => { const v = e.target.value ? Number(e.target.value) : null; const n = options?.users.find(u => u.id === v)?.name; upd({ assigned_to: v }, v ? `Reassigned to ${n}` : 'Unassigned'); }}>
                        <option value="">Unassigned ({r.team} queue)</option>
                        {options?.users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role_short}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="two">
                    <div className="fld"><label htmlFor="d_at">Enquiry received</label>
                      <input type="date" id="d_at" value={r.received_on} max={today} disabled={saving}
                        onChange={e => e.target.value && upd({ received_on: e.target.value }, 'Received date saved')} />
                    </div>
                    <div className="fld"><label htmlFor="d_res">Resolution date</label>
                      <input type="date" id="d_res" value={r.resolved_on || ''} min={r.received_on} max={today}
                        disabled={saving || !r.resolved_on} onChange={e => e.target.value && upd({ resolved_on: e.target.value }, 'Resolution date saved')} />
                      {!r.resolved_on && <span className="hint">Filled in when closed, rejected or converted</span>}
                    </div>
                  </div>
                  {c && (
                    <label className="chk">
                      <input id="d_resp" type="checkbox" checked={r.customer_informed} disabled={saving}
                        onChange={e => upd({ customer_informed: e.target.checked }, 'Saved')} />
                      <span><b style={{ fontWeight: 500 }}>Customer has been told</b><br /><small style={{ color: 'var(--mut)' }}>Tick once the handler has replied to the customer.</small></span>
                    </label>
                  )}
                  <div className="fld"><label htmlFor="d_rmk">Remarks</label>
                    <textarea id="d_rmk" rows={3} maxLength={2000} placeholder="Outcome, next step or reason for rejection" value={rmk}
                      onChange={e => setRmk(e.target.value)} onBlur={() => rmk.trim() !== r.remarks && upd({ remarks: rmk.trim() }, 'Remarks saved')} />
                    <span className="hint">Saved when you click away.</span>
                  </div>
                  <div className="fld"><label>Follow-up reminders</label>
                    <div className="lrem">
                      {d.reminders.length ? d.reminders.map(x => (
                        <div key={x.id}><span>{x.title}{x.user_name && me.role_id === 'admin' ? <small style={{ color: 'var(--mut)' }}> · {x.user_name}</small> : null}</span>
                          <span className="num" style={{ color: x.due_date < today ? 'var(--bad)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                            {relDay(x.due_date) || shortDate(x.due_date)}{x.due_time ? ' · ' + t12(x.due_time) : ''}
                          </span></div>
                      )) : <small style={{ color: 'var(--mut)' }}>No open reminders.</small>}
                    </div>
                    <div><button className="btn sec sm" onClick={() => { onClose(); router.push(`/reminders?lead=${r.id}`); }}><Icon k="cal" size={15} />Set reminder</button></div>
                  </div>
                </>
              ) : (
                <>
                  <div className="fld"><label htmlFor="nt">Add a note</label>
                    <textarea id="nt" rows={3} maxLength={2000} placeholder="What happened on the call?" value={note} onChange={e => setNote(e.target.value)} />
                  </div>
                  <div><button className="btn sm" onClick={saveNote}>Save note</button></div>
                  <ul className="tl">
                    {d.activity.map(x => (
                      <li key={x.id}><div>{x.message}<small className="num">{stamp(x.created_at)}{x.user_name ? ' · ' + x.user_name : ''}</small></div></li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
