/**
 * PDF ELECTRONIC_SIGNED MUNDO_NOVO — certificado compacto na mesma página 7.
 * Não altera ARAGUAIA nem PHYSICAL_UNSIGNED.
 *
 * A logo do headerTemplate NÃO vem de companies.logo_url (R R = Araguaia).
 * O Chromium recebe data URI lido deste asset exclusivo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildSaleContractPdfFromHtml } from '@/lib/saleContractPdf';
import { MUNDO_NOVO_ELECTRONIC_LOGO_PUBLIC_FILE } from '@/lib/mundoNovoContractPdf';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';

export function loadMundoNovoElectronicLogoDataUrl(): string | null {
  try {
    const filePath = path.join(
      process.cwd(),
      'public',
      MUNDO_NOVO_ELECTRONIC_LOGO_PUBLIC_FILE,
    );
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const mime =
      buf[0] === 0x89 && buf[1] === 0x50
        ? 'image/png'
        : buf[0] === 0xff && buf[1] === 0xd8
          ? 'image/jpeg'
          : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function buildMundoNovoElectronicSignedPdfFromHtml(
  html: string,
  chrome: ContractPdfChromeInput,
): Promise<Uint8Array> {
  const logoBase64 = loadMundoNovoElectronicLogoDataUrl();
  return buildSaleContractPdfFromHtml(html, {
    ...chrome,
    headerVariant: 'mundo-novo-electronic',
    logoBase64,
  });
}
