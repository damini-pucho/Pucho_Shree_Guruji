'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PAGES, PageKey } from '@/lib/access';
import { Icon } from './Icon';
import { api, emitChange, initials } from './lib';
import { Lead, useEscape } from './ui';
import { LeadDrawer } from './LeadDrawer';
import { LeadForm } from './LeadForm';

export type Me = { id: number; name: string; email: string; role_id: string; role_name: string; role_short: string; must_change_password: boolean };
export type Counts = { leads: number; complaints: number; alerts: number; reminders_today: number; reminders_overdue: number };
type Opt = { id: number; label: string; used: number };
export type Options = {
  sources: Opt[]; types: (Opt & { default_role: string })[]; purposes: (Opt & { category: string })[]; cities: (Opt & { state: string })[];
  roles: { id: string; name: string; short_name: string; description: string }[];
  users: { id: number; name: string; role_id: string; role_short: string }[];
};
type FormState = { mode: 'add'; kind: 'lead' | 'complaint' } | { mode: 'edit'; lead: Lead } | null;

type Ctx = {
  me: Me; admin: boolean; counts: Counts | null; options: Options | null;
  toast: (m: string) => void; reloadOptions: () => Promise<void>;
  openLead: (id: number) => void; openForm: (f: FormState) => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

const TITLE: Record<string, string> = Object.fromEntries(PAGES.map(p => [p.path, p.label]));

function isDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
export function setTheme(t: 'light' | 'dark') {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('sg-theme', t); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('crm:theme'));
}
export function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const f = () => setDark(isDark());
    f();
    window.addEventListener('crm:theme', f);
    return () => window.removeEventListener('crm:theme', f);
  }, []);
  return dark;
}

export function Shell({ me, demoPersonas, children }: { me: Me; demoPersonas: { id: number; name: string; role_short: string }[] | null; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const admin = me.role_id === 'admin';
  const [counts, setCounts] = useState<Counts | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [toasts, setToasts] = useState<{ id: number; m: string }[]>([]);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [side, setSide] = useState(false);
  const [q, setQ] = useState('');
  const dark = useDark();
  const tid = useRef(0);

  const toast = useCallback((m: string) => {
    const id = ++tid.current;
    setToasts(t => [...t, { id, m }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);
  const loadCounts = useCallback(() => { api('/api/me').then(d => setCounts(d.counts)).catch(() => {}); }, []);
  const reloadOptions = useCallback(async () => { if (!me.must_change_password) setOptions(await api('/api/options')); }, [me.must_change_password]);

  useEffect(() => {
    loadCounts(); reloadOptions().catch(() => toast('Could not load the setup lists'));
    window.addEventListener('crm:changed', loadCounts);
    return () => window.removeEventListener('crm:changed', loadCounts);
  }, [loadCounts, reloadOptions, toast]);

  // Keep the header search in step with the address bar.
  useEffect(() => {
    setSide(false); setMenu(false); setBell(false);
    setQ(new URLSearchParams(window.location.search).get('q') || '');
  }, [path]);

  const onSearch = (v: string) => {
    setQ(v);
    const base = path === '/complaints' ? '/complaints' : '/leads';
    const sp = new URLSearchParams(path === base ? window.location.search : '');
    if (v) sp.set('q', v); else sp.delete('q');
    sp.delete('page');
    const url = base + (sp.toString() ? '?' + sp : '');
    if (path === base) router.replace(url, { scroll: false }); else router.push(url);
  };

  const closeAll = useCallback(() => { setMenu(false); setBell(false); setSide(false); }, []);
  useEscape(closeAll);

  const signOut = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/login'; };
  const switchTo = async (id: number) => {
    try { await api('/api/auth/demo', { method: 'POST', body: { user_id: id } }); window.location.href = '/'; }
    catch (e: any) { toast(e.message); }
  };

  const cnt: Partial<Record<PageKey, number>> = counts ? { leads: counts.leads, comp: counts.complaints, rem: counts.reminders_today } : {};
  const alerts = counts ? counts.alerts + counts.reminders_overdue : 0;
  const groups = (['Work', 'Admin'] as const).map(g => ({ g, items: PAGES.filter(p => p.group === g && p.roles.includes(me.role_id as any)) })).filter(x => x.items.length);
  const title = TITLE[path] || '';

  const ctx: Ctx = { me, admin, counts, options, toast, reloadOptions, openLead: setLeadId, openForm: setForm };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {side && <div className="scrim" style={{ zIndex: 49 }} onClick={() => setSide(false)} />}
        <aside className={`side${side ? ' open' : ''}`}>
          <div className="brand">
            <div className="logo"><img src="/logo-mark.webp" alt="Shree Guruji, since 1965" width={120} height={47} /></div>
            <small>Lead &amp; complaint CRM</small>
          </div>
          <nav className="navs" aria-label="Main">
            {groups.map(({ g, items }) => (
              <div className="grp" key={g}>
                <span>{g}</span>
                {items.map(p => (
                  <Link key={p.key} href={p.path} className={`nv${path === p.path ? ' on' : ''}`} aria-current={path === p.path ? 'page' : undefined}>
                    <Icon k={p.icon} />{p.label}
                    {p.key in cnt && <span className="ct num">{cnt[p.key]}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="acct">
            {menu && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); router.push('/profile'); }}>Profile &amp; settings</button>
                <button role="menuitem" onClick={() => { setTheme(dark ? 'light' : 'dark'); setMenu(false); }}>{dark ? 'Light' : 'Dark'} theme</button>
                {demoPersonas && demoPersonas.length > 0 && (
                  <>
                    <hr /><div className="lbl">Switch demo persona</div>
                    {demoPersonas.map(p => (
                      <button role="menuitem" key={p.id} onClick={() => switchTo(p.id)}>{p.id === me.id ? '● ' : ''}{p.name}</button>
                    ))}
                  </>
                )}
                <hr />
                <button role="menuitem" onClick={signOut}>Sign out</button>
              </div>
            )}
            <button className="me" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label={`Account menu: ${me.name}`}>
              <div className="av">{initials(me.name)}</div>
              <div style={{ minWidth: 0 }}><b>{me.name}</b><small>{me.role_short}</small></div>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="hdr">
            <div className="hl">
              <button className="ib burger" aria-label="Open menu" onClick={() => setSide(true)}><Icon k="menu" /></button>
              <img className="hlogo" src="/logo-mark.webp" alt="Shree Guruji" />
              <h1>{title}</h1>
            </div>
            <div className="srch">
              <Icon k="search" />
              <input id="q" type="search" placeholder="Search name, city, phone, remarks" value={q} onChange={e => onSearch(e.target.value)}
                aria-label="Search leads and complaints" disabled={me.must_change_password} />
            </div>
            <div className="hr">
              <button className="ib" aria-label="Switch theme" onClick={() => setTheme(dark ? 'light' : 'dark')}><Icon k={dark ? 'sun' : 'moon'} /></button>
              <div style={{ position: 'relative' }}>
                <button className="ib" aria-label={`Alerts: ${alerts}`} aria-expanded={bell} onClick={() => setBell(b => !b)} disabled={me.must_change_password}>
                  <Icon k="bell" />{alerts > 0 && <span className="dot num">{alerts}</span>}
                </button>
                {bell && counts && (
                  <>
                    <div className="scrim clear" onClick={() => setBell(false)} />
                    <div className="pop" role="menu">
                      <div className="lbl">Needs attention</div>
                      <BellRows counts={counts} close={() => setBell(false)} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
          <div className="content">
            <div className="wrap">
              <h1 className="ptitle">{title}</h1>
              {children}
              <div className="foot">Built on <b>Pucho</b> · pucho.ai</div>
            </div>
          </div>
        </div>
      </div>
      {leadId != null && <LeadDrawer id={leadId} onClose={() => setLeadId(null)} />}
      {form && <LeadForm state={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); emitChange(); }} />}
      <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className="toast">{t.m}</div>)}</div>
    </AppCtx.Provider>
  );
}

function BellRows({ counts, close }: { counts: Counts; close: () => void }) {
  const [d, setD] = useState<{ open: number; told: number } | null>(null);
  useEffect(() => {
    api('/api/leads?kind=complaint&size=5').then(c => setD({ open: c.counts.Open, told: c.counts.attn })).catch(() => {});
  }, []);
  const rows: [string, string, number | undefined][] = [
    ['New complaints (not started)', '/complaints?seg=Open', d?.open],
    ['Closed, customer not told', '/complaints?seg=attn', d?.told],
    ['Overdue reminders', '/reminders?mode=late', counts.reminders_overdue],
    ['Reminders due today', '/reminders', counts.reminders_today],
  ];
  return <>{rows.map(([l, h, n]) => <Link role="menuitem" key={h} href={h} onClick={close}><span>{l}</span><b className="num">{n ?? '…'}</b></Link>)}</>;
}
