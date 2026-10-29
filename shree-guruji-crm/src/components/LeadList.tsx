'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stagesFor } from '@/lib/access';
import { Icon } from './Icon';
import { api, emitChange, fmtPhone, shortDate, shortPur, shortSrc, tone } from './lib';
import { Contact, Converted, Dash, Empty, Lead, Loading, Opts } from './ui';
import { useApp } from './Shell';

type Res = { rows: Lead[]; total: number; counts: Record<string, number>; page: number; size: number };

const SEGS: Record<'lead' | 'complaint', [string, string][]> = {
  lead: [['all', 'All'], ['Open', 'Open'], ['In Progress', 'In Progress'], ['Closed', 'Closed'], ['Rejected', 'Rejected'], ['Converted', 'Converted']],
  complaint: [['all', 'All'], ['Open', 'Open'], ['In Progress', 'In Progress'], ['attn', 'Customer not told'], ['Closed', 'Closed'], ['Rejected', 'Rejected']],
};
const FILTER_KEYS = ['q', 'seg', 'source', 'type', 'purpose', 'city', 'assigned', 'from', 'to', 'page'];

export function LeadList({ kind }: { kind: 'lead' | 'complaint' }) {
  const { options, admin, toast, openLead, openForm } = useApp();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'table' | 'board'>('table');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => { try { const v = localStorage.getItem(`sg-view-${kind}`); if (v === 'board' || v === 'table') setView(v); } catch { /* ignore */ } }, [kind]);
  const pickView = (v: 'table' | 'board') => { setView(v); try { localStorage.setItem(`sg-view-${kind}`, v); } catch { /* ignore */ } };

  const p = (k: string) => sp.get(k) || '';
  const seg = p('seg') || 'all';
  const query = FILTER_KEYS.filter(k => p(k)).map(k => `${k}=${encodeURIComponent(p(k))}`).join('&');

  const load = useCallback(() => {
    const n = ++seq.current;
    api<Res>(`/api/leads?kind=${kind}&view=${view}${query ? '&' + query : ''}`)
      .then(r => { if (n === seq.current) { setRes(r); setErr(''); } })
      .catch(e => { if (n === seq.current) setErr(e.message); });
  }, [kind, view, query]);

  useEffect(() => { const t = setTimeout(load, 180); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    window.addEventListener('crm:changed', load);
    return () => window.removeEventListener('crm:changed', load);
  }, [load]);

  const setParam = (k: string, v: string) => {
    const s = new URLSearchParams(sp.toString());
    if (v && !(k === 'seg' && v === 'all')) s.set(k, v); else s.delete(k);
    if (k !== 'page') s.delete('page');
    router.replace(path + (s.toString() ? '?' + s : ''), { scroll: false });
  };
  const anyFilter = FILTER_KEYS.some(k => k !== 'page' && k !== 'seg' && p(k));

  const setStage = async (r: Lead, stage: string) => {
    if (stage === r.stage) return;
    setRes(x => x && { ...x, rows: x.rows.map(y => (y.id === r.id ? { ...y, stage } : y)) });
    try {
      await api(`/api/leads/${r.id}`, { method: 'PATCH', body: { stage } });
      toast(stage === 'Converted' ? 'Lead converted' : `Moved to ${stage}`);
    } catch (e: any) { toast(e.message); }
    emitChange();
  };

  const counts = res?.counts || {};
  const purposes = (options?.purposes || []).filter(x => (kind === 'complaint') === (x.category === 'complaint'));
  const stages = stagesFor(kind);

  const bar = (
    <div className="bar2">
      <div className="seg" role="tablist" aria-label="Stage">
        {SEGS[kind].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={seg === k} className={seg === k ? 'on' : ''} onClick={() => setParam('seg', k)}>
            {l}<i className="num">{counts[k] ?? '–'}</i>
          </button>
        ))}
      </div>
      <select className="sel" aria-label="Source" value={p('source')} onChange={e => setParam('source', e.target.value)}><Opts list={options?.sources || []} all="All sources" /></select>
      <select className="sel" aria-label="Lead type" value={p('type')} onChange={e => setParam('type', e.target.value)}><Opts list={options?.types || []} all="All types" /></select>
      {kind === 'lead' && <select className="sel" aria-label="Purpose" value={p('purpose')} onChange={e => setParam('purpose', e.target.value)}><Opts list={purposes} all="All purposes" /></select>}
      <select className="sel" aria-label="City" value={p('city')} onChange={e => setParam('city', e.target.value)}><Opts list={options?.cities || []} all="All cities" /></select>
      <select className="sel" aria-label="Assigned to" value={p('assigned')} onChange={e => setParam('assigned', e.target.value)}>
        <option value="">{admin ? 'Everyone' : 'Mine + team queue'}</option>
        <option value="me">Assigned to me</option>
        <option value="none">Unassigned</option>
        {admin && options?.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {anyFilter && <button className="btn sec sm" onClick={() => router.replace(path + (seg !== 'all' ? `?seg=${encodeURIComponent(seg)}` : ''), { scroll: false })}>Clear filters</button>}
      <span className="sp" />
      <div className="seg" aria-label="View">
        <button className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => pickView('table')}>Table</button>
        <button className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => pickView('board')}>Board</button>
      </div>
      <button className="btn" disabled={!options} onClick={() => openForm({ mode: 'add', kind })}>
        <Icon k="plus" size={16} />{kind === 'complaint' ? 'Log complaint' : 'Add enquiry'}
      </button>
    </div>
  );

  if (err) return <>{bar}<section className="panel"><Empty title="Could not load the list">{err}</Empty></section></>;
  if (!res) return <>{bar}<section className="panel"><Loading /></section></>;

  if (view === 'board') {
    const cols = seg === 'all' || seg === 'active' || seg === 'attn' ? stages : stages.filter(s => s === seg);
    return (
      <>
        {bar}
        <p className="boardhint">Drag a card to another column to change its stage. Tap a card to open it.</p>
        <div className="board">
          {cols.map(s => {
            const list = res.rows.filter(r => r.stage === s);
            return (
              <div key={s} className={`colm${dragOver === s ? ' drop' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s); }} onDragLeave={() => setDragOver(d => (d === s ? null : d))}
                onDrop={e => { e.preventDefault(); setDragOver(null); const id = Number(e.dataTransfer.getData('text/plain')); const r = res.rows.find(x => x.id === id); if (r) setStage(r, s); }}>
                <h3><span>{s}</span><span className="num">{list.length}</span></h3>
                {list.map(r => (
                  <div key={r.id} className={`crd${r.stage === 'Converted' ? ' won' : ''}`} role="button" tabIndex={0} draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', String(r.id)); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => openLead(r.id)} onKeyDown={e => e.key === 'Enter' && openLead(r.id)}>
                    <b>{r.name}</b><small>{r.details || '—'}</small>
                    {r.stage === 'Converted' && <div style={{ marginTop: 6 }}><Converted r={r} /></div>}
                    <div className="row">
                      {/* Stage picker on the card: the touch / keyboard way to move it between columns. */}
                      <select className={`stsel t-${tone(r.stage)}`} aria-label={`Stage of ${r.name}`} value={r.stage}
                        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onChange={e => setStage(r, e.target.value)}>
                        {stages.map(st => <option key={st}>{st}</option>)}
                      </select>
                      <small style={{ marginTop: 0, textAlign: 'right' }}>{[r.type, r.city].filter(Boolean).join(' · ')}</small>
                    </div>
                    <div className="row"><Contact r={r} /><small>{r.assignee || 'Unassigned'}</small></div>
                  </div>
                ))}
                {!list.length && <small className="colempty">Nothing here</small>}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  const L = res.rows;
  const from = (res.page - 1) * res.size + 1, to = Math.min(res.total, res.page * res.size);
  const stageCells = (r: Lead) => (
    <>
      <td className="gs" onClick={e => e.stopPropagation()}>
        <select className={`stsel t-${tone(r.stage)}`} aria-label={`Stage of ${r.name}`} value={r.stage} onChange={e => setStage(r, e.target.value)}>
          {stages.map(s => <option key={s}>{s}</option>)}
        </select>
        {r.stage === 'Converted' && <div style={{ marginTop: 4 }}><Converted r={r} /></div>}
      </td>
      <td className="num">{shortDate(r.received_on)}</td>
      <td>{r.assignee || <span style={{ color: 'var(--faint)' }}>Unassigned · {r.team}</span>}</td>
      <td className="num">{r.resolved_on ? shortDate(r.resolved_on) : <Dash />}</td>
      <td className="ge"><div className="rmk" title={r.remarks}>{r.remarks || <Dash />}</div></td>
    </>
  );
  const head = <><th className="gs">Stage</th><th>Enquiry Received Date</th><th>Enquiry Handler / Assigned To</th><th>Resolution Date</th><th className="ge">Remarks</th></>;
  const noRows = kind === 'complaint'
    ? <Empty title="No complaints here">{anyFilter ? 'Clear the search or filters, or pick another stage.' : 'Complaints you log from WhatsApp, the website, email and phone calls land in this list.'}</Empty>
    : <Empty title={seg === 'Converted' ? 'No converted leads yet' : 'No enquiries match'}>{seg === 'Converted' ? 'Enquiries you move to Converted show here.' : 'Clear the search or pick another stage.'}</Empty>;

  return (
    <>
      {bar}
      <section className="panel tbl">
        {L.length ? (
          kind === 'lead' ? (
            <table style={{ minWidth: 1320 }}>
              <thead>
                <tr><th></th><th colSpan={5} className="gh">Lead stage</th><th colSpan={4}></th></tr>
                <tr><th>Lead</th>{head}<th>Contact</th><th>Type</th><th>Purpose</th><th>Source</th></tr>
              </thead>
              <tbody>
                {L.map(r => (
                  <tr key={r.id} className={r.stage === 'Converted' ? 'won' : ''} onClick={() => openLead(r.id)}>
                    <td><b style={{ fontWeight: 500 }}>{r.name}</b><small className="num">{[fmtPhone(r.phone), r.city].filter(Boolean).join(' · ')}</small></td>
                    {stageCells(r)}
                    <td><Contact r={r} /></td>
                    <td><span className="type">{r.type}</span></td>
                    <td className="purp">{shortPur(r.purpose)}</td>
                    <td>{shortSrc(r.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ minWidth: 1440 }}>
              <thead>
                <tr><th></th><th colSpan={5} className="gh">Lead stage</th><th colSpan={5}></th></tr>
                <tr><th>Complainant</th>{head}<th>Customer told</th><th>Contact</th><th>Issue</th><th>Type</th><th>Source</th></tr>
              </thead>
              <tbody>
                {L.map(r => {
                  const noReply = r.stage === 'Closed' && !r.customer_informed;
                  return (
                    <tr key={r.id} onClick={() => openLead(r.id)}>
                      <td><b style={{ fontWeight: 500 }}>{r.name}</b><small>{r.city ? r.city + ' · ' : ''}{r.age_days} d</small></td>
                      {stageCells(r)}
                      <td>{r.customer_informed ? <span className="badge t-ok">Yes</span> : <span className={`badge ${noReply ? 't-bad' : 't-mute'}`}>Not yet</span>}</td>
                      <td><Contact r={r} /></td>
                      <td className="wr">{r.details}</td>
                      <td><span className="type">{r.type}</span></td>
                      <td>{shortSrc(r.source)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : noRows}
      </section>
      {res.total > res.size && (
        <div className="pager">
          <small className="num">{from}–{to} of {res.total}</small>
          <button className="btn sec sm" disabled={res.page <= 1} onClick={() => setParam('page', String(res.page - 1))}><Icon k="left" size={15} />Previous</button>
          <button className="btn sec sm" disabled={to >= res.total} onClick={() => setParam('page', String(res.page + 1))}>Next<Icon k="arrow" size={15} /></button>
        </div>
      )}
    </>
  );
}
