// Page access by role — the single map used by the server (route guards) and the UI (navigation).
export type RoleId = 'admin' | 'cs' | 'dist' | 'ret' | 'hr';
export const ROLE_IDS: RoleId[] = ['admin', 'cs', 'dist', 'ret', 'hr'];

export type PageKey = 'home' | 'leads' | 'comp' | 'rem' | 'set' | 'users' | 'prof';

export const PAGES: { key: PageKey; path: string; label: string; icon: string; group: 'Work' | 'Admin' | null; roles: RoleId[] }[] = [
  { key: 'home', path: '/', label: 'Overview', icon: 'home', group: 'Work', roles: ROLE_IDS },
  { key: 'leads', path: '/leads', label: 'Leads', icon: 'leads', group: 'Work', roles: ROLE_IDS },
  { key: 'comp', path: '/complaints', label: 'Complaints', icon: 'comp', group: 'Work', roles: ROLE_IDS },
  { key: 'rem', path: '/reminders', label: 'Reminders', icon: 'cal', group: 'Work', roles: ROLE_IDS },
  { key: 'set', path: '/setup', label: 'Setup', icon: 'set', group: 'Admin', roles: ['admin'] },
  { key: 'users', path: '/users', label: 'Users & roles', icon: 'users', group: 'Admin', roles: ['admin'] },
  { key: 'prof', path: '/profile', label: 'Profile & settings', icon: 'users', group: null, roles: ROLE_IDS },
];

export const canOpen = (role: string, key: PageKey) => !!PAGES.find(p => p.key === key)?.roles.includes(role as RoleId);
export const isAdmin = (role: string) => role === 'admin';

export const STAGES = ['Open', 'In Progress', 'Closed', 'Rejected', 'Converted'] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ['Open', 'In Progress'];
export const DONE_STAGES: Stage[] = ['Closed', 'Rejected', 'Converted'];
// Complaints are resolved, never "converted".
export const stagesFor = (kind: 'lead' | 'complaint'): Stage[] => (kind === 'complaint' ? STAGES.filter(s => s !== 'Converted') : [...STAGES]);
