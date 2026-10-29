// Business dates are calendar days in India (YYYY-MM-DD).
export const TZ = 'Asia/Kolkata';
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const shiftDay = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
