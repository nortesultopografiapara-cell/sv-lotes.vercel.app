/**
 * Documentos da Venda — categorias, tipos, validação e paths (multiempresa).
 */

export const SALE_DOCUMENTS_STORAGE_BUCKET = 'sale-documents';

/** Limite padrão por arquivo (configurável). */
export const SALE_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const SALE_DOCUMENT_CATEGORIES = [
  'SIGNAL_ENTRY',
  'BUYER',
  'SPOUSE',
  'OTHER',
  'SYSTEM_GENERATED',
] as const;

export type SaleDocumentCategory = (typeof SALE_DOCUMENT_CATEGORIES)[number];

/** Tipos SYSTEM_GENERATED já homologados — resolução inalterada. */
export const SALE_DOCUMENT_LEGACY_SYSTEM_TYPES = [
  'SYSTEM',
  'PROMISSORY_NOTE',
] as const;

/** Tipos novos do fluxo de encerramento/cessão — apenas aditivos. */
export const SALE_DOCUMENT_CONTRACT_OPERATION_TYPES = [
  'DISTRATO',
  'CESSAO',
  'RESCISAO',
  'CANCELAMENTO_ADMIN',
] as const;

/** Termos de encerramento GIS (Fase 3B) — aditivo, sem alterar tipos de cessão. */
export const SALE_DOCUMENT_TERMINATION_TYPES = [
  'DESISTENCIA',
  'DESISTENCIA_ASSINADO',
  'DISTRATO_ASSINADO',
  'INADIMPLENCIA',
  'INADIMPLENCIA_ASSINADO',
] as const;

/** Termo aditivo de Troca de lote — Fase 6 futura. Sem PDF nesta fase. */
export const SALE_DOCUMENT_LOT_SWAP_TYPES = [
  'TROCA_LOTE',
  'TROCA_LOTE_ASSINADO',
] as const;

export const SALE_DOCUMENT_TYPES_BY_CATEGORY: Record<
  SaleDocumentCategory,
  readonly string[]
> = {
  SIGNAL_ENTRY: [
    'DECLARATION',
    'RECEIPT',
    'PIX_PROOF',
    'TED_PROOF',
    'OTHER',
  ],
  BUYER: ['RG', 'CPF', 'CNH', 'CERTIFICATE', 'PROOF_OF_ADDRESS', 'OTHER'],
  SPOUSE: ['RG', 'CPF', 'CNH', 'CERTIFICATE', 'PROOF_OF_ADDRESS', 'OTHER'],
  OTHER: ['OTHER'],
  SYSTEM_GENERATED: [
    ...SALE_DOCUMENT_LEGACY_SYSTEM_TYPES,
    ...SALE_DOCUMENT_CONTRACT_OPERATION_TYPES,
    ...SALE_DOCUMENT_TERMINATION_TYPES,
    ...SALE_DOCUMENT_LOT_SWAP_TYPES,
  ],
};

export const SALE_DOCUMENT_CATEGORY_LABELS: Record<SaleDocumentCategory, string> = {
  SIGNAL_ENTRY: 'Documentos de Sinal / Entrada',
  BUYER: 'Documentos do Comprador',
  SPOUSE: 'Documentos do Cônjuge',
  OTHER: 'Outros Documentos',
  SYSTEM_GENERATED: 'Documentos Gerados pelo Sistema',
};

export const SALE_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  DECLARATION: 'Declaração de Sinal / Entrada',
  RECEIPT: 'Recibo',
  PIX_PROOF: 'Comprovante PIX',
  TED_PROOF: 'Comprovante TED',
  RG: 'RG',
  CPF: 'CPF',
  CNH: 'CNH',
  CERTIFICATE: 'Certidão',
  PROOF_OF_ADDRESS: 'Comprovante de residência',
  OTHER: 'Outros',
  SYSTEM: 'Documento do sistema',
  PROMISSORY_NOTE: 'Nota Promissória',
  DISTRATO: 'Instrumento Particular de Distrato e Acerto Financeiro',
  DISTRATO_ASSINADO:
    'Instrumento Particular de Distrato e Acerto Financeiro (assinado)',
  CESSAO: 'Instrumento de Cessão de Direitos',
  RESCISAO: 'Termo de Rescisão por Inadimplência',
  CANCELAMENTO_ADMIN: 'Termo Administrativo de Cancelamento',
  DESISTENCIA: 'Termo de Desistência, Rescisão Contratual e Acerto Financeiro',
  DESISTENCIA_ASSINADO:
    'Termo de Desistência, Rescisão Contratual e Acerto Financeiro (assinado)',
  INADIMPLENCIA: 'Termo de Rescisão Contratual por Inadimplência',
  INADIMPLENCIA_ASSINADO:
    'Termo de Rescisão Contratual por Inadimplência (assinado)',
  TROCA_LOTE: 'Termo Aditivo de Troca de Lote / Substituição de Unidade',
  TROCA_LOTE_ASSINADO:
    'Termo Aditivo de Troca de Lote / Substituição de Unidade (assinado)',
};

export const SALE_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const SALE_DOCUMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;

export function isSaleDocumentCategory(value: unknown): value is SaleDocumentCategory {
  return (
    typeof value === 'string' &&
    (SALE_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

export function normalizeSaleDocumentCategory(
  value: unknown,
): SaleDocumentCategory | null {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  return isSaleDocumentCategory(raw) ? raw : null;
}

export function isUploadAllowedForCategory(category: SaleDocumentCategory): boolean {
  return category !== 'SYSTEM_GENERATED';
}

const SALE_OPERATION_GENERATED_TYPES = new Set<string>([
  ...SALE_DOCUMENT_CONTRACT_OPERATION_TYPES,
  ...SALE_DOCUMENT_TERMINATION_TYPES,
  ...SALE_DOCUMENT_LOT_SWAP_TYPES,
]);

export function isSaleOperationGeneratedType(documentType?: string | null): boolean {
  return SALE_OPERATION_GENERATED_TYPES.has(
    String(documentType || '')
      .trim()
      .toUpperCase(),
  );
}

/** Número do termo gravado na descrição (`nº TD-000000001/2026`) ou no nome do arquivo. */
export function parseSaleOperationDocumentNumber(input: {
  description?: string | null;
  original_file_name?: string | null;
}): string | null {
  const desc = String(input.description || '');
  const fromDesc = desc.match(/n[ºo°]\s*([A-Z]{1,4}-\d{5,}\/\d{4})/i);
  if (fromDesc?.[1]) return fromDesc[1].toUpperCase();
  const name = String(input.original_file_name || '');
  const fromFile = name.match(/([A-Z]{1,4}-\d{5,})[-_/](\d{4})/i);
  if (fromFile?.[1] && fromFile[2]) {
    return `${fromFile[1].toUpperCase()}/${fromFile[2]}`;
  }
  return null;
}

export function saleOperationDocumentStatusLabel(documentType?: string | null): string {
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  if (type === 'DESISTENCIA_ASSINADO' || type === 'DISTRATO_ASSINADO' || type === 'INADIMPLENCIA_ASSINADO' || type === 'TROCA_LOTE_ASSINADO') return 'Assinado';
  if (type === 'DESISTENCIA' || type === 'DISTRATO' || type === 'INADIMPLENCIA' || type === 'TROCA_LOTE') return 'Gerado';
  if (SALE_OPERATION_GENERATED_TYPES.has(type)) return 'Gerado';
  return '—';
}

export function terminationDocumentViewHref(saleId: string): string {
  return `/api/sales/${encodeURIComponent(saleId)}/termination-document?format=html`;
}

export function terminationDocumentPdfHref(saleId: string): string {
  return `/api/sales/${encodeURIComponent(saleId)}/termination-document/pdf`;
}

export function terminationDocumentMetaHref(saleId: string): string {
  return `/api/sales/${encodeURIComponent(saleId)}/termination-document?meta=1`;
}

export function terminationDocumentSignedPdfHref(
  saleId: string,
  options?: { download?: boolean },
): string {
  const base = `/api/sales/${encodeURIComponent(saleId)}/termination-document/signed-pdf`;
  return options?.download ? `${base}?download=1` : base;
}

export function isSignedTerminationDocumentType(documentType?: string | null): boolean {
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  return type === 'DESISTENCIA_ASSINADO' || type === 'DISTRATO_ASSINADO' || type === 'INADIMPLENCIA_ASSINADO';
}

export function isOriginalTerminationDocumentType(documentType?: string | null): boolean {
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  return type === 'DESISTENCIA' || type === 'DISTRATO' || type === 'INADIMPLENCIA';
}

/** Assinado primeiro; original permanece para auditoria. Não apaga DESISTENCIA. */
export function preferSaleOperationDocuments<T extends { document_type?: string | null }>(
  docs: T[],
): T[] {
  const signed: T[] = [];
  const original: T[] = [];
  const others: T[] = [];
  for (const doc of docs) {
    if (isSignedTerminationDocumentType(doc.document_type)) signed.push(doc);
    else if (isOriginalTerminationDocumentType(doc.document_type)) original.push(doc);
    else others.push(doc);
  }
  return [...signed, ...original, ...others];
}

export function hasSignedTerminationArtifact<T extends { document_type?: string | null }>(
  docs: T[],
): boolean {
  return docs.some((doc) => isSignedTerminationDocumentType(doc.document_type));
}

export function saleOperationDocumentDisplayLabel(
  documentType?: string | null,
  options?: { signedArtifactAvailable?: boolean },
): string {
  if (isOriginalTerminationDocumentType(documentType) && options?.signedArtifactAvailable) {
    return 'Documento original';
  }
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  return SALE_DOCUMENT_TYPE_LABELS[type] || type || 'Documento';
}

export type TerminationOperationDocumentRow = {
  role: 'signed' | 'original';
  label: string;
  statusLabel: string;
  documentNumber: string | null;
  generatedAt: string | null;
  viewHref: string;
  downloadHref: string;
};

/** Recupera o termo existente: assinado preferencial; original nunca é apagado. */
export function buildTerminationOperationDocumentRows(input: {
  saleId: string;
  documentNumber?: string | null;
  generatedAt?: string | null;
  signedArtifactAvailable?: boolean;
}): TerminationOperationDocumentRow[] {
  const saleId = String(input.saleId || '').trim();
  if (!saleId) return [];
  const documentNumber = input.documentNumber ? String(input.documentNumber) : null;
  const generatedAt = input.generatedAt ? String(input.generatedAt) : null;
  const original: TerminationOperationDocumentRow = {
    role: 'original',
    label: input.signedArtifactAvailable
      ? 'Documento original'
      : SALE_DOCUMENT_TYPE_LABELS.DESISTENCIA,
    statusLabel: input.signedArtifactAvailable ? 'Original' : 'Gerado',
    documentNumber,
    generatedAt,
    viewHref: terminationDocumentViewHref(saleId),
    downloadHref: terminationDocumentPdfHref(saleId),
  };
  if (!input.signedArtifactAvailable) return [original];
  return [
    {
      role: 'signed',
      label: SALE_DOCUMENT_TYPE_LABELS.DESISTENCIA,
      statusLabel: 'Assinado',
      documentNumber,
      generatedAt,
      viewHref: terminationDocumentSignedPdfHref(saleId),
      downloadHref: terminationDocumentSignedPdfHref(saleId, { download: true }),
    },
    original,
  ];
}

export function validateSaleDocumentType(
  category: SaleDocumentCategory,
  documentType: string,
): { valid: true } | { valid: false; message: string } {
  const type = String(documentType || '')
    .trim()
    .toUpperCase();
  if (!type) {
    return { valid: false, message: 'Informe o tipo do documento.' };
  }
  const allowed = SALE_DOCUMENT_TYPES_BY_CATEGORY[category];
  if (!allowed.includes(type)) {
    return {
      valid: false,
      message: `Tipo “${documentType}” inválido para a categoria ${SALE_DOCUMENT_CATEGORY_LABELS[category]}.`,
    };
  }
  return { valid: true };
}

export function validateSaleDocumentMimeType(
  mimeType: string,
  fileName?: string,
): { valid: true; mimeType: string } | { valid: false; message: string } {
  const mime = String(mimeType || '')
    .trim()
    .toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const extOk = SALE_DOCUMENT_ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

  if (
    (SALE_DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime) ||
    (mime === 'image/jpg' && extOk)
  ) {
    return {
      valid: true,
      mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime,
    };
  }

  if (!mime && extOk) {
    if (name.endsWith('.pdf')) return { valid: true, mimeType: 'application/pdf' };
    if (name.endsWith('.png')) return { valid: true, mimeType: 'image/png' };
    if (name.endsWith('.webp')) return { valid: true, mimeType: 'image/webp' };
    return { valid: true, mimeType: 'image/jpeg' };
  }

  return {
    valid: false,
    message: 'Formato não permitido. Use PDF, JPG, JPEG, PNG ou WEBP.',
  };
}

export function validateSaleDocumentFileSize(
  sizeBytes: number,
  maxBytes: number = SALE_DOCUMENT_MAX_BYTES,
): { valid: true } | { valid: false; message: string } {
  const size = Number(sizeBytes) || 0;
  if (size <= 0) {
    return { valid: false, message: 'Arquivo vazio.' };
  }
  if (size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return {
      valid: false,
      message: `Arquivo excede o limite de ${mb} MB.`,
    };
  }
  return { valid: true };
}

export function sanitizeSaleDocumentFileName(fileName: string): string {
  const base = String(fileName || 'arquivo')
    .trim()
    .replace(/[^\w.\-()+\s]/g, '_')
    .replace(/\s+/g, '_');
  return base.slice(0, 180) || 'arquivo';
}

/**
 * Path: empresa / empreendimento / venda / categoria / uuid-nome
 */
export function buildSaleDocumentStoragePath(input: {
  companyId: string;
  projectId: string | null | undefined;
  saleId: string;
  category: SaleDocumentCategory;
  fileName: string;
  fileId?: string;
}): string {
  const companyId = String(input.companyId || '').trim();
  const projectId = String(input.projectId || 'sem-projeto').trim() || 'sem-projeto';
  const saleId = String(input.saleId || '').trim();
  const category = input.category;
  const safeName = sanitizeSaleDocumentFileName(input.fileName);
  const id =
    String(input.fileId || '').trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`);
  return `${companyId}/${projectId}/${saleId}/${category}/${id}-${safeName}`;
}

export function formatFileSizeBytes(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
