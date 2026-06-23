/**
 * Mascaramento de dados sensíveis na validação pública de assinatura.
 */

import { onlyDigits } from '@/lib/inputMasks';

export function maskCpfPublic(document: string | null | undefined): string {
  const digits = onlyDigits(String(document || ''));
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
  }
  if (!digits) return '—';
  return '***';
}

export function maskEmailPublic(email: string | null | undefined): string {
  const value = String(email || '').trim();
  if (!value || !value.includes('@')) return '—';
  const [local, domain] = value.split('@');
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

export function maskIpPublic(ip: string | null | undefined): string {
  const value = String(ip || '').trim();
  if (!value) return '—';
  const parts = value.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  if (value.includes(':')) {
    const head = value.split(':').slice(0, 3).join(':');
    return `${head}:****`;
  }
  return `${value.slice(0, Math.max(1, value.length - 4))}***`;
}

export function maskPhonePublic(phone: string | null | undefined): string {
  const digits = onlyDigits(String(phone || ''));
  if (digits.length >= 10) {
    const ddd = digits.length >= 11 ? digits.slice(0, 2) : digits.slice(0, 2);
    return `(${ddd}) *****-${digits.slice(-4)}`;
  }
  if (!digits) return '—';
  return '*****';
}
