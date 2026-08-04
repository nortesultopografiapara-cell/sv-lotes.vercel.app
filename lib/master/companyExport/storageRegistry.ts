/**
 * Registry central de Storage para exportação F2.
 * Regras de bucket/path/destino — não espalhar em outros serviços.
 */

export const COMPANY_EXPORT_ALLOWED_BUCKETS = [
  'company-assets',
  'sale-documents',
  'legacy-contracts',
  'company-exports',
] as const;

export type CompanyExportAllowedBucket = (typeof COMPANY_EXPORT_ALLOWED_BUCKETS)[number];

export const COMPANY_EXPORT_FORBIDDEN_BUCKETS = [
  'master-topography-operations',
  'master-topography-equipment',
  'contracts', // criado na migration mas não usado pelos uploads do app
] as const;

export type StorageLinkStrategy =
  | 'company_id_direct'
  | 'path_prefix_company'
  | 'via_sale'
  | 'via_contract'
  | 'via_project'
  | 'via_customer';

export type StorageFileCategory =
  | 'company_logo'
  | 'company_signature'
  | 'saas_contract'
  | 'sale_signed_pdf'
  | 'sale_document'
  | 'legacy_contract'
  | 'generated_memorial'
  | 'generated_lot_plan'
  | 'generated_general_plan'
  | 'external_asaas_ref';

export type StorageSourceSpec = {
  id: string;
  bucket: CompanyExportAllowedBucket | null;
  /** Tabela de metadados (quando aplicável). */
  table?: string;
  /** Colunas com path ou URL pública do Storage. */
  pathColumns?: readonly string[];
  link: StorageLinkStrategy;
  category: StorageFileCategory;
  zipFolderTemplate: string;
  allowedMime?: readonly string[];
  maxBytes: number;
  optional: boolean;
  /** Se true, só indexa metadados (Asaas). */
  externalReferenceOnly?: boolean;
  description: string;
};

export const COMPANY_EXPORT_STORAGE_SOURCES: readonly StorageSourceSpec[] = [
  {
    id: 'company_branding',
    bucket: 'company-assets',
    table: 'companies',
    pathColumns: [
      'logo_url',
      'signature_url',
      'company_stamp_url',
      'technical_signature_url',
      'technical_stamp_url',
    ],
    link: 'company_id_direct',
    category: 'company_logo',
    zipFolderTemplate: '01_empresa/logos',
    allowedMime: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 15 * 1024 * 1024,
    optional: true,
    description: 'Logos, assinaturas e carimbos da empresa',
  },
  {
    id: 'saas_contracts',
    bucket: 'company-assets',
    table: 'company_contracts',
    pathColumns: ['contract_url', 'pdf_signed_url'],
    link: 'company_id_direct',
    category: 'saas_contract',
    zipFolderTemplate: '01_empresa/contrato_saas',
    allowedMime: ['application/pdf'],
    maxBytes: 40 * 1024 * 1024,
    optional: true,
    description: 'Contratos SaaS PDF / assinados',
  },
  {
    id: 'sale_signed_pdfs',
    bucket: 'company-assets',
    table: 'contracts',
    pathColumns: ['pdf_signed_url', 'pdf_url'],
    link: 'via_contract',
    category: 'sale_signed_pdf',
    zipFolderTemplate: '06_contratos/{contractFolder}',
    allowedMime: ['application/pdf'],
    maxBytes: 40 * 1024 * 1024,
    optional: true,
    description: 'PDF de contrato de venda / assinado',
  },
  {
    id: 'sale_documents',
    bucket: 'sale-documents',
    table: 'sale_documents',
    pathColumns: ['storage_path'],
    link: 'via_sale',
    category: 'sale_document',
    zipFolderTemplate: '05_vendas/{saleFolder}/documentos',
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 20 * 1024 * 1024,
    optional: true,
    description: 'Documentos da venda (comprador, cônjuge, sinal)',
  },
  {
    id: 'legacy_contracts',
    bucket: 'legacy-contracts',
    table: 'legacy_contract_documents',
    pathColumns: ['storage_path'],
    link: 'company_id_direct',
    category: 'legacy_contract',
    zipFolderTemplate: '08_arquivos_originais/legacy',
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 40 * 1024 * 1024,
    optional: true,
    description: 'PDFs legados de contratos',
  },
  {
    id: 'asaas_charge_refs',
    bucket: null,
    table: 'company_asaas_charges',
    pathColumns: ['bank_slip_url', 'invoice_url'],
    link: 'company_id_direct',
    category: 'external_asaas_ref',
    zipFolderTemplate: '07_financeiro/boletos',
    maxBytes: 0,
    optional: true,
    externalReferenceOnly: true,
    description: 'Índice de boletos/links Asaas (sem download)',
  },
] as const;

export const COMPANY_EXPORT_PACKAGE_SPLIT_BYTES = 450 * 1024 * 1024;
export const COMPANY_EXPORT_BINARY_BATCH = 8;
export const COMPANY_EXPORT_PLAN_BATCH = 2;

export function isAllowedExportBucket(bucket: string): boolean {
  return (COMPANY_EXPORT_ALLOWED_BUCKETS as readonly string[]).includes(bucket);
}

export function assertStorageRegistrySecurity(): void {
  for (const src of COMPANY_EXPORT_STORAGE_SOURCES) {
    if (src.bucket && !isAllowedExportBucket(src.bucket)) {
      throw new Error(`Storage registry bucket não autorizado: ${src.bucket}`);
    }
    if (
      src.bucket &&
      (COMPANY_EXPORT_FORBIDDEN_BUCKETS as readonly string[]).includes(src.bucket)
    ) {
      throw new Error(`Storage registry bucket proibido: ${src.bucket}`);
    }
  }
}
