'use client';
import { ReactNode, useEffect } from 'react';
import { Icon } from './Icon';
import { api, digits, shortDate, tone } from './lib';

export type Lead = {
  id: number; kind: 'lead' | 'complaint'; name: string; phone: string; email: string; city_id: number | null; city: string | null;
  source_id: number; source: string; type_id: number; type: string; purpose_id: number; purpose: string; purpose_category: string;
  details: string; stage: string; team_id: string; team: string; assigned_to: number | null; assignee: string | null;
  received_on: string; resolved_on: string | null; remarks: string; customer_informed: boolean; age_days: number;
};

export const Badge = ({ stage }: { stage: string }) => <span className={`badge t-${tone(stage)}`}>{stage}</span>;

export const Converted = ({ r }: { r: Lead }) => <span className="conv">Converted{r.resolved_on ? ' ' + shortDate(r.resolved_on) : ''}</span>;

export const StageCell = ({ r }: { r: Lead }) => (r.stage === 'Converted' ? <Converted r={r} /> : <Badge stage={r.stage} />);

export const Dash = () => <span style={{ color: 'var(--faint)' }}>—</span>;

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="empty" aria-busy="true"><span className="spin" />{label}</div>;
}

const waText = (r: Lead) =>
  `Namaste ${r.name}, this is Shree Guruji regarding ${r.kind === 'complaint' ? 'your complaint: ' : r.purpose_category === 'job' ? 'your job application: ' : 'your enquiry: '}${r.details}.`;

// One-tap WhatsApp (click-to-chat link) and phone call; each tap is written to the record's activity.
export function Contact({ r, big }: { r: Lead; big?: boolean }) {
  const d = digits(r.phone);
  if (!d) return <small style={{ color: 'var(--faint)' }}>No phone</small>;
  const logC = (channel: 'call' | 'whatsapp') => { api(`/api/leads/${r.id}/activity`, { method: 'POST', body: { channel } }).catch(() => {}); };
  const c = big ? ' lg' : '';
  return (
    <span className="cx" style={big ? { display: 'flex', width: '100%' } : undefined}>
      <a className={`cbtn wa${c}`} href={`https://wa.me/${d}?text=${encodeURIComponent(waText(r))}`} target="_blank" rel="noopener noreferrer"
        title={`WhatsApp ${r.phone}`} aria-label={`WhatsApp ${r.name}`} onClick={e => { e.stopPropagation(); logC('whatsapp'); }}>
        <Icon k="wa" />{big && 'WhatsApp'}
      </a>
      <a className={`cbtn call${c}`} href={`tel:+${d}`} title={`Call ${r.phone}`} aria-label={`Call ${r.name}`}
        onClick={e => { e.stopPropagation(); logC('call'); }}>
        <Icon k="phone" />{big && 'Call'}
      </a>
    </span>
  );
}

export function Field({ label, htmlFor, error, hint, full, children }: {
  label: string; htmlFor?: string; error?: string; hint?: ReactNode; full?: boolean; children: ReactNode;
}) {
  return (
    <div className={`fld${full ? ' full' : ''}${error ? ' bad' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <>
      <div className="scrim top" onClick={onClose} />
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ph"><h2>{title}</h2><button className="ib" aria-label="Close" onClick={onClose}><Icon k="x" /></button></div>
        <div className="db">{children}</div>
        <div className="df">{footer}</div>
      </div>
    </>
  );
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') fn(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [fn]);
}

export function Opts({ list, all }: { list: { id: number | string; label: string }[]; all?: string }) {
  return <>{all !== undefined && <option value="">{all}</option>}{list.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</>;
}
