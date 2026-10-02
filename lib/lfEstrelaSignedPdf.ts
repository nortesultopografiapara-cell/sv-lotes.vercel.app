/**
 * PDF assinado LF ESTRELA — overlay no PDF físico congelado.
 *
 * O instrumento aprovado (html2pdf, 10 páginas) é imutável.
 * Assinatura eletrônica NÃO reimprime HTML nem repagina.
 * Carimbos verdes entram por coordenadas nas páginas 2 e 10.
 * Certificado eletrônico é anexado somente depois da página 10.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, type PDFPage, type RGB } from 'pdf-lib';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import { sortEstrelaDoSulVendorParties } from '@/lib/estrelaDoSulContractEsign';
import { isLfEstrelaCustomHtml } from '@/lib/lfEstrelaPrintCss';
import { isPdfBytes } from '@/lib/saasContractPdfHttp';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import type { ContractSignaturePartyRow } from '@/lib/saleContractSignaturePartyTypes';
import {
  assertSaleContractBucketReady,
  buildPhysicalSaleContractStoragePath,
  getSaleContractBucket,
} from '@/lib/saleContractStorage';

export const LF_ESTRELA_SIGNED_INSTRUMENT_PAGES = 10;
export const LF_ESTRELA_STAMP_PAGE_NUMBERS = [2, 10] as const;
export const LF_ESTRELA_STAMP_GREEN: RGB = rgb(22 / 255, 101 / 255, 52 / 255);

/** A4 em pontos (origem pdf-lib: canto inferior esquerdo). */
const A4_WIDTH = 595.28;
const MARGIN_PT = (15 / 25.4) * 72;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_PT * 2;
const COL_GAP = 27;
const COL_WIDTH = (CONTENT_WIDTH - COL_GAP) / 2;
const COL_LEFT_CENTER = MARGIN_PT + COL_WIDTH / 2;
const COL_RIGHT_CENTER = MARGIN_PT + COL_WIDTH + COL_GAP + COL_WIDTH / 2;

/**
 * Y pdf-lib (origem inferior) da área livre ACIMA da linha física.
 * Página 2 = Capa Resumo. O gabarito 458/393/328 cobria COMPRADOR 1 / CPF,
 * LF IMOVEIS / CNPJ e ANTONIO / CPF; +24pt (~8,5 mm) sobe o carimbo compacto
 * para a área livre da assinatura, sem escrever por cima do nome preto.
 * Página 10 = encerramento do instrumento (texto 12.3–12.7).
 * P10 só é aplicado depois de validar pageCount === 10.
 */
export const LF_ESTRELA_STAMP_LAYOUT = {
  page2: { row1: 482, row2: 417, row3: 352 },
  page10: { row1: 248, row2: 183, row3: 118 },
} as const;

export const LF_ESTRELA_PHYSICAL_BASE_MISSING_MESSAGE =
  'Gere primeiro o PDF físico deste contrato para congelar a versão que será assinada.';

export const LF_ESTRELA_PHYSICAL_BASE_MISSING_UI_MESSAGE =
  LF_ESTRELA_PHYSICAL_BASE_MISSING_MESSAGE;

export function lfEstrelaInvalidPhysicalBaseMessage(found: number): string {
  return `Base física LF ESTRELA inválida: esperado ${LF_ESTRELA_SIGNED_INSTRUMENT_PAGES} páginas, encontrado ${found}. Gere/congele novamente o PDF físico homologado.`;
}

export function assertLfEstrelaHomologatedPageCount(pageCount: number): void {
  if (pageCount !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
    throw new Error(lfEstrelaInvalidPhysicalBaseMessage(pageCount));
  }
}

export type LfEstrelaOverlaySlot =
  | 'BUYER_1'
  | 'COMPANY'
  | 'BUYER_2'
  | 'SELLER_2'
  | 'WITNESS_1'
  | 'WITNESS_2';

export type LfEstrelaOverlayStamp = {
  slot: LfEstrelaOverlaySlot;
  lines: string[];
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function isLfEstrelaSignedPipelineHtml(html: string | null | undefined): boolean {
  return isLfEstrelaCustomHtml(html);
}

function partySigned(party?: ContractSignaturePartyRow | null): boolean {
  if (!party) return false;
  return (
    String(party.status || '').toUpperCase() === 'SIGNED' &&
    Boolean(String(party.signed_at || '').trim())
  );
}

function upperName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function winAnsiSafe(value: string): string {
  return String(value || '').replace(/[^\u0000-\u00ff]/g, '');
}

export function resolveLfEstrelaOverlayStamps(input: {
  parties: ContractSignaturePartyRow[];
  company?: Record<string, unknown> | null;
}): LfEstrelaOverlayStamp[] {
  const parties = Array.isArray(input.parties) ? input.parties : [];
  const company = input.company && typeof input.company === 'object' ? input.company : {};
  const companyName =
    String(
      company.razao_social ||
        company.legal_name ||
        company.fantasy_name ||
        company.name ||
        '',
    ).trim() || getCompanyDisplayName(company) || 'LF IMOVEIS LTDA';
  const buyer = parties.find((p) => String(p.role).toUpperCase() === 'BUYER');
  const spouse = parties.find((p) => String(p.role).toUpperCase() === 'SPOUSE');
  const vendors = sortEstrelaDoSulVendorParties(
    parties.filter((p) => String(p.role).toUpperCase() === 'VENDOR'),
    company,
  );
  const companyVendor = vendors[0];
  const seller2 = vendors[1];
  const witness1 = parties.find((p) => String(p.role).toUpperCase() === 'WITNESS_1');
  const witness2 = parties.find((p) => String(p.role).toUpperCase() === 'WITNESS_2');

  const stamps: LfEstrelaOverlayStamp[] = [];

  if (partySigned(buyer)) {
    stamps.push({
      slot: 'BUYER_1',
      lines: ['ASSINADO DIGITALMENTE', upperName(buyer?.signer_name)],
    });
  }

  if (partySigned(companyVendor)) {
    stamps.push({
      slot: 'COMPANY',
      lines: [
        'ASSINADO DIGITALMENTE',
        upperName(companyVendor?.signer_name),
        `Representante de ${companyName}`,
      ],
    });
  }

  if (partySigned(spouse)) {
    stamps.push({
      slot: 'BUYER_2',
      lines: ['ASSINADO DIGITALMENTE', upperName(spouse?.signer_name)],
    });
  }

  if (partySigned(seller2)) {
    stamps.push({
      slot: 'SELLER_2',
      lines: ['ASSINADO DIGITALMENTE', upperName(seller2?.signer_name)],
    });
  }

  if (partySigned(witness1)) {
    stamps.push({
      slot: 'WITNESS_1',
      lines: ['ASSINADO DIGITALMENTE', upperName(witness1?.signer_name)],
    });
  }

  if (partySigned(witness2)) {
    stamps.push({
      slot: 'WITNESS_2',
      lines: ['ASSINADO DIGITALMENTE', upperName(witness2?.signer_name)],
    });
  }

  return stamps.filter((s) => s.lines.some((line) => line && line !== 'ASSINADO DIGITALMENTE'));
}

function slotCenterX(slot: LfEstrelaOverlaySlot): number {
  if (slot === 'BUYER_1' || slot === 'BUYER_2' || slot === 'WITNESS_1') {
    return COL_LEFT_CENTER;
  }
  return COL_RIGHT_CENTER;
}

function slotLineY(slot: LfEstrelaOverlaySlot, pageNumber: number): number {
  const layout =
    pageNumber === 2 ? LF_ESTRELA_STAMP_LAYOUT.page2 : LF_ESTRELA_STAMP_LAYOUT.page10;
  if (slot === 'BUYER_1' || slot === 'COMPANY') return layout.row1;
  if (slot === 'BUYER_2' || slot === 'SELLER_2') return layout.row2;
  return layout.row3;
}

function drawCheckmark(page: PDFPage, x: number, y: number, color: RGB): void {
  page.drawLine({
    start: { x, y: y + 2.2 },
    end: { x: x + 3.2, y },
    thickness: 1.15,
    color,
  });
  page.drawLine({
    start: { x: x + 3.2, y },
    end: { x: x + 8.4, y: y + 7.2 },
    thickness: 1.15,
    color,
  });
}

function drawStampOnPage(
  page: PDFPage,
  stamp: LfEstrelaOverlayStamp,
  pageNumber: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>,
): void {
  const centerX = slotCenterX(stamp.slot);
  const lineY = slotLineY(stamp.slot, pageNumber);
  const color = LF_ESTRELA_STAMP_GREEN;
  const size = 6.6;
  const leading = 8.2;
  const lines = stamp.lines.map((line) => winAnsiSafe(line)).filter(Boolean);
  if (!lines.length) return;

  const blockHeight = leading * lines.length;
  let y = lineY + 4 + (blockHeight - leading);

  lines.forEach((line, index) => {
    const useBold = index === 0;
    const activeFont = useBold ? fontBold : font;
    const label = index === 0 ? line : line;
    const width = Math.min(activeFont.widthOfTextAtSize(label, size), COL_WIDTH - 12);
    const textX =
      index === 0
        ? centerX - (width + 12) / 2 + 12
        : centerX - Math.min(activeFont.widthOfTextAtSize(label, size), COL_WIDTH - 8) / 2;

    if (index === 0) {
      drawCheckmark(page, textX - 11, y, color);
    }

    page.drawText(label, {
      x: textX,
      y,
      size,
      font: activeFont,
      color,
      maxWidth: COL_WIDTH - 10,
    });
    y -= leading;
  });
}

export async function overlayLfEstrelaSignatureStamps(
  pdfDoc: PDFDocument,
  stamps: LfEstrelaOverlayStamp[],
): Promise<void> {
  if (!stamps.length) return;
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;
  assertLfEstrelaHomologatedPageCount(pageCount);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const targets = [
    { index: 1, number: 2 },
    { index: 9, number: 10 },
  ];

  for (const target of targets) {
    const page = pages[target.index];
    for (const stamp of stamps) {
      drawStampOnPage(page, stamp, target.number, font, fontBold);
    }
  }
}

export async function composeLfEstrelaSignedPdf(input: {
  physicalBytes: Uint8Array;
  stamps: LfEstrelaOverlayStamp[];
  certificatePdfBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  if (!isPdfBytes(input.physicalBytes)) {
    throw new Error('PDF físico LF ESTRELA inválido (cabeçalho %PDF ausente).');
  }

  const physical = await PDFDocument.load(input.physicalBytes);
  assertLfEstrelaHomologatedPageCount(physical.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(physical, physical.getPageIndices());
  copied.forEach((page) => out.addPage(page));

  await overlayLfEstrelaSignatureStamps(out, input.stamps);

  const certBytes = input.certificatePdfBytes;
  if (certBytes && isPdfBytes(certBytes) && certBytes.byteLength > 0) {
    const cert = await PDFDocument.load(certBytes);
    const certPages = await out.copyPages(cert, cert.getPageIndices());
    certPages.forEach((page) => out.addPage(page));
  }

  return out.save();
}

export function buildLfEstrelaPhysicalBaseDescription(input: {
  contractId: string;
  version?: number | null;
  sha256: string;
  pageCount?: number | null;
}): string {
  const pageCount = Number(input.pageCount) || LF_ESTRELA_SIGNED_INSTRUMENT_PAGES;
  return `LF_ESTRELA_PHYSICAL_BASE contract_id=${input.contractId} version=${Number(input.version) || 1} page_count=${pageCount} sha256=${input.sha256}`;
}

export function parseLfEstrelaPhysicalBaseDescription(description?: string | null): {
  contractId: string | null;
  version: number | null;
  pageCount: number | null;
  sha256: string | null;
} {
  const text = String(description || '');
  const contractId = text.match(/contract_id=([0-9a-f-]{36})/i)?.[1] || null;
  const versionRaw = text.match(/version=(\d+)/i)?.[1] || null;
  const pageCountRaw = text.match(/page_count=(\d+)/i)?.[1] || null;
  const sha256 = text.match(/sha256=([a-f0-9]{64})/i)?.[1] || null;
  return {
    contractId,
    version: versionRaw ? Number(versionRaw) : null,
    pageCount: pageCountRaw ? Number(pageCountRaw) : null,
    sha256,
  };
}

export async function loadLfEstrelaPhysicalPdfBytes(input: {
  supabaseAdmin: SupabaseClient;
  tenantId: string;
  contractNumber: string;
  contractId?: string | null;
  saleId?: string | null;
}): Promise<{
  bytes: Uint8Array;
  source: 'storage';
  sha256: string;
  pageCount: number;
  storagePath: string;
  bucket: string;
} | null> {
  const contractId = String(input.contractId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  const contractNumber = String(input.contractNumber || '').trim();
  const bucket = getSaleContractBucket();
  const storagePath = buildPhysicalSaleContractStoragePath(tenantId, contractNumber);

  const lookupTrace = (extra: Record<string, unknown>) => {
    console.info('[LF PHYSICAL BASE LOOKUP TRACE]', {
      requestedContractId: contractId || null,
      saleId: String(input.saleId || '').trim() || null,
      physicalBaseFound: false,
      bucket,
      storagePath,
      storageBytes: 0,
      pageCount: null,
      ...extra,
    });
  };

  try {
    const ready = await assertSaleContractBucketReady(input.supabaseAdmin);
    const { data, error } = await input.supabaseAdmin.storage.from(ready).download(storagePath);
    if (error || !data) {
      lookupTrace({ reason: 'not_found', error: error?.message || 'objeto ausente' });
      return null;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!bytes.byteLength) {
      lookupTrace({ physicalBaseFound: true, storageBytes: 0, reason: 'zero_bytes' });
      return null;
    }
    if (!isPdfBytes(bytes)) {
      lookupTrace({
        physicalBaseFound: true,
        storageBytes: bytes.byteLength,
        reason: 'not_pdf',
      });
      return null;
    }
    const pageCount = (await PDFDocument.load(bytes)).getPageCount();
    if (pageCount !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
      lookupTrace({
        physicalBaseFound: true,
        storageBytes: bytes.byteLength,
        pageCount,
        reason: 'invalid_page_count',
      });
      throw new Error(lfEstrelaInvalidPhysicalBaseMessage(pageCount));
    }
    const sha256 = sha256Hex(bytes);
    lookupTrace({
      physicalBaseFound: true,
      storageBytes: bytes.byteLength,
      pageCount,
      sha256,
      reason: 'ok',
    });
    return {
      bytes,
      source: 'storage',
      sha256,
      pageCount,
      storagePath,
      bucket: ready,
    };
  } catch (err) {
    if (err instanceof Error && /Base física LF ESTRELA inválida/i.test(err.message)) {
      throw err;
    }
    lookupTrace({
      reason: 'storage_error',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function persistLfEstrelaPhysicalPdf(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  tenantId: string;
  contractNumber: string;
  pdfBytes: Uint8Array;
  saleId?: string | null;
  version?: number | null;
  overwrite?: boolean;
}): Promise<{
  url: string;
  sha256: string;
  pageCount: number;
  reused: boolean;
  storagePath: string;
  bucket: string;
}> {
  if (!isPdfBytes(input.pdfBytes)) {
    throw new Error('Arquivo enviado não é PDF.');
  }
  if (input.pdfBytes.byteLength === 0) {
    throw new Error('PDF físico vazio (0 bytes).');
  }
  const doc = await PDFDocument.load(input.pdfBytes);
  const pageCount = doc.getPageCount();
  assertLfEstrelaHomologatedPageCount(pageCount);
  const sha256 = sha256Hex(input.pdfBytes);
  const bucket = await assertSaleContractBucketReady(input.supabaseAdmin);
  const storagePath = buildPhysicalSaleContractStoragePath(
    input.tenantId,
    input.contractNumber,
  );

  if (!input.overwrite) {
    const existing = await loadLfEstrelaPhysicalPdfBytes({
      supabaseAdmin: input.supabaseAdmin,
      tenantId: input.tenantId,
      contractNumber: input.contractNumber,
      contractId: input.contractId,
      saleId: input.saleId,
    }).catch((err) => {
      if (err instanceof Error && /Base física LF ESTRELA inválida/i.test(err.message)) {
        return null;
      }
      throw err;
    });
    if (existing && existing.pageCount === LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
      console.info('[LF PHYSICAL PDF PERSIST TRACE]', {
        contractId: input.contractId,
        bucket,
        storagePath: existing.storagePath,
        pageCount: existing.pageCount,
        sha256: existing.sha256,
        reused: true,
      });
      return {
        url: existing.storagePath,
        sha256: existing.sha256,
        pageCount: existing.pageCount,
        reused: true,
        storagePath: existing.storagePath,
        bucket,
      };
    }
  }

  const { error: uploadError } = await input.supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, Buffer.from(input.pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '31536000',
    });
  if (uploadError) {
    throw new Error(
      `[stage=physical_pdf_freeze] Falha ao congelar PDF físico (${bucket}/${storagePath}): ${uploadError.message}`,
    );
  }

  console.info('[LF PHYSICAL PDF PERSIST TRACE]', {
    contractId: input.contractId,
    bucket,
    storagePath,
    pageCount,
    sha256,
    reused: false,
    uploadOk: true,
    bytes: input.pdfBytes.byteLength,
  });

  return { url: storagePath, sha256, pageCount, reused: false, storagePath, bucket };
}

export type LfEstrelaPhysicalPrepareResult =
  | {
      reused: true;
      bucket: string;
      storagePath: string;
      pageCount: number;
      sha256: string;
      storedSize: number;
    }
  | {
      reused: false;
      bucket: string;
      storagePath: string;
      signedUrl: string;
      token: string;
      path: string;
    };

export async function prepareLfEstrelaPhysicalDirectUpload(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  tenantId: string;
  contractNumber: string;
  saleId?: string | null;
  pageCount?: number | null;
  blobSize?: number | null;
}): Promise<LfEstrelaPhysicalPrepareResult> {
  if (
    input.pageCount != null &&
    Number(input.pageCount) !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES
  ) {
    throw new Error(lfEstrelaInvalidPhysicalBaseMessage(Number(input.pageCount)));
  }
  if (input.blobSize != null && Number(input.blobSize) <= 0) {
    throw new Error('PDF físico vazio (0 bytes).');
  }

  const existing = await loadLfEstrelaPhysicalPdfBytes({
    supabaseAdmin: input.supabaseAdmin,
    tenantId: input.tenantId,
    contractNumber: input.contractNumber,
    contractId: input.contractId,
    saleId: input.saleId,
  }).catch((err) => {
    if (err instanceof Error && /Base física LF ESTRELA inválida/i.test(err.message)) {
      return null;
    }
    throw err;
  });

  if (existing && existing.pageCount === LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
    console.info('[LF PHYSICAL STORAGE TRACE]', {
      contractId: input.contractId,
      bucket: existing.bucket,
      storagePath: existing.storagePath,
      pageCount: existing.pageCount,
      sha256: existing.sha256,
      storedSize: existing.bytes.byteLength,
      uploadStatus: 'reused',
    });
    return {
      reused: true,
      bucket: existing.bucket,
      storagePath: existing.storagePath,
      pageCount: existing.pageCount,
      sha256: existing.sha256,
      storedSize: existing.bytes.byteLength,
    };
  }

  const bucket = await assertSaleContractBucketReady(input.supabaseAdmin);
  const storagePath = buildPhysicalSaleContractStoragePath(
    input.tenantId,
    input.contractNumber,
  );
  const { data, error } = await input.supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (error || !data?.signedUrl || !data.token) {
    throw new Error(
      `Falha ao autorizar upload direto do PDF físico (${bucket}/${storagePath}): ${
        error?.message || 'signed URL ausente'
      }`,
    );
  }

  console.info('[LF PHYSICAL STORAGE TRACE]', {
    contractId: input.contractId,
    bucket,
    storagePath,
    uploadStatus: 'prepare',
    signedUrlIssued: true,
  });

  return {
    reused: false,
    bucket,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path || storagePath,
  };
}

export async function confirmLfEstrelaPhysicalDirectUpload(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  tenantId: string;
  contractNumber: string;
  saleId?: string | null;
  sha256?: string | null;
  pageCount?: number | null;
  blobSize?: number | null;
}): Promise<{
  bucket: string;
  storagePath: string;
  pageCount: number;
  sha256: string;
  storedSize: number;
}> {
  const loaded = await loadLfEstrelaPhysicalPdfBytes({
    supabaseAdmin: input.supabaseAdmin,
    tenantId: input.tenantId,
    contractNumber: input.contractNumber,
    contractId: input.contractId,
    saleId: input.saleId,
  });
  if (!loaded) {
    throw new Error(LF_ESTRELA_PHYSICAL_BASE_MISSING_MESSAGE);
  }
  assertLfEstrelaHomologatedPageCount(loaded.pageCount);
  const clientSha = String(input.sha256 || '').trim().toLowerCase();
  if (clientSha && clientSha !== loaded.sha256) {
    throw new Error(
      'SHA-256 do PDF no Storage não confere com o arquivo gerado no navegador.',
    );
  }
  if (
    input.blobSize != null &&
    Number(input.blobSize) > 0 &&
    loaded.bytes.byteLength !== Number(input.blobSize)
  ) {
    throw new Error(
      `Tamanho do PDF no Storage (${loaded.bytes.byteLength}) não confere com o gerado (${input.blobSize}).`,
    );
  }

  console.info('[LF PHYSICAL STORAGE TRACE]', {
    contractId: input.contractId,
    bucket: loaded.bucket,
    storagePath: loaded.storagePath,
    pageCount: loaded.pageCount,
    sha256: loaded.sha256,
    storedSize: loaded.bytes.byteLength,
    uploadStatus: 'success',
  });

  return {
    bucket: loaded.bucket,
    storagePath: loaded.storagePath,
    pageCount: loaded.pageCount,
    sha256: loaded.sha256,
    storedSize: loaded.bytes.byteLength,
  };
}

export async function ensureLfEstrelaPhysicalBase(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  tenantId: string;
  contractNumber: string;
  saleId?: string | null;
}): Promise<{
  bytes: Uint8Array;
  sha256: string;
  pageCount: number;
  storagePath: string | null;
  reused: boolean;
  source: 'existing';
  bucket: string;
}> {
  const loaded = await loadLfEstrelaPhysicalPdfBytes({
    supabaseAdmin: input.supabaseAdmin,
    tenantId: input.tenantId,
    contractNumber: input.contractNumber,
    contractId: input.contractId,
    saleId: input.saleId,
  });
  if (!loaded) {
    throw new Error(LF_ESTRELA_PHYSICAL_BASE_MISSING_MESSAGE);
  }
  assertLfEstrelaHomologatedPageCount(loaded.pageCount);
  return {
    bytes: loaded.bytes,
    sha256: loaded.sha256,
    pageCount: loaded.pageCount,
    storagePath: loaded.storagePath,
    reused: true,
    source: 'existing',
    bucket: loaded.bucket,
  };
}

export async function buildLfEstrelaSignedSaleContractPdf(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  contractNumber: string;
  tenantId: string;
  tenant: Record<string, unknown>;
  company?: Record<string, unknown> | null;
  originalHtml: string;
  chrome: ContractPdfChromeInput;
  signature?: { id?: string | null } | null;
  saleId?: string | null;
  version?: number | null;
  projectId?: string | null;
  lotId?: string | null;
  buyerId?: string | null;
  certificateHtml?: string | null;
}): Promise<Uint8Array> {
  const { listSignatureParties } = await import('@/lib/saleContractSignatureParties');
  const { buildSaleContractPdfFromHtml } = await import('@/lib/saleContractPdf');
  const signatureProcessId = String(input.signature?.id || '').trim();

  console.info('[LF SIGNED PDF CONTRACT LOOKUP]', {
    requestedContractId: input.contractId,
    lookupContractId: input.contractId,
    signatureProcessId: signatureProcessId || null,
    saleId: input.saleId || null,
    physicalPdfContractId: input.contractId,
    regeneratedFrom: null,
    stage: 'physical_pdf_lookup',
  });

  if (signatureProcessId && input.contractId === signatureProcessId) {
    throw new Error(
      `[stage=physical_pdf_lookup] Contrato não encontrado. buildLfEstrelaSignedSaleContractPdf recebeu o ID do processo (${signatureProcessId}) como contracts.id.`,
    );
  }

  let parties: ContractSignaturePartyRow[] = [];
  if (input.signature?.id) {
    parties = await listSignatureParties(input.supabaseAdmin, String(input.signature.id));
  }

  const stamps = resolveLfEstrelaOverlayStamps({
    parties,
    company: input.company || input.tenant,
  });

  let physical: Awaited<ReturnType<typeof ensureLfEstrelaPhysicalBase>>;
  try {
    physical = await ensureLfEstrelaPhysicalBase({
      supabaseAdmin: input.supabaseAdmin,
      contractId: input.contractId,
      tenantId: input.tenantId,
      contractNumber: input.contractNumber,
      saleId: input.saleId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stage = /physical_pdf_freeze/.test(message)
      ? 'physical_pdf_freeze'
      : 'physical_pdf_lookup';
    throw new Error(`[stage=${stage}] ${message}`);
  }

  let certificatePdfBytes: Uint8Array | null = null;
  const certificateHtml = String(input.certificateHtml || '').trim();
  if (certificateHtml) {
    console.info('[LF SIGNED PDF STAGE]', {
      stage: 'certificate',
      requestedContractId: input.contractId,
    });
    try {
      certificatePdfBytes = await buildSaleContractPdfFromHtml(certificateHtml, input.chrome, {
        skipPaginationMeasure: true,
        displayHeaderFooter: false,
        marginMm: { top: 15, right: 15, bottom: 15, left: 15 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[stage=certificate] ${message}`);
    }
  }

  console.info('[LF SIGNED PDF STAGE]', {
    stage: 'overlay',
    requestedContractId: input.contractId,
    stampCount: stamps.length,
    physicalPages: physical.pageCount,
    physicalSource: physical.source,
    storagePath: physical.storagePath,
  });
  try {
    const signed = await composeLfEstrelaSignedPdf({
      physicalBytes: physical.bytes,
      stamps,
      certificatePdfBytes,
    });
    try {
      const { uploadSignedSaleContractPdf } = await import(
        '@/lib/saleContractSignatureService'
      );
      const pdfSignedUrl = await uploadSignedSaleContractPdf(
        input.supabaseAdmin,
        input.tenantId,
        input.contractNumber,
        signed,
      );
      const { error: signedUrlErr } = await input.supabaseAdmin
        .from('contracts')
        .update({
          pdf_signed_url: pdfSignedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.contractId);
      console.info('[LF SIGNED PDF STAGE]', {
        stage: 'append',
        requestedContractId: input.contractId,
        bytes: signed.byteLength,
        signedStorage: 'company-assets/contracts/sale-signed',
        pdfSignedUrlOk: !signedUrlErr,
      });
    } catch (storeErr) {
      console.warn('[LF SIGNED PDF STAGE] sale-signed persist failed', {
        requestedContractId: input.contractId,
        message: storeErr instanceof Error ? storeErr.message : String(storeErr),
      });
    }
    return signed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[stage=overlay] ${message}`);
  }
}
