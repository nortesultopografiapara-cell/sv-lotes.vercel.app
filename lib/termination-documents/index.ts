export {
  DESISTENCIA_DOCUMENT_TITLE,
  SALE_DOCUMENT_TYPE_DESISTENCIA,
  type TerminationDocumentOperationType,
  type TerminationDocumentSnapshot,
  type TerminationDocumentStatus,
} from '@/lib/termination-documents/types';
export {
  shouldGenerateTerminationDocument,
  terminationDocumentTitleForType,
} from '@/lib/termination-documents/titles';
export {
  formatSaleOperationDocumentNumber,
  isValidSaleOperationDocumentNumber,
  parseSaleOperationDocumentNumber,
  allocateSaleOperationDocumentNumber,
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
} from '@/lib/termination-documents/numbering';
export {
  splitRefundInstallmentAmounts,
  addCalendarMonths,
  resolveRefundSchedule,
  shouldDefineRefundSchedule,
  formatIsoDateBr,
} from '@/lib/termination-documents/refundSchedule';
export { hashTerminationDocumentHtml } from '@/lib/termination-documents/hash';
export { buildDesistenciaTermHtml } from '@/lib/termination-documents/desistenciaTemplate';
export {
  buildTerminationDocumentSnapshot,
  parseTerminationDocumentSnapshot,
  snapshotFinanceMatchesSettlement,
} from '@/lib/termination-documents/snapshot';
export {
  freezeTerminationDocumentSnapshot,
  materializeTerminationDocumentPdf,
  retryTerminationDocumentPdf,
  loadTerminationDocumentBySale,
  documentViewFromSnapshot,
  TerminationDocumentError,
} from '@/lib/termination-documents/persist';
export { renderTerminationHtmlToPdf, renderTerminationDocumentPdfFromFrozenHtml } from '@/lib/termination-documents/pdf';
export {
  sendTerminationDocumentForSignature,
  getTerminationSignatureView,
  SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO,
} from '@/lib/termination-documents/signature';
