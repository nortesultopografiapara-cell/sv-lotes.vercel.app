/** Helpers de formatação pt-BR — Financeiro Corporativo Master. */

export function formatCurrency(val: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(val) || 0,
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeLiveNet(params: {
  original: string | number;
  discount: string | number;
  interest: string | number;
  fine: string | number;
}): number {
  const original = Number(params.original) || 0;
  const discount = Number(params.discount) || 0;
  const interest = Number(params.interest) || 0;
  const fine = Number(params.fine) || 0;
  return Math.round((original - discount + interest + fine + Number.EPSILON) * 100) / 100;
}
