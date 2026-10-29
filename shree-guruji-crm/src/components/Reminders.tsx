'use client';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { api, ApiFail, emitChange, longDate, relDay, shift, shortDate, shortPur, t12, todayIST } from './lib';
import { Empty, Field, Loading } from './ui';
import { useApp } from './Shell';

type Rem = { id: number; title: string; due_date: string; due_time: string | null; done: boolean; lead_id: number | null; user_id: number; lead_name: string | null; user_name: string; overdue: boolean };
type LeadOpt = { id: number; name: string; purpose: string; kind: string };

export function Reminders() {
  const { me, admin, options, toast, openLead } = useApp();
  const sp = useSearchParams();
  const TODAY = todayIST();
  const [mode, setMode] = useState<'day' | 'week' | 'late'>(sp.get('mode') === 'late' ? 'late' : sp.get('mode') === 'week' ? 'week' : 'day');
  const [date, setDate] = useState(TODAY);
  const [data, setData] = useState<{ rows: Rem[]; overdue: number } | null>(null);
  const [err, setErr] = useState('');
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [f, setF] = useState({ title: '', date: TODAY, time: '10:00', lead: sp.get('lead') || '', user: String(me.id) });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const url = mode === 'late' ? '/api/reminders?overdue=1' : mode === 'week' ? `/api/reminders?from=${TODAY}&to=${shift(TODAY, 6)}` : `/api/reminders?from=${date}&to=${date}`;
  const load = useCallback(() => { api(url).then(x => { setData(x); setErr(''); }).catch(e => setErr(e.message)); }, [url]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('crm:changed', load);
    return () => window.removeEventListener('crm:changed', load);
  }, [load]);
  useEffect(() => {
    api('/api/leads?kind=any&view=board').then(r => setLeads(r.rows)).catch(() => {});
    if (sp.get('lead')) titleRef.current?.focus();
  }, [sp]);

  const setDay = (s: string) => { if (!s) return; setDate(s); setMode('day'); setF(x => ({ ...x, date: s < TODAY ? TODAY : s })); };

  const add = async () => {
    if (!f.title.trim()) { setErrs({ title: 'Write what to do first' }); titleRef.current?.focus(); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { title: f.title, due_date: f.date, due_time: f.time || null, lead_id: f.lead ? Number(f.lead) : null };
      if (admin) body.user_id = Number(f.user);
      const r = await api('/api/reminders', { method: 'POST', body });
      toast(`Reminder added for ${relDay(r.due_date) || shortDate(r.due_date)}`);
      setF(x => ({ ...x, title: '', lead: '' })); setErrs({});
      setDate(r.due_date); setMode('day');
      emitChange();
    } catch (e) {
      const x = e as ApiFail; setErrs(x.fields); toast(x.message);
    } finally { setBusy(false); }
  };
  const done = async (r: Rem, v: boolean) => {
    try { await api(`/api/reminders/${r.id}`, { method: 'PATCH', body: { done: v } }); toast(v ? 'Marked done' : 'Reopened'); emitChange(); }
    catch (e: any) { toast(e.message); }
  };
  const del = async (r: Rem) => {
    if (!window.confirm(`Delete the reminder “${r.title}”?`)) return;
    try { await api(`/api/reminders/${r.id}`, { method: 'DELETE' }); toast('Reminder deleted'); emitChange(); }
    catch (e: any) { toast(e.message); }
  };

  const list = data?.rows || [];
  const open = list.filter(x => !x.done).length;
  const late = data?.overdue ?? 0;
  const head = mode === 'late' ? ['Overdue', 'Open reminders from earlier days'] : mode === 'week' ? ['Next 7 days', `${shortDate(TODAY)} to ${shortDate(shift(TODAY, 6))}`] : [(relDay(date) ? relDay(date) + ', ' : '') + longDate(date), ''];
  const sb = (label: string, on: boolean, fn: () => void) => <button className={on ? 'on' : ''} onClick={fn}>{label}</button>;

  return (
    <>
      <div className="dbar">
        <div className="seg">
          {sb('Yesterday', mode === 'day' && date === shift(TODAY, -1), () => setDay(shift(TODAY, -1)))}
          {sb('Today', mode === 'day' && date === TODAY, () => setDay(TODAY))}
          {sb('Tomorrow', mode === 'day' && date === shift(TODAY, 1), () => setDay(shift(TODAY, 1)))}
          {sb('Next 7 days', mode === 'week', () => setMode('week'))}
          <button className={mode === 'late' ? 'on' : ''} onClick={() => setMode('late')}>Overdue<i className="num" style={late ? { color: 'var(--bad)' } : undefined}>{late}</i></button>
        </div>
        <div className="dnav">
          <button className="ib sm" aria-label="Previous day" onClick={() => setDay(shift(date, -1))}><Icon k="left" /></button>
          <input type="date" aria-label="Pick a date" value={date} onChange={e => setDay(e.target.value)} />
          <button className="ib sm" aria-label="Next day" onClick={() => setDay(shift(date, 1))}><Icon k="arrow" /></button>
        </div>
      </div>
      <div className="rg">
        <section className="panel">
          <div className="ph"><div className="dhead" style={{ flex: 1 }}><h2>{head[0]}</h2>
            <small className="num">{head[1] ? head[1] + ' · ' : ''}{open} open{list.length - open ? ` · ${list.length - open} done` : ''}</small></div></div>
          {err ? <Empty title="Could not load reminders">{err}</Empty> : !data ? <Loading /> : list.length ? (
            <ul className="rl">
              {list.map(x => (
                <li key={x.id} className={`${x.done ? 'done' : ''}${x.overdue ? ' late' : ''}`}>
                  <input type="checkbox" aria-label={x.done ? 'Reopen' : 'Mark done'} checked={x.done} onChange={e => done(x, e.target.checked)} />
                  <span className="tm num">{mode === 'day' ? t12(x.due_time) : shortDate(x.due_date)}</span>
                  <div className="rt"><b>{x.title}</b>
                    <small>
                      {x.lead_id && x.lead_name ? <><button onClick={() => openLead(x.lead_id!)}>{x.lead_name}</button> · </> : null}
                      {mode !== 'day' && x.due_time ? t12(x.due_time) + ' · ' : ''}{x.user_name}
                    </small>
                  </div>
                  <button className="del" aria-label="Delete reminder" onClick={() => del(x)}>✕</button>
                </li>
              ))}
            </ul>
          ) : <Empty title={mode === 'late' ? 'Nothing overdue' : `No reminders ${mode === 'week' ? 'this week' : 'on this day'}`}>Add one with the New reminder form.</Empty>}
        </section>
        <section className="panel">
          <div className="ph"><h2>New reminder</h2></div>
          <div className="pb rform">
            <Field label="What to do" htmlFor="r_title" error={errs.title}>
              <input id="r_title" ref={titleRef} maxLength={200} placeholder="e.g. Call back about rate card" value={f.title}
                onChange={e => setF({ ...f, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && add()} />
            </Field>
            <div className="two">
              <Field label="Date" htmlFor="r_date" error={errs.due_date}>
                <input type="date" id="r_date" min={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
              </Field>
              <Field label="Time" htmlFor="r_time" error={errs.due_time}>
                <input type="time" id="r_time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} />
              </Field>
            </div>
            <Field label="Lead or complaint" htmlFor="r_lead" error={errs.lead_id}>
              <select id="r_lead" value={f.lead} onChange={e => setF({ ...f, lead: e.target.value })}>
                <option value="">None</option>
                {leads.map(r => <option key={r.id} value={r.id}>{r.name} · {shortPur(r.purpose)}</option>)}
              </select>
            </Field>
            {admin && (
              <Field label="For" htmlFor="r_as" error={errs.user_id} hint="Linked to a lead and left on you, it goes to the lead’s handler.">
                <select id="r_as" value={f.user} onChange={e => setF({ ...f, user: e.target.value })}>
                  {options?.users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role_short}</option>)}
                </select>
              </Field>
            )}
            <button className="btn" disabled={busy} onClick={add}><Icon k="plus" size={16} />{busy ? 'Adding…' : 'Add reminder'}</button>
          </div>
        </section>
      </div>
    </>
  );
}
