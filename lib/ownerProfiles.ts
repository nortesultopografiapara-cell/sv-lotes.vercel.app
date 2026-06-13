export const OWNER_PROFILE_TYPES = [
  'SOCIO',
  'PROPRIETARIO',
  'INVESTIDOR',
  'DONO_AREA',
] as const;

export type OwnerProfileType = (typeof OWNER_PROFILE_TYPES)[number];

export const OWNER_PROFILE_TYPE_LABELS: Record<OwnerProfileType, string> = {
  SOCIO: 'Sócio',
  PROPRIETARIO: 'Proprietário',
  INVESTIDOR: 'Investidor',
  DONO_AREA: 'Dono da área',
};

export function normalizeOwnerProfileType(value?: string | null): OwnerProfileType | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  if (normalized === 'SOCIO' || normalized === 'SOCIOS') return 'SOCIO';
  if (normalized === 'PROPRIETARIO' || normalized === 'PROPRIETARIOS') return 'PROPRIETARIO';
  if (normalized === 'INVESTIDOR' || normalized === 'INVESTIDORES') return 'INVESTIDOR';
  if (normalized === 'DONO_AREA' || normalized === 'DONO_DA_AREA' || normalized === 'DONO')
    return 'DONO_AREA';

  if ((OWNER_PROFILE_TYPES as readonly string[]).includes(normalized)) {
    return normalized as OwnerProfileType;
  }
  return null;
}

export function formatOwnerProfileType(value?: string | null): string {
  const normalized = normalizeOwnerProfileType(value);
  if (!normalized) return '—';
  return OWNER_PROFILE_TYPE_LABELS[normalized];
}

export function isValidOwnerProfileType(value?: string | null): boolean {
  return normalizeOwnerProfileType(value) !== null;
}

export function normalizeOwnerStatus(value?: string | null): 'ACTIVE' | 'INACTIVE' {
  return String(value || 'ACTIVE').trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

export function formatOwnerStatus(value?: string | null): string {
  return normalizeOwnerStatus(value) === 'INACTIVE' ? 'Inativo' : 'Ativo';
}

export function isOwnerAccountActive(status?: string | null): boolean {
  return normalizeOwnerStatus(status) === 'ACTIVE';
}
