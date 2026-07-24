/**
 * Carimba assinaturas eletrônicas nos slots do HTML por papel.
 * Busca APENAS dentro de `.signature-slot` — evita falso positivo em cláusulas
 * que repetem "VENDEDOR(A)" / "COMPRADOR(A)" no corpo do contrato.
 */

import {
  CONTRACT_PARTY_SLOT_MARKERS,
  resolveContractPartySignature,
  type ContractPartySignatureDisplayRole,
  type ContractPartySignatureRecord,
  type ResolvedContractPartySignature,
} from '@/lib/saleContractPartySignatureStatus';

export type ElectronicSlotStamp = {
  /** Marcador principal (compat). */
  roleMarker: string;
  /** Alternativas por modelo (Meneses / SV2 / Recanto). */
  roleMarkers?: string[];
  signerName: string;
  signedAt?: string | null;
  signed: boolean;
  role?: ContractPartySignatureDisplayRole;
};

function formatStampDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const time = d.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${date} ${time}`;
  } catch {
    return '';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findDivEnd(html: string, divStart: number): number {
  let depth = 1;
  let pos = divStart + 4;
  while (pos < html.length) {
    const openAt = html.indexOf('<div', pos);
    const closeAt = html.indexOf('</div>', pos);
    if (closeAt === -1) return -1;
    if (openAt !== -1 && openAt < closeAt) {
      depth += 1;
      pos = openAt + 4;
      continue;
    }
    pos = closeAt + 6;
    depth -= 1;
    if (depth === 0) return pos;
  }
  return -1;
}

type SignatureSlotRange = {
  divStart: number;
  divEnd: number;
  html: string;
};

/** Extrai todos os blocos `.signature-slot` do HTML. */
export function findContractSignatureSlots(html: string): SignatureSlotRange[] {
  const slots: SignatureSlotRange[] = [];
  const needle = 'class="signature-slot"';
  let from = 0;
  while (from < html.length) {
    const classIdx = html.indexOf(needle, from);
    if (classIdx < 0) break;
    const divStart = html.lastIndexOf('<div', classIdx);
    if (divStart < 0) {
      from = classIdx + needle.length;
      continue;
    }
    const divEnd = findDivEnd(html, divStart);
    if (divEnd < 0) break;
    slots.push({
      divStart,
      divEnd,
      html: html.slice(divStart, divEnd),
    });
    from = divEnd;
  }
  return slots;
}

function markersForStamp(stamp: ElectronicSlotStamp): string[] {
  const list = [
    ...(stamp.roleMarkers || []),
    stamp.roleMarker,
    ...(stamp.role ? CONTRACT_PARTY_SLOT_MARKERS[stamp.role] || [] : []),
  ]
    .map((m) => String(m || '').trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function displayRoleToDataPartyRole(
  role?: ContractPartySignatureDisplayRole,
): 'VENDOR' | 'BUYER' | 'SPOUSE' | null {
  if (role === 'SELLER' || role === 'COMPANY_REPRESENTATIVE') return 'VENDOR';
  if (role === 'BUYER') return 'BUYER';
  if (role === 'SPOUSE') return 'SPOUSE';
  return null;
}

function slotMatchesDataPartyRole(
  slotHtml: string,
  partyRole: string,
): boolean {
  const re = new RegExp(
    `data-party-role\\s*=\\s*["']${partyRole}["']`,
    'i',
  );
  return re.test(slotHtml);
}

function slotMatchesRoleMarker(slotHtml: string, marker: string): boolean {
  if (!marker || !slotHtml.includes(marker)) return false;
  return true;
}

function injectStampIntoSlotHtml(
  slotHtml: string,
  stamp: ElectronicSlotStamp,
): string {
  const when = formatStampDate(stamp.signedAt);
  const stampHtml = `
        <p class="sv-esign-stamp" style="margin: 0 0 6px 0; font-size: 9pt; color: #166534; font-weight: 700;">
          Assinado eletronicamente
          ${stamp.signerName ? `<br/>${escapeHtml(stamp.signerName)}` : ''}
          ${when ? `<br/>${escapeHtml(when)}` : ''}
        </p>`;

  const lineIdx = slotHtml.indexOf('border-top: 1px solid');
  if (lineIdx >= 0) {
    const insertAt = slotHtml.lastIndexOf('<div', lineIdx);
    if (insertAt >= 0) {
      return slotHtml.slice(0, insertAt) + stampHtml + slotHtml.slice(insertAt);
    }
  }
  return stampHtml + slotHtml;
}

/**
 * Injeta carimbo eletrônico no slot.
 * Preferência: data-party-role; fallback: marcadores de texto só dentro de .signature-slot.
 */
export function stampContractSignatureSlotByRole(
  html: string,
  stamp: ElectronicSlotStamp,
): string {
  if (!stamp.signed || (!stamp.roleMarker && !stamp.role)) return html;

  const slots = findContractSignatureSlots(html);
  const dataRole = displayRoleToDataPartyRole(stamp.role);
  const markers = markersForStamp(stamp);

  let target = dataRole
    ? slots.find(
        (slot) =>
          !slot.html.includes('sv-esign-stamp') &&
          slotMatchesDataPartyRole(slot.html, dataRole),
      )
    : undefined;

  if (!target) {
    target = slots.find((slot) => {
      if (slot.html.includes('sv-esign-stamp')) return false;
      return markers.some((m) => slotMatchesRoleMarker(slot.html, m));
    });
  }

  if (!target) return html;

  const stampedSlot = injectStampIntoSlotHtml(target.html, stamp);
  return html.slice(0, target.divStart) + stampedSlot + html.slice(target.divEnd);
}

export function applyElectronicSignatureStampsToContractHtml(
  html: string,
  stamps: ElectronicSlotStamp[],
): string {
  let result = html;
  for (const stamp of stamps) {
    result = stampContractSignatureSlotByRole(result, stamp);
  }
  return result;
}

function stampFromResolved(
  resolved: ResolvedContractPartySignature,
  markers: string[],
): ElectronicSlotStamp {
  const primary = markers[0] || '';
  return {
    role: resolved.role,
    roleMarker: primary,
    roleMarkers: markers,
    signerName: String(resolved.signerName || '').trim(),
    signedAt: resolved.signedAt,
    signed: Boolean(resolved.signed && (resolved.signerName || resolved.signedAt)),
  };
}

export function buildRecantoElectronicStamps(input: {
  buyerName?: string | null;
  buyerSignedAt?: string | null;
  buyerSigned?: boolean;
  spouseName?: string | null;
  spouseSignedAt?: string | null;
  spouseSigned?: boolean;
  vendorName?: string | null;
  vendorSignedAt?: string | null;
  vendorSigned?: boolean;
}): ElectronicSlotStamp[] {
  return [
    {
      role: 'SELLER',
      roleMarker: 'VENDEDOR(A)',
      roleMarkers: CONTRACT_PARTY_SLOT_MARKERS.SELLER,
      signerName: String(input.vendorName || '').trim(),
      signedAt: input.vendorSignedAt,
      signed: Boolean(input.vendorSigned && input.vendorName),
    },
    {
      role: 'BUYER',
      roleMarker: 'COMPRADOR(A)',
      roleMarkers: CONTRACT_PARTY_SLOT_MARKERS.BUYER,
      signerName: String(input.buyerName || '').trim(),
      signedAt: input.buyerSignedAt,
      signed: Boolean(input.buyerSigned && input.buyerName),
    },
    {
      role: 'SPOUSE',
      roleMarker: 'CÔNJUGE ANUENTE',
      roleMarkers: CONTRACT_PARTY_SLOT_MARKERS.SPOUSE,
      signerName: String(input.spouseName || '').trim(),
      signedAt: input.spouseSignedAt,
      signed: Boolean(input.spouseSigned && input.spouseName),
    },
  ];
}

/**
 * Constrói carimbos a partir das parties (fonte preferencial) + legado do processo.
 * Mesmo CPF em VENDOR e BUYER → dois selos independentes.
 */
export function buildElectronicStampsFromSignatureParties(input: {
  parties: ContractPartySignatureRecord[];
  buyerNameFallback?: string | null;
  vendorNameFallback?: string | null;
  legacyBuyerSignedAt?: string | null;
  legacyVendorSignedAt?: string | null;
  legacyVendorSigned?: boolean;
  legacyBuyerSigned?: boolean;
}): ElectronicSlotStamp[] {
  const parties = input.parties || [];

  const seller = resolveContractPartySignature({
    role: 'SELLER',
    signatures: parties,
    legacyFallback: {
      signed:
        input.legacyVendorSigned ?? Boolean(input.legacyVendorSignedAt),
      signerName: input.vendorNameFallback,
      signedAt: input.legacyVendorSignedAt,
    },
  });

  const buyer = resolveContractPartySignature({
    role: 'BUYER',
    signatures: parties,
    legacyFallback: {
      signed: input.legacyBuyerSigned ?? Boolean(input.legacyBuyerSignedAt),
      signerName: input.buyerNameFallback,
      signedAt: input.legacyBuyerSignedAt,
    },
  });

  const spouse = resolveContractPartySignature({
    role: 'SPOUSE',
    signatures: parties,
  });

  if (!seller.signerName && input.vendorNameFallback) {
    seller.signerName = String(input.vendorNameFallback).trim() || undefined;
  }
  if (!buyer.signerName && input.buyerNameFallback) {
    buyer.signerName = String(input.buyerNameFallback).trim() || undefined;
  }

  return [
    stampFromResolved(seller, CONTRACT_PARTY_SLOT_MARKERS.SELLER),
    stampFromResolved(buyer, CONTRACT_PARTY_SLOT_MARKERS.BUYER),
    stampFromResolved(spouse, CONTRACT_PARTY_SLOT_MARKERS.SPOUSE),
  ];
}
