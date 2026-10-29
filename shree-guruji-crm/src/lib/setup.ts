import 'server-only';
import { notFound } from './http';
import { SETUP_KINDS, SetupKind } from './validate';

export const TABLE: Record<SetupKind, string> = {
  sources: 'lead_sources', types: 'lead_types', purposes: 'lead_purposes', cities: 'cities',
};

export const kindOf = (k: string) => {
  if (!(SETUP_KINDS as readonly string[]).includes(k)) throw notFound('List');
  return k as SetupKind;
};
