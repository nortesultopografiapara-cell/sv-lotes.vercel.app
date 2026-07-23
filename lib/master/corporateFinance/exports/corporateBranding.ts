/** Branding institucional seguro — sem inventar CNPJ/endereço. */

import fs from 'fs';
import path from 'path';
import { MASTER_TOPOGRAFIA_LOGO_PATH } from '@/lib/master/config';

export const CORPORATE_BRAND = {
  companyName: 'SV Topografia & Projetos',
  legalName: 'SV Topografia & Projetos LTDA',
  reportFooter: 'Relatório gerado pelo Painel Master',
  logoPublicPath: MASTER_TOPOGRAFIA_LOGO_PATH,
} as const;

/** Carrega logo do filesystem (API/server). */
export function loadCorporateLogoDataUrlSync(): string | null {
  try {
    const rel = CORPORATE_BRAND.logoPublicPath.replace(/^\//, '');
    const filePath = path.join(process.cwd(), 'public', rel);
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export function formatCorporateDateBr(iso: string | null | undefined): string {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCorporateDateTimeBr(at: Date): string {
  return at.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCorporateMoneyBr(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatCorporatePeriodLabel(
  fromDate?: string | null,
  toDate?: string | null,
): string {
  if (fromDate && toDate) {
    return `${formatCorporateDateBr(fromDate)} — ${formatCorporateDateBr(toDate)}`;
  }
  if (fromDate) return `A partir de ${formatCorporateDateBr(fromDate)}`;
  if (toDate) return `Até ${formatCorporateDateBr(toDate)}`;
  return 'Todo o período';
}
