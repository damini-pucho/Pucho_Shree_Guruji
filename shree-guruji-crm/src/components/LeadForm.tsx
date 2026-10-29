'use client';
import { useMemo, useState } from 'react';
import { api, ApiFail, todayIST } from './lib';
import { Field, Lead, Modal, Opts } from './ui';
import { useApp } from './Shell';

type State = { mode: 'add'; kind: 'lead' | 'complaint' } | { mode: 'edit'; lead: Lead };

// Add an enquiry / log a complaint, or edit the core details of an existing record.
export function LeadForm({ state, onClose, onSaved }: { state: State; onClose: () => void; onSaved: () => void }) {
  const { options, me, admin, toast, openLead } = useApp();
  const edit = state.mode === 'edit' ? state.lead : null;
  const complaintFirst = state.mode === 'add' && state.kind === 'complaint';
  const o = options;

  const byLabel = (list: { id: number; label: string }[] | undefined, label: string) => list?.find(x => x.label === label)?.id ?? list?.[0]?.id ?? '';
  const initPurpose = edit?.purpose_id ?? (complaintFirst ? o?.purposes.find(p => p.category === 'complaint')?.id : byLabel(o?.purposes.filter(p => p.category !== 'complaint'), 'New Business Enquiry'));
  const initType = edit?.type_id ?? byLabel(o?.types, complaintFirst ? 'Consumer' : 'Retailer');

  const [f, setF] = useState({
    name: edit?.name ?? '', phone: edit?.phone ?? '', email: edit?.email ?? '',
    type_id: String(initType ?? ''), purpose_id: String(initPurpose ?? ''),
    source_id: String(edit?.source_id ?? byLabel(o?.sources, 'Phone Call')), city_id: String(edit?.city_id ?? ''),
    // Complaints follow the routing rule (to CS); a sales person's own enquiry stays with them by default.
    received_on: edit?.received_on ?? todayIST(), assigned: admin || complaintFirst ? 'auto' : String(me.id),
    details: edit?.details ?? '', remarks: '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<{ id: number; name: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF(x => ({ ...x, [k]: e.target.value })); setErrs(x => ({ ...x, [k]: '' })); setDup(null); };

  const purpose = o?.purposes.find(p => String(p.id) === f.purpose_id);
  const type = o?.types.find(t => String(t.id) === f.type_id);
  const isComplaint = purpose?.category === 'complaint';
  // The routing rule, shown so the person knows where "Auto" sends it.
  const routedTeam = useMemo(() => {
    const team = purpose?.category === 'complaint' ? 'cs' : purpose?.category === 'job' ? 'hr' : type?.default_role || 'cs';
    return o?.roles.find(r => r.id === team)?.short_name || team;
  }, [purpose, type, o]);

  if (!o) return null;

  const save = async (allowDuplicate = false) => {
    if (!f.name.trim()) { setErrs({ name: 'Enter a name' }); return; }
    setBusy(true);
    try {
      const common = {
        name: f.name, phone: f.phone, email: f.email, type_id: Number(f.type_id), purpose_id: Number(f.purpose_id),
        source_id: Number(f.source_id), city_id: f.city_id ? Number(f.city_id) : null, details: f.details,
      };
      if (edit) {
        await api(`/api/leads/${edit.id}`, { method: 'PATCH', body: { ...common, received_on: f.received_on } });
        toast('Details saved');
      } else {
        const body: Record<string, unknown> = { ...common, received_on: f.received_on, remarks: f.remarks };
        if (f.assigned !== 'auto') body.assigned_to = Number(f.assigned);
        if (allowDuplicate) body.allow_duplicate = true;
        const r = await api('/api/leads', { method: 'POST', body });
        toast((r.kind === 'complaint' ? 'Complaint' : 'Enquiry') + ' saved');
      }
      onSaved();
    } catch (e) {
      const x = e as ApiFail;
      if (x.status === 409 && x.data?.duplicate) setDup({ ...x.data.duplicate, message: x.message });
      else { setErrs(x.fields || {}); toast(x.message); }
    } finally { setBusy(false); }
  };

  const title = edit ? 'Edit details' : complaintFirst ? 'Log complaint' : 'Add enquiry';
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn sec" onClick={onClose}>Cancel</button>
        {dup ? <button className="btn" disabled={busy} onClick={() => save(true)}>Save anyway</button>
          : <button className="btn" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>}
      </>
    }>
      {dup && (
        <div className="note warnnote full" role="alert">
          <b>Possible duplicate.</b> {dup.message}.{' '}
          <button className="lnk" onClick={() => { onClose(); openLead(dup.id); }}>Open it</button> or save this one anyway.
        </div>
      )}
      <Field label="Name" htmlFor="a_n" error={errs.name}>
        <input id="a_n" value={f.name} onChange={set('name')} placeholder="Person or business" maxLength={120} autoFocus />
      </Field>
      <Field label="Phone" htmlFor="a_p" error={errs.phone}>
        <input id="a_p" value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="98xxx xxxxx" maxLength={20} />
      </Field>
      <Field label="Lead type" htmlFor="a_t" error={errs.type_id}>
        <select id="a_t" value={f.type_id} onChange={set('type_id')}><Opts list={o.types} /></select>
      </Field>
      <Field label="Purpose" htmlFor="a_pu" error={errs.purpose_id}>
        <select id="a_pu" value={f.purpose_id} onChange={set('purpose_id')}><Opts list={o.purposes} /></select>
      </Field>
      <Field label="Source" htmlFor="a_s" error={errs.source_id}>
        <select id="a_s" value={f.source_id} onChange={set('source_id')}><Opts list={o.sources} /></select>
      </Field>
      <Field label="City" htmlFor="a_l" error={errs.city_id} hint={admin ? 'Missing? Add it on Setup.' : 'Missing? Ask an admin to add it.'}>
        <select id="a_l" value={f.city_id} onChange={set('city_id')}><Opts list={o.cities} all="Not known" /></select>
      </Field>
      <Field label="Email (optional)" htmlFor="a_e" error={errs.email}>
        <input id="a_e" type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" maxLength={200} />
      </Field>
      <Field label="Enquiry received" htmlFor="a_d" error={errs.received_on}>
        <input type="date" id="a_d" value={f.received_on} max={todayIST()} onChange={set('received_on')} />
      </Field>
      {!edit && (
        <Field label="Assigned to" htmlFor="a_a" full error={errs.assigned_to} hint={f.assigned === 'auto' ? `Routing rule sends this to the ${routedTeam} team — the person with the fewest open items.` : undefined}>
          <select id="a_a" value={f.assigned} onChange={set('assigned')}>
            <option value="auto">Auto · {routedTeam} team</option>
            {o.users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role_short}</option>)}
          </select>
        </Field>
      )}
      <Field label={isComplaint ? 'Issue' : 'Enquiry details'} htmlFor="a_r" full error={errs.details}>
        <textarea id="a_r" rows={2} value={f.details} onChange={set('details')} maxLength={2000} />
      </Field>
      {!edit && (
        <Field label="Remarks" htmlFor="a_m" full error={errs.remarks}>
          <input id="a_m" value={f.remarks} onChange={set('remarks')} placeholder="Optional" maxLength={2000} />
        </Field>
      )}
    </Modal>
  );
}
