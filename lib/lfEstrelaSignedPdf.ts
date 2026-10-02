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
  createSystemGeneratedSaleDocumentMetadata,
  buildUploadStoragePathForSale,
} from '@/lib/saleDocumentService';
import {
  LF_ESTRELA_PHYSICAL_BASE_DOCUMENT_TYPE,
  SALE_DOCUMENTS_STORAGE_BUCKET,
} from '@/lib/saleDocuments';
import {
  assertSaleContractBucketReady,
  buildPhysicalSaleContractStoragePath,
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

function matchesLfEstrelaPhysicalBase(
  row: { description?: string | null; original_file_name?: string | null },
  contractId: string,
): boolean {
  const id = String(contractId || '').trim();
  if (!id) return false;
  const parsed = parseLfEstrelaPhysicalBaseDescription(row.description);
  if (parsed.contractId && parsed.contractId === id) return true;
  return String(row.original_file_name || '').includes(id);
}

export async function findLfEstrelaPhysicalBaseDocument(input: {
  supabaseAdmin: SupabaseClient;
  saleId: string;
  contractId: string;
}): Promise<{
  id: string;
  storage_path: string;
  description: string | null;
  original_file_name: string;
  created_at: string | null;
} | null> {
  const saleId = String(input.saleId || '').trim();
  const contractId = String(input.contractId || '').trim();
  if (!saleId || !contractId) return null;
  const { data, error } = await input.supabaseAdmin
    .from('sale_documents')
    .select('id, storage_path, description, original_file_name, created_at')
    .eq('sale_id', saleId)
    .eq('document_type', LF_ESTRELA_PHYSICAL_BASE_DOCUMENT_TYPE)
    .eq('category', 'SYSTEM_GENERATED')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[LF SIGNED PDF STAGE] sale_documents lookup failed', {
      stage: 'physical_pdf_lookup',
      saleId,
      contractId,
      message: error.message,
    });
    return null;
  }
  const match = (data || []).find((row) => matchesLfEstrelaPhysicalBase(row, contractId));
  return match
    ? {
        id: String(match.id),
        storage_path: String(match.storage_path || ''),
        description: match.description || null,
        original_file_name: String(match.original_file_name || ''),
        created_at: match.created_at || null,
      }
    : null;
}

async function downloadSaleDocumentPdf(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
): Promise<Uint8Array | null> {
  const path = String(storagePath || '').trim();
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return isPdfBytes(bytes) ? bytes : null;
}

async function invalidateLfEstrelaPhysicalBaseDocument(input: {
  supabaseAdmin: SupabaseClient;
  documentId: string;
  storagePath: string;
  description?: string | null;
  pageCount: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const suffix = `.invalid.${Date.now()}`;
  const prev = String(input.description || '').trim();
  const nextDesc =
    `${prev} invalid_page_count=${input.pageCount} invalidated_at=${now}`.trim();
  const { error } = await input.supabaseAdmin
    .from('sale_documents')
    .update({
      deleted_at: now,
      storage_path: `${input.storagePath}${suffix}`,
      description: nextDesc.slice(0, 1800),
      updated_at: now,
    })
    .eq('id', input.documentId)
    .eq('document_type', LF_ESTRELA_PHYSICAL_BASE_DOCUMENT_TYPE)
    .is('deleted_at', null);
  console.warn('[LF SIGNED PDF STAGE]', {
    stage: 'physical_pdf_invalidate',
    documentId: input.documentId,
    pageCount: input.pageCount,
    message: lfEstrelaInvalidPhysicalBaseMessage(input.pageCount),
  });
  if (error) {
    throw new Error(
      `[stage=physical_pdf_invalidate] Falha ao invalidar base física LF ESTRELA: ${error.message}`,
    );
  }
}

export async function loadLfEstrelaPhysicalPdfBytes(input: {
  supabaseAdmin: SupabaseClient;
  tenantId: string;
  contractNumber: string;
  contractId?: string | null;
  saleId?: string | null;
}): Promise<{
  bytes: Uint8Array;
  source: 'sale_documents' | 'storage';
  sha256: string;
  pageCount: number;
  storagePath?: string;
} | null> {
  const tryLoad = async (
    bytes: Uint8Array | null,
    source: 'sale_documents' | 'storage',
    storagePath?: string,
  ) => {
    if (!bytes || !isPdfBytes(bytes)) return null;
    const doc = await PDFDocument.load(bytes);
    return {
      bytes,
      source,
      sha256: sha256Hex(bytes),
      pageCount: doc.getPageCount(),
      storagePath,
    };
  };

  const saleId = String(input.saleId || '').trim();
  const contractId = String(input.contractId || '').trim();
  if (saleId && contractId) {
    const existing = await findLfEstrelaPhysicalBaseDocument({
      supabaseAdmin: input.supabaseAdmin,
      saleId,
      contractId,
    });
    if (existing?.storage_path) {
      const bytes = await downloadSaleDocumentPdf(
        input.supabaseAdmin,
        existing.storage_path,
      );
      const loaded = await tryLoad(bytes, 'sale_documents', existing.storage_path);
      if (loaded) {
        if (loaded.pageCount !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
          await invalidateLfEstrelaPhysicalBaseDocument({
            supabaseAdmin: input.supabaseAdmin,
            documentId: existing.id,
            storagePath: existing.storage_path,
            description: existing.description,
            pageCount: loaded.pageCount,
          });
          throw new Error(lfEstrelaInvalidPhysicalBaseMessage(loaded.pageCount));
        }
        return loaded;
      }
    }
  }

  try {
    const bucket = await assertSaleContractBucketReady(input.supabaseAdmin);
    const path = buildPhysicalSaleContractStoragePath(input.tenantId, input.contractNumber);
    const { data, error } = await input.supabaseAdmin.storage.from(bucket).download(path);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const loaded = await tryLoad(bytes, 'storage', path);
    if (loaded && loaded.pageCount !== LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
      throw new Error(lfEstrelaInvalidPhysicalBaseMessage(loaded.pageCount));
    }
    return loaded;
  } catch (err) {
    if (err instanceof Error && /Base física LF ESTRELA inválida/i.test(err.message)) {
      throw err;
    }
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
  projectId?: string | null;
  lotId?: string | null;
  buyerId?: string | null;
  userId?: string | null;
  overwrite?: boolean;
}): Promise<{
  url: string;
  sha256: string;
  pageCount: number;
  reused: boolean;
  storagePath: string;
}> {
  if (!isPdfBytes(input.pdfBytes)) {
    throw new Error('Arquivo enviado não é PDF.');
  }
  const saleId = String(input.saleId || '').trim();
  if (!saleId) {
    throw new Error(
      '[stage=physical_pdf_freeze] Contrato sem sale_id — não é possível gravar o PDF físico em sale_documents.',
    );
  }
  const doc = await PDFDocument.load(input.pdfBytes);
  const pageCount = doc.getPageCount();
  assertLfEstrelaHomologatedPageCount(pageCount);
  const sha256 = sha256Hex(input.pdfBytes);

  const existing = await findLfEstrelaPhysicalBaseDocument({
    supabaseAdmin: input.supabaseAdmin,
    saleId,
    contractId: input.contractId,
  });
  let canReuseExisting = Boolean(existing?.storage_path);
  if (existing?.storage_path && !input.overwrite) {
    const loaded = await downloadSaleDocumentPdf(
      input.supabaseAdmin,
      existing.storage_path,
    );
    if (loaded && isPdfBytes(loaded)) {
      const existingCount = (await PDFDocument.load(loaded)).getPageCount();
      if (existingCount === LF_ESTRELA_SIGNED_INSTRUMENT_PAGES) {
        return {
          url: existing.storage_path,
          sha256: sha256Hex(loaded),
          pageCount: existingCount,
          reused: true,
          storagePath: existing.storage_path,
        };
      }
      await invalidateLfEstrelaPhysicalBaseDocument({
        supabaseAdmin: input.supabaseAdmin,
        documentId: existing.id,
        storagePath: existing.storage_path,
        description: existing.description,
        pageCount: existingCount,
      });
      canReuseExisting = false;
    }
  }

  const fileName = `lf-estrela-physical-${input.contractId}.pdf`;
  const storagePath = buildUploadStoragePathForSale({
    ctx: {
      tenantId: input.tenantId,
      companyId: input.tenantId,
      projectId: input.projectId || null,
      lotId: input.lotId || null,
      buyerId: input.buyerId || null,
    },
    saleId,
    category: 'SYSTEM_GENERATED',
    fileName,
    fileId: input.contractId,
  });

  const { error: uploadError } = await input.supabaseAdmin.storage
    .from(SALE_DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, Buffer.from(input.pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '31536000',
    });
  if (uploadError) {
    throw new Error(
      `[stage=physical_pdf_freeze] Falha ao congelar PDF físico (${SALE_DOCUMENTS_STORAGE_BUCKET}): ${uploadError.message}`,
    );
  }

  if (!canReuseExisting) {
    await createSystemGeneratedSaleDocumentMetadata(input.supabaseAdmin, {
      saleId,
      ctx: {
        tenantId: input.tenantId,
        companyId: input.tenantId,
        projectId: input.projectId || null,
        lotId: input.lotId || null,
        buyerId: input.buyerId || null,
      },
      userId: String(input.userId || input.tenantId),
      documentType: LF_ESTRELA_PHYSICAL_BASE_DOCUMENT_TYPE,
      description: buildLfEstrelaPhysicalBaseDescription({
        contractId: input.contractId,
        version: input.version,
        sha256,
        pageCount,
      }),
      originalFileName: fileName,
      storagePath,
      mimeType: 'application/pdf',
      fileSize: input.pdfBytes.byteLength,
    });
  }

  return { url: storagePath, sha256, pageCount, reused: false, storagePath };
}

export async function ensureLfEstrelaPhysicalBase(input: {
  supabaseAdmin: SupabaseClient;
  contractId: string;
  tenantId: string;
  contractNumber: string;
  saleId?: string | null;
  version?: number | null;
  projectId?: string | null;
  lotId?: string | null;
  buyerId?: string | null;
  pdfBytes?: Uint8Array | null;
  userId?: string | null;
}): Promise<{
  bytes: Uint8Array;
  sha256: string;
  pageCount: number;
  storagePath: string | null;
  reused: boolean;
  source: 'existing' | 'uploaded';
}> {
  const loaded = await loadLfEstrelaPhysicalPdfBytes({
    supabaseAdmin: input.supabaseAdmin,
    tenantId: input.tenantId,
    contractNumber: input.contractNumber,
    contractId: input.contractId,
    saleId: input.saleId,
  });
  if (loaded) {
    assertLfEstrelaHomologatedPageCount(loaded.pageCount);
    return {
      bytes: loaded.bytes,
      sha256: loaded.sha256,
      pageCount: loaded.pageCount,
      storagePath: loaded.storagePath || null,
      reused: true,
      source: 'existing',
    };
  }

  const bytes = input.pdfBytes && isPdfBytes(input.pdfBytes) ? input.pdfBytes : null;
  if (!bytes) {
    throw new Error(lfEstrelaInvalidPhysicalBaseMessage(0));
  }

  const persisted = await persistLfEstrelaPhysicalPdf({
    supabaseAdmin: input.supabaseAdmin,
    contractId: input.contractId,
    tenantId: input.tenantId,
    contractNumber: input.contractNumber,
    pdfBytes: bytes,
    saleId: input.saleId,
    version: input.version,
    projectId: input.projectId,
    lotId: input.lotId,
    buyerId: input.buyerId,
    userId: input.userId,
    overwrite: false,
  });
  assertLfEstrelaHomologatedPageCount(persisted.pageCount);

  return {
    bytes,
    sha256: persisted.sha256,
    pageCount: persisted.pageCount,
    storagePath: persisted.storagePath,
    reused: persisted.reused,
    source: 'uploaded',
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
      version: input.version,
      projectId: input.projectId,
      lotId: input.lotId,
      buyerId: input.buyerId,
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
    console.info('[LF SIGNED PDF STAGE]', {
      stage: 'append',
      requestedContractId: input.contractId,
      bytes: signed.byteLength,
    });
    return signed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[stage=overlay] ${message}`);
  }
}
