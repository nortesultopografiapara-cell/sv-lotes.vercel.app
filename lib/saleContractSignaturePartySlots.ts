/**
 * Carimba assinaturas eletrônicas nos slots do HTML por papel (Recanto).
 * Evita repetir a assinatura do comprador no campo do cônjuge.
 */

export type ElectronicSlotStamp = {
  roleMarker: string;
  signerName: string;
  signedAt?: string | null;
  signed: boolean;
};

function formatStampDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
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

/**
 * Injeta carimbo eletrônico no slot cujo texto de papel contém roleMarker.
 * Cada papel é tratado isoladamente.
 */
export function stampContractSignatureSlotByRole(
  html: string,
  stamp: ElectronicSlotStamp,
): string {
  if (!stamp.signed || !stamp.roleMarker) return html;

  const marker = stamp.roleMarker;
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) return html;

  const slotStart = html.lastIndexOf('class="signature-slot"', markerIdx);
  if (slotStart < 0) return html;

  const divStart = html.lastIndexOf('<div', slotStart);
  if (divStart < 0) return html;

  let depth = 1;
  let pos = divStart + 4;
  let divEnd = -1;

  while (pos < html.length) {
    const openAt = html.indexOf('<div', pos);
    const closeAt = html.indexOf('</div>', pos);
    if (closeAt === -1) break;
    if (openAt !== -1 && openAt < closeAt) {
      depth += 1;
      pos = openAt + 4;
      continue;
    }
    pos = closeAt + 6;
    depth -= 1;
    if (depth === 0) {
      divEnd = pos;
      break;
    }
  }

  if (divEnd < 0) return html;

  const slotHtml = html.slice(divStart, divEnd);
  if (slotHtml.includes('sv-esign-stamp')) {
    return html;
  }

  const when = formatStampDate(stamp.signedAt);
  const stampHtml = `
        <p class="sv-esign-stamp" style="margin: 0 0 6px 0; font-size: 9pt; color: #166534; font-weight: 700;">
          Assinado eletronicamente
          ${stamp.signerName ? `<br/>${escapeHtml(stamp.signerName)}` : ''}
          ${when ? `<br/>${escapeHtml(when)}` : ''}
        </p>`;

  const lineIdx = slotHtml.indexOf('border-top: 1px solid');
  let stampedSlot = slotHtml;
  if (lineIdx >= 0) {
    const insertAt = slotHtml.lastIndexOf('<div', lineIdx);
    if (insertAt >= 0) {
      stampedSlot = slotHtml.slice(0, insertAt) + stampHtml + slotHtml.slice(insertAt);
    } else {
      stampedSlot = stampHtml + slotHtml;
    }
  } else {
    stampedSlot = stampHtml + slotHtml;
  }

  return html.slice(0, divStart) + stampedSlot + html.slice(divEnd);
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
      roleMarker: 'VENDEDOR(A)',
      signerName: String(input.vendorName || '').trim(),
      signedAt: input.vendorSignedAt,
      signed: Boolean(input.vendorSigned && input.vendorName),
    },
    {
      roleMarker: 'COMPRADOR(A)',
      signerName: String(input.buyerName || '').trim(),
      signedAt: input.buyerSignedAt,
      signed: Boolean(input.buyerSigned && input.buyerName),
    },
    {
      roleMarker: 'CÔNJUGE ANUENTE',
      signerName: String(input.spouseName || '').trim(),
      signedAt: input.spouseSignedAt,
      signed: Boolean(input.spouseSigned && input.spouseName),
    },
  ];
}
