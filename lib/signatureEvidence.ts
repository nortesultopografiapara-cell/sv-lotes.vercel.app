/**
 * Captura e normalização de evidências eletrônicas de assinatura.
 */

import { randomUUID } from 'node:crypto';
import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';

export type SignedDocumentType =
  | 'CONTRATO_SAAS'
  | 'CONTRATO_VENDA'
  | 'TERMO'
  | 'OUTRO';

export type ParsedUserAgent = {
  browser: string;
  os: string;
  device: string;
  userAgent: string;
};

export type IpGeoApprox = {
  city: string;
  region: string;
  country: string;
};

const NOT_IDENTIFIED = 'Não identificado';
const NOT_INFORMED = 'Não informado';

export function parseUserAgent(userAgent?: string | null): ParsedUserAgent {
  const raw = String(userAgent || '').trim();
  if (!raw) {
    return {
      browser: NOT_INFORMED,
      os: NOT_INFORMED,
      device: NOT_INFORMED,
      userAgent: '',
    };
  }

  let browser = NOT_IDENTIFIED;
  if (/Edg\//i.test(raw)) browser = 'Microsoft Edge';
  else if (/OPR\//i.test(raw) || /Opera/i.test(raw)) browser = 'Opera';
  else if (/Firefox\//i.test(raw)) browser = 'Mozilla Firefox';
  else if (/Chrome\//i.test(raw)) browser = 'Google Chrome';
  else if (/Safari\//i.test(raw)) browser = 'Apple Safari';

  let os = NOT_IDENTIFIED;
  if (/Windows NT/i.test(raw)) os = 'Windows';
  else if (/Android/i.test(raw)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(raw)) os = 'iOS';
  else if (/Mac OS X/i.test(raw)) os = 'macOS';
  else if (/Linux/i.test(raw)) os = 'Linux';

  let device = 'Desktop';
  if (/iPad|Tablet/i.test(raw)) device = 'Tablet';
  else if (/Mobile|Android|iPhone/i.test(raw)) device = 'Mobile';

  return { browser, os, device, userAgent: raw };
}

function isPrivateOrLocalIp(ip: string): boolean {
  const value = ip.trim();
  if (!value || value === '127.0.0.1' || value === '::1') return true;
  if (value.startsWith('10.') || value.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  return false;
}

export async function resolveIpGeoApprox(
  ipAddress?: string | null,
  timeoutMs = 2000,
): Promise<IpGeoApprox> {
  const ip = String(ipAddress || '').trim();
  if (!ip || isPrivateOrLocalIp(ip)) {
    return { city: NOT_IDENTIFIED, region: NOT_IDENTIFIED, country: NOT_IDENTIFIED };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: controller.signal, cache: 'no-store' },
    );
    clearTimeout(timer);
    if (!res.ok) {
      return { city: NOT_IDENTIFIED, region: NOT_IDENTIFIED, country: NOT_IDENTIFIED };
    }
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      regionName?: string;
      country?: string;
    };
    if (data.status !== 'success') {
      return { city: NOT_IDENTIFIED, region: NOT_IDENTIFIED, country: NOT_IDENTIFIED };
    }
    return {
      city: String(data.city || '').trim() || NOT_IDENTIFIED,
      region: String(data.regionName || '').trim() || NOT_IDENTIFIED,
      country: String(data.country || '').trim() || NOT_IDENTIFIED,
    };
  } catch {
    return { city: NOT_IDENTIFIED, region: NOT_IDENTIFIED, country: NOT_IDENTIFIED };
  }
}

export function formatApproxLocation(geo: IpGeoApprox): string {
  const parts = [geo.city, geo.region, geo.country].filter(
    (p) => p && p !== NOT_IDENTIFIED,
  );
  if (!parts.length) return NOT_IDENTIFIED;
  return parts.join(', ');
}

export function formatSignedAtIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
}

export type BuildClientEvidenceInput = {
  signerEmail?: string | null;
  signerPhone?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  signedAt: string;
  documentType: SignedDocumentType;
  validationToken: string;
  geo?: IpGeoApprox | null;
  signatureEventId?: string;
};

export function buildClientEvidencePatch(input: BuildClientEvidenceInput): Record<string, unknown> {
  const ua = parseUserAgent(input.userAgent);
  const geo = input.geo || {
    city: NOT_IDENTIFIED,
    region: NOT_IDENTIFIED,
    country: NOT_IDENTIFIED,
  };
  const signedAtIso = formatSignedAtIso(input.signedAt);
  const validationUrl = buildSignatureVerifyUrl(input.validationToken);

  return {
    signer_email: String(input.signerEmail || '').trim() || null,
    signer_phone: String(input.signerPhone || '').trim() || null,
    signer_browser: ua.browser,
    signer_os: ua.os,
    signer_device: ua.device,
    signer_ip_city: geo.city,
    signer_ip_region: geo.region,
    signer_ip_country: geo.country,
    signed_at_iso: signedAtIso,
    signature_event_id: input.signatureEventId || randomUUID(),
    signed_document_type: input.documentType,
    validation_public_url: validationUrl,
    certificate_status: 'VALIDADO',
  };
}

export type BuildProviderEvidenceInput = {
  providerEmail?: string | null;
  providerPhone?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  signedAt: string;
  geo?: IpGeoApprox | null;
  signatureEventId?: string;
};

export function buildProviderEvidencePatch(
  input: BuildProviderEvidenceInput,
): Record<string, unknown> {
  const ua = parseUserAgent(input.userAgent);
  const geo = input.geo || {
    city: NOT_IDENTIFIED,
    region: NOT_IDENTIFIED,
    country: NOT_IDENTIFIED,
  };

  return {
    provider_signer_phone: String(input.providerPhone || '').trim() || null,
    provider_browser: ua.browser,
    provider_os: ua.os,
    provider_device: ua.device,
    provider_ip_city: geo.city,
    provider_ip_region: geo.region,
    provider_ip_country: geo.country,
    provider_signed_at_iso: formatSignedAtIso(input.signedAt),
    provider_signature_event_id: input.signatureEventId || randomUUID(),
  };
}

export type SignatureEvidenceDisplay = {
  email: string;
  phone: string;
  ipAddress: string;
  signedAt: string;
  browser: string;
  os: string;
  device: string;
  location: string;
  signatureEventId: string;
};

export function readClientEvidenceFromRow(
  row: Record<string, unknown>,
): SignatureEvidenceDisplay {
  const geo = {
    city: String(row.signer_ip_city || NOT_IDENTIFIED),
    region: String(row.signer_ip_region || NOT_IDENTIFIED),
    country: String(row.signer_ip_country || NOT_IDENTIFIED),
  };

  return {
    email: String(row.signer_email || NOT_INFORMED),
    phone: String(row.signer_phone || NOT_INFORMED),
    ipAddress: String(row.ip_address || NOT_INFORMED),
    signedAt: String(row.signed_at_iso || row.signed_at || NOT_INFORMED),
    browser: String(row.signer_browser || NOT_INFORMED),
    os: String(row.signer_os || NOT_INFORMED),
    device: String(row.signer_device || NOT_INFORMED),
    location: formatApproxLocation(geo),
    signatureEventId: String(row.signature_event_id || NOT_INFORMED),
  };
}

export function readProviderEvidenceFromRow(
  row: Record<string, unknown>,
): SignatureEvidenceDisplay {
  const geo = {
    city: String(row.provider_ip_city || NOT_IDENTIFIED),
    region: String(row.provider_ip_region || NOT_IDENTIFIED),
    country: String(row.provider_ip_country || NOT_IDENTIFIED),
  };

  return {
    email: String(row.provider_signer_email || NOT_INFORMED),
    phone: String(row.provider_signer_phone || NOT_INFORMED),
    ipAddress: String(row.provider_ip_address || NOT_INFORMED),
    signedAt: String(row.provider_signed_at_iso || row.provider_signed_at || NOT_INFORMED),
    browser: String(row.provider_browser || NOT_INFORMED),
    os: String(row.provider_os || NOT_INFORMED),
    device: String(row.provider_device || NOT_INFORMED),
    location: formatApproxLocation(geo),
    signatureEventId: String(row.provider_signature_event_id || NOT_INFORMED),
  };
}

export async function enrichClientEvidenceForSign(
  input: Omit<BuildClientEvidenceInput, 'geo' | 'signatureEventId'>,
): Promise<Record<string, unknown>> {
  const geo = await resolveIpGeoApprox(input.ipAddress);
  return buildClientEvidencePatch({ ...input, geo, signatureEventId: randomUUID() });
}

export async function enrichProviderEvidenceForSign(
  input: Omit<BuildProviderEvidenceInput, 'geo' | 'signatureEventId'>,
): Promise<Record<string, unknown>> {
  const geo = await resolveIpGeoApprox(input.ipAddress);
  return buildProviderEvidencePatch({ ...input, geo, signatureEventId: randomUUID() });
}

export type BuildVendorEvidenceInput = {
  vendorEmail?: string | null;
  vendorPhone?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  signedAt: string;
  geo?: IpGeoApprox | null;
  signatureEventId?: string;
};

export function buildVendorEvidencePatch(
  input: BuildVendorEvidenceInput,
): Record<string, unknown> {
  const ua = parseUserAgent(input.userAgent);
  const geo = input.geo || {
    city: NOT_IDENTIFIED,
    region: NOT_IDENTIFIED,
    country: NOT_IDENTIFIED,
  };

  return {
    vendor_signer_email: String(input.vendorEmail || '').trim() || null,
    vendor_phone: String(input.vendorPhone || '').trim() || null,
    vendor_browser: ua.browser,
    vendor_os: ua.os,
    vendor_device: ua.device,
    vendor_ip_city: geo.city,
    vendor_ip_region: geo.region,
    vendor_ip_country: geo.country,
    vendor_signed_at_iso: formatSignedAtIso(input.signedAt),
    vendor_signature_event_id: input.signatureEventId || randomUUID(),
  };
}

export async function enrichVendorEvidenceForSign(
  input: Omit<BuildVendorEvidenceInput, 'geo' | 'signatureEventId'>,
): Promise<Record<string, unknown>> {
  const geo = await resolveIpGeoApprox(input.ipAddress);
  return buildVendorEvidencePatch({ ...input, geo, signatureEventId: randomUUID() });
}

export function readVendorEvidenceFromRow(
  row: Record<string, unknown>,
): SignatureEvidenceDisplay {
  const geo = {
    city: String(row.vendor_ip_city || NOT_IDENTIFIED),
    region: String(row.vendor_ip_region || NOT_IDENTIFIED),
    country: String(row.vendor_ip_country || NOT_IDENTIFIED),
  };

  return {
    email: String(row.vendor_signer_email || NOT_INFORMED),
    phone: String(row.vendor_phone || NOT_INFORMED),
    ipAddress: String(row.vendor_ip_address || NOT_INFORMED),
    signedAt: String(row.vendor_signed_at_iso || row.vendor_signed_at || NOT_INFORMED),
    browser: String(row.vendor_browser || NOT_INFORMED),
    os: String(row.vendor_os || NOT_INFORMED),
    device: String(row.vendor_device || NOT_INFORMED),
    location: formatApproxLocation(geo),
    signatureEventId: String(row.vendor_signature_event_id || NOT_INFORMED),
  };
}

export function documentTypeLabel(type?: string | null): string {
  switch (String(type || '').toUpperCase()) {
    case 'CONTRATO_SAAS':
      return 'Contrato SaaS';
    case 'CONTRATO_VENDA':
      return 'Contrato de Venda de Lote';
    case 'TERMO':
      return 'Termo de Desistência, Rescisão Contratual e Acerto Financeiro';
    case 'OUTRO':
      return 'Outro documento';
    default:
      return 'Documento';
  }
}
