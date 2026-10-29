'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, shortPur, shortSrc } from './lib';
import { Badge, Empty, Lead, Loading } from './ui';
import { useApp } from './Shell';

type Dash = {
  kpis: { open_leads: number; converted: number; sales_total: number; sales_converted: number; open_complaints: number; not_told: number; total: number; open_all: number };
  bySource: { label: string; n: number }[]; byPurpose: { label: string; n: number }[]; byStage: { label: string; n: number }[];
  queue: Lead[];
};

function Bars({ items }: { items: [string, number][] }) {
  const m = Math.max(1, ...items.map(i => i[1]));
  return (
    <div className="bars">
      {items.map(([l, n]) => (
        <div className="bar" key={l}><span title={l}>{l}</span><i><u style={{ width: `${(n / m) * 100}%` }} /></i><b className="num">{n}</b></div>
      ))}
    </div>
  );
}

export function Overview() {
  const { me, admin, openLead } = useApp();
  const router = useRouter();
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { api<Dash>('/api/dashboard').then(x => { setD(x); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => {
    load();
    window.addEventListener('crm:changed', load);
    return () => window.removeEventListener('crm:changed', load);
  }, [load]);

  if (err) return <section className="panel"><Empty title="Could not load the overview">{err}</Empty></section>;
  if (!d) return <section className="panel"><Loading /></section>;
  const k = d.kpis;
  const pct = k.sales_total ? Math.round((k.sales_converted / k.sales_total) * 100) : 0;
  const tiles: [string, number, string, boolean, string][] = [
    ['Open enquiries', k.open_leads, '/leads?seg=active', false, ''],
    ['Converted', k.converted, '/leads?seg=Converted', false, k.sales_total ? `${pct}% of sales enquiries` : ''],
    ['Open complaints', k.open_complaints, '/complaints?seg=active', k.open_complaints > 0, ''],
    ['Closed, customer not told', k.not_told, '/complaints?seg=attn', k.not_told > 0, ''],
  ];

  return (
    <>
      <div className="kpis">
        {tiles.map(([label, n, href, alert, sub]) => (
          <button key={label} className={`kpi${alert ? ' alert' : ''}`} onClick={() => router.push(href)}>
            <span>{label}{sub && <> <small className="num" style={{ color: 'var(--ok)' }}>· {sub}</small></>}</span>
            <b className="num">{n}</b><em>Open list →</em>
          </button>
        ))}
      </div>
      <div className="g2">
        <section className="panel"><div className="ph"><h2>Enquiries by source</h2><small>{k.total} total</small></div>
          <div className="pb"><Bars items={d.bySource.map(x => [shortSrc(x.label), x.n])} /></div></section>
        <section className="panel"><div className="ph"><h2>Enquiries by purpose</h2><small>{k.open_all} open</small></div>
          <div className="pb"><Bars items={d.byPurpose.map(x => [shortPur(x.label), x.n])} /></div></section>
      </div>
      <section className="panel">
        <div className="ph"><h2>Needs action</h2><small>Oldest first</small></div>
        {d.queue.length ? (
          <ul className="queue">
            {d.queue.map(r => {
              const noReply = r.kind === 'complaint' && r.stage === 'Closed' && !r.customer_informed;
              return (
                <li key={r.id} onClick={() => openLead(r.id)} onKeyDown={e => e.key === 'Enter' && openLead(r.id)} tabIndex={0} role="button">
                  <div className="q1"><b>{r.name}</b><small>{shortPur(r.purpose)} · {r.details || '—'}{r.city ? ' · ' + r.city : ''}</small></div>
                  {noReply ? <span className="badge t-bad">Customer not told</span> : <Badge stage={r.stage} />}
                  <span className="num" style={{ color: 'var(--mut)', fontSize: 12, width: 34, textAlign: 'right' }}>{r.age_days}d</span>
                </li>
              );
            })}
          </ul>
        ) : <Empty title="Nothing waiting">New enquiries and unanswered complaints show here.</Empty>}
      </section>
      {!admin && <div className="note">You are signed in as <b>{me.name}</b> ({me.role_name}). You see the enquiries assigned to you and your team’s unassigned queue.</div>}
    </>
  );
}
