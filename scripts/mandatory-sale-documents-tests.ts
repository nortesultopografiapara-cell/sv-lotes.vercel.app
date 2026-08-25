/**
 * Documentos da Venda — validação pura (categorias, MIME, path, SYSTEM).
 * npx tsx scripts/mandatory-sale-documents-tests.ts
 */

import {
  buildSaleDocumentStoragePath,
  formatFileSizeBytes,
  isSaleOperationGeneratedType,
  isUploadAllowedForCategory,
  normalizeSaleDocumentCategory,
  parseSaleOperationDocumentNumber,
  SALE_DOCUMENT_CATEGORIES,
  SALE_DOCUMENT_MAX_BYTES,
  SALE_DOCUMENTS_STORAGE_BUCKET,
  saleOperationDocumentStatusLabel,
  terminationDocumentPdfHref,
  terminationDocumentSignedPdfHref,
  terminationDocumentViewHref,
  preferSaleOperationDocuments,
  saleOperationDocumentDisplayLabel,
  buildTerminationOperationDocumentRows,
  validateSaleDocumentFileSize,
  validateSaleDocumentMimeType,
  validateSaleDocumentType,
} from '../lib/saleDocuments';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCategoriesAndTypes() {
  assert(SALE_DOCUMENT_CATEGORIES.length === 5, '5 categorias');
  assert(
    normalizeSaleDocumentCategory('signal_entry') === 'SIGNAL_ENTRY',
    'normalize SIGNAL_ENTRY',
  );
  assert(normalizeSaleDocumentCategory('x') === null, 'categoria inválida');

  const ok = validateSaleDocumentType('BUYER', 'RG');
  assert(ok.valid, 'RG válido no comprador');

  const bad = validateSaleDocumentType('BUYER', 'PIX_PROOF');
  assert(!bad.valid, 'PIX não é tipo de comprador');

  const spouse = validateSaleDocumentType('SPOUSE', 'CNH');
  assert(spouse.valid, 'CNH cônjuge');

  const signal = validateSaleDocumentType('SIGNAL_ENTRY', 'DECLARATION');
  assert(signal.valid, 'declaração de sinal');

  const system = validateSaleDocumentType('SYSTEM_GENERATED', 'SYSTEM');
  assert(system.valid, 'SYSTEM legado continua válido');
  const note = validateSaleDocumentType('SYSTEM_GENERATED', 'PROMISSORY_NOTE');
  assert(note.valid, 'PROMISSORY_NOTE legado continua válido');
  const desistencia = validateSaleDocumentType('SYSTEM_GENERATED', 'DESISTENCIA');
  assert(desistencia.valid, 'DESISTENCIA system-generated');
  const signed = validateSaleDocumentType('SYSTEM_GENERATED', 'DESISTENCIA_ASSINADO');
  assert(signed.valid, 'DESISTENCIA_ASSINADO system-generated');

  console.log('OK testCategoriesAndTypes');
}

function testSystemGeneratedNoUpload() {
  assert(
    !isUploadAllowedForCategory('SYSTEM_GENERATED'),
    'SYSTEM sem upload',
  );
  assert(isUploadAllowedForCategory('OTHER'), 'OTHER com upload');
  console.log('OK testSystemGeneratedNoUpload');
}

function testMimeAndSize() {
  assert(validateSaleDocumentMimeType('application/pdf', 'a.pdf').valid, 'pdf');
  assert(validateSaleDocumentMimeType('image/jpeg', 'a.jpg').valid, 'jpg');
  assert(validateSaleDocumentMimeType('image/png', 'a.png').valid, 'png');
  assert(validateSaleDocumentMimeType('image/webp', 'a.webp').valid, 'webp');
  assert(
    !validateSaleDocumentMimeType('application/msword', 'a.doc').valid,
    'doc bloqueado',
  );
  assert(validateSaleDocumentFileSize(1024).valid, '1KB ok');
  assert(
    !validateSaleDocumentFileSize(SALE_DOCUMENT_MAX_BYTES + 1).valid,
    'acima do limite',
  );
  assert(!validateSaleDocumentFileSize(0).valid, 'vazio');
  console.log('OK testMimeAndSize');
}

function testStoragePathMultitenant() {
  const path = buildSaleDocumentStoragePath({
    companyId: 'company-aaa',
    projectId: 'project-bbb',
    saleId: 'sale-ccc',
    category: 'BUYER',
    fileName: 'RG João.pdf',
    fileId: 'uuid-1',
  });
  assert(
    path.startsWith('company-aaa/project-bbb/sale-ccc/BUYER/'),
    `path prefix (${path})`,
  );
  assert(path.includes('uuid-1-'), 'file id no path');
  assert(path.includes('RG_Jo'), 'nome sanitizado');
  assert(SALE_DOCUMENTS_STORAGE_BUCKET === 'sale-documents', 'bucket');

  const otherCompany = buildSaleDocumentStoragePath({
    companyId: 'company-zzz',
    projectId: 'project-bbb',
    saleId: 'sale-ccc',
    category: 'BUYER',
    fileName: 'x.pdf',
    fileId: 'u2',
  });
  assert(
    otherCompany.startsWith('company-zzz/'),
    'path isola empresa (multiempresa)',
  );
  assert(!otherCompany.startsWith('company-aaa/'), 'não mistura tenants');

  console.log('OK testStoragePathMultitenant');
}

function testFormatSize() {
  assert(formatFileSizeBytes(500) === '500 B', 'bytes');
  assert(formatFileSizeBytes(2048).includes('KB'), 'kb');
  console.log('OK testFormatSize');
}

function testOperationDocumentHelpers() {
  assert(isSaleOperationGeneratedType('DESISTENCIA'), 'DESISTENCIA é operação');
  assert(isSaleOperationGeneratedType('DESISTENCIA_ASSINADO'), 'assinado é operação');
  assert(!isSaleOperationGeneratedType('PROMISSORY_NOTE'), 'NP não é encerramento');
  assert(
    parseSaleOperationDocumentNumber({
      description: 'Termo de Desistência e Acerto Financeiro nº TD-000000001/2026',
    }) === 'TD-000000001/2026',
    'número na descrição',
  );
  assert(
    parseSaleOperationDocumentNumber({
      original_file_name: 'termo-desistencia-TD-000000009-2026.pdf',
    }) === 'TD-000000009/2026',
    'número no arquivo',
  );
  assert(saleOperationDocumentStatusLabel('DESISTENCIA') === 'Gerado', 'status gerado');
  assert(saleOperationDocumentStatusLabel('DESISTENCIA_ASSINADO') === 'Assinado', 'status assinado');
  assert(
    terminationDocumentViewHref('sale-1').includes('/termination-document?format=html'),
    'visualizar HTML',
  );
  assert(
    terminationDocumentPdfHref('sale-1').includes('/termination-document/pdf'),
    'baixar PDF',
  );
  assert(
    terminationDocumentSignedPdfHref('sale-1').endsWith('/termination-document/signed-pdf'),
    'PDF assinado',
  );
  assert(
    terminationDocumentSignedPdfHref('sale-1', { download: true }).includes('download=1'),
    'download assinado',
  );
  assert(
    preferSaleOperationDocuments([
      { document_type: 'DESISTENCIA' },
      { document_type: 'DESISTENCIA_ASSINADO' },
    ]).map((d) => d.document_type).join(',') === 'DESISTENCIA_ASSINADO,DESISTENCIA',
    'assinado preferencial',
  );
  assert(
    saleOperationDocumentDisplayLabel('DESISTENCIA', { signedArtifactAvailable: true }) ===
      'Documento original',
    'original de auditoria',
  );
  const rows = buildTerminationOperationDocumentRows({
    saleId: 'sale-1',
    documentNumber: 'TD-000000009/2026',
    generatedAt: '2026-08-25T12:00:00Z',
    signedArtifactAvailable: true,
  });
  assert(rows[0]?.role === 'signed', 'versão assinada principal');
  assert(rows[0]?.statusLabel === 'Assinado', 'status assinado');
  assert(rows[1]?.label === 'Documento original', 'original preservado');
  console.log('OK testOperationDocumentHelpers');
}

function main() {
  testCategoriesAndTypes();
  testSystemGeneratedNoUpload();
  testMimeAndSize();
  testStoragePathMultitenant();
  testFormatSize();
  testOperationDocumentHelpers();
  console.log('OK — mandatory-sale-documents-tests passed');
}

main();
