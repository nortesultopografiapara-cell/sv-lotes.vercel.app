import { createHmac } from 'crypto';
import type { ClientPortalLinkType } from '@/lib/portal-cliente/types';

type LinkKeyInput = {
  linkType: ClientPortalLinkType;
  companyId: string;
  customerId?: string | null;
  saleId?: string | null;
};

function resolveLinkSecret(): string {
  return (
    process.env.CLIENT_PORTAL_LINK_SECRET?.trim() ||
    process.env.CLIENT_PORTAL_SESSION_SECRET?.trim() ||
    'portal-cliente-dev-link-secret'
  );
}

/** Gera chave opaca estável — não expõe UUIDs na API. */
export function buildClientPortalLinkKey(input: LinkKeyInput): string {
  const payload = [
    input.linkType,
    input.companyId,
    input.customerId ?? '',
    input.saleId ?? '',
  ].join(':');
  return createHmac('sha256', resolveLinkSecret()).update(payload).digest('hex').slice(0, 24);
}
