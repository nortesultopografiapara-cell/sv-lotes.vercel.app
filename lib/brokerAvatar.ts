/**
 * Foto do corretor — helpers puros (sem migration).
 * Bucket: company-assets, path {tenantId}/brokers/{brokerId}/avatar-{ts}.{ext}
 * Persiste URL pública em brokers.avatar_url (nunca base64).
 */

export const BROKER_AVATAR_BUCKET = 'company-assets';
export const BROKER_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const BROKER_AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type BrokerAvatarFileLike = {
  name?: string;
  type?: string;
  size?: number;
};

export type BrokerAvatarValidation =
  | { ok: true; ext: string; mime: string }
  | { ok: false; error: string };

export function brokerInitial(name?: string | null): string {
  const ch = String(name || '').trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

export function brokerAvatarFolder(tenantId: string, brokerId: string): string {
  const tenant = String(tenantId || '').trim();
  const broker = String(brokerId || '').trim();
  if (!tenant || !broker) {
    throw new Error('tenantId e brokerId são obrigatórios para o avatar.');
  }
  if (tenant.includes('/') || broker.includes('/')) {
    throw new Error('Identificadores de avatar inválidos.');
  }
  return `${tenant}/brokers/${broker}`;
}

export function buildBrokerAvatarObjectPath(
  tenantId: string,
  brokerId: string,
  ext: string,
  now: number = Date.now(),
): string {
  const safeExt = String(ext || 'jpg').replace(/^\./, '').toLowerCase();
  if (!EXT_TO_MIME[safeExt] && safeExt !== 'jpeg') {
    throw new Error('Extensão de avatar não permitida.');
  }
  const normalized = safeExt === 'jpeg' ? 'jpg' : safeExt;
  return `${brokerAvatarFolder(tenantId, brokerId)}/avatar-${now}.${normalized}`;
}

export function extensionFromFileName(name?: string | null): string | null {
  const raw = String(name || '').trim().toLowerCase();
  const m = raw.match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  if (m[1] === 'jpeg') return 'jpg';
  return EXT_TO_MIME[m[1]] ? m[1] : null;
}

export function validateBrokerAvatarFile(file: BrokerAvatarFileLike): BrokerAvatarValidation {
  const size = Number(file.size) || 0;
  if (size <= 0) {
    return { ok: false, error: 'Selecione um arquivo de imagem.' };
  }
  if (size > BROKER_AVATAR_MAX_BYTES) {
    return { ok: false, error: 'A foto deve ter no máximo 2 MB.' };
  }
  const mimeRaw = String(file.type || '').trim().toLowerCase();
  let ext = BROKER_AVATAR_MIME_TO_EXT[mimeRaw] || null;
  if (!ext) {
    ext = extensionFromFileName(file.name);
  }
  if (!ext) {
    return { ok: false, error: 'Use somente JPG, PNG ou WebP.' };
  }
  const mime = ext === 'jpg' ? 'image/jpeg' : EXT_TO_MIME[ext];
  return { ok: true, ext, mime };
}

export function extractCompanyAssetsObjectPath(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    return s.replace(/^\/+/, '').split('?')[0];
  }
  const m = s.match(
    /\/storage\/v1\/object\/(?:public|sign)\/company-assets\/(.+?)(?:\?|$)/i,
  );
  if (m) return decodeURIComponent(m[1]);
  return null;
}

export function pathBelongsToBrokerAvatar(
  path: string,
  tenantId: string,
  brokerId: string,
): boolean {
  const expected = `${brokerAvatarFolder(tenantId, brokerId)}/`;
  const p = String(path || '').replace(/^\/+/, '');
  return p.startsWith(expected) && /\/avatar[-.]/i.test(p);
}

export function withAvatarCacheBust(url: string, version: number | string): string {
  const base = String(url || '').split('?')[0];
  if (!base) return '';
  return `${base}?v=${encodeURIComponent(String(version))}`;
}

export function isBrokerAvatarObjectName(name: string): boolean {
  return /^avatar[-.]/i.test(String(name || '').trim());
}
