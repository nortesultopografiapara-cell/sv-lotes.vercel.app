export {
  DESISTENCIA_DOCUMENT_TITLE,
  DISTRATO_DOCUMENT_TITLE,
  INADIMPLENCIA_DOCUMENT_TITLE,
  SALE_DOCUMENT_TYPE_DESISTENCIA,
  SALE_DOCUMENT_TYPE_DISTRATO,
  SALE_DOCUMENT_TYPE_DISTRATO_ASSINADO,
  SALE_DOCUMENT_TYPE_INADIMPLENCIA,
  SALE_DOCUMENT_TYPE_INADIMPLENCIA_ASSINADO,
  type TerminationDocumentOperationType,
  type TerminationDocumentSnapshot,
  type TerminationDocumentStatus,
} from '@/lib/termination-documents/types';
export {
  shouldGenerateTerminationDocument,
  terminationDocumentTitleForType,
  isDistratoTerminationOperation,
  isInadimplenciaTerminationOperation,
  terminationShareModalDescription,
  TERMINATION_SHARE_MODAL_HEADING,
  DESISTENCIA_SHARE_MODAL_DESCRIPTION,
  INADIMPLENCIA_SHARE_MODAL_DESCRIPTION,
} from '@/lib/termination-documents/titles';
export {
  formatSaleOperationDocumentNumber,
  isValidSaleOperationDocumentNumber,
  parseSaleOperationDocumentNumber,
  allocateSaleOperationDocumentNumber,
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
  TERMINATION_DOCUMENT_PREFIX_DISTRATO,
  TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA,
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
export { buildDistratoTermHtml } from '@/lib/termination-documents/distratoTemplate';
export { buildInadimplenciaTermHtml } from '@/lib/termination-documents/inadimplenciaTemplate';
export { resolveTerminationDocumentHtmlBuilder } from '@/lib/termination-documents/resolveTemplate';
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
