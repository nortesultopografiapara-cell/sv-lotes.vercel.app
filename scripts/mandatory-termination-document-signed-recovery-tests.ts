/**
 * Fase C.1 — recuperação permanente do documento assinado da desistência.
 * Não gera novo settlement, assinatura, hash ou numeração.
 * npx tsx scripts/mandatory-termination-document-signed-recovery-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildTerminationOperationDocumentRows,
  preferSaleOperationDocuments,
  terminationDocumentMetaHref,
  terminationDocumentSignedPdfHref,
  terminationDocumentViewHref,
} from '../lib/saleDocuments';
import {
  lotHistoryTerminationDocumentLinks,
  lotHistoryTerminationSaleIds,
} from '../lib/lotHistoryPresentation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testDoesNotOverwriteOriginal() {
  const persist = read('lib/termination-documents/persist.ts');
  const signature = read('lib/termination-documents/signature.ts');
  assert(persist.includes('SALE_DOCUMENT_TYPE_DESISTENCIA'), 'original DESISTENCIA');
  assert(!persist.includes("document_type: 'DESISTENCIA_ASSINADO'"), 'persist não vira assinado');
  assert(signature.includes('SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO'), 'segundo documento');
  assert(signature.includes('findExistingSignedTerminationDocument'), 'reusa assinado existente');
  assert(signature.includes('createSystemGeneratedSaleDocumentMetadata'), 'grava segundo sale_documents');
  assert(!signature.includes("document_type: SALE_DOCUMENT_TYPE_DESISTENCIA,"), 'não sobrescreve original');
  console.log('OK testDoesNotOverwriteOriginal');
}

function testLocateBySaleIdNotBlockSaleId() {
  const signedPdf = read('app/api/sales/[saleId]/termination-document/signed-pdf/route.ts');
  const getTerm = read('app/api/sales/[saleId]/termination-document/route.ts');
  const history = read('components/map/LotHistoryPanel.tsx');
  const gis = read('components/map/GISMap.tsx');
  assert(signedPdf.includes("eq('sale_id', saleId)"), 'signed-pdf por sale_id');
  assert(signedPdf.includes("eq('company_id', ctx.companyId)"), 'tenant isolation signed-pdf');
  assert(signedPdf.includes("DESISTENCIA_ASSINADO"), 'tipo assinado');
  assert(getTerm.includes('signedArtifactAvailable'), 'GET informa artefato assinado');
  assert(getTerm.includes("meta") && getTerm.includes('signedArtifactAvailable'), 'meta leve');
  assert(getTerm.includes('assertSaleDocumentSaleAccess'), 'GET com tenant isolation');
  assert(history.includes('lotHistoryTerminationSaleIds'), 'histórico pelos eventos');
  assert(history.includes('terminationDocumentMetaHref'), 'resolve pelo sale_id do evento');
  assert(!history.includes('lot.saleId'), 'histórico não usa lote.saleId');
  assert(!history.includes("blocks.sale_id"), 'histórico não usa blocks.sale_id');
  assert(gis.includes('getLotAuditHistory(supabase, lot.id, 50)'), 'auditoria pelo lote');
  assert(gis.includes('<LotHistoryPanel'), 'GIS usa o painel');
  assert(!gis.includes('LotHistoryPanel saleId='), 'não passa sale_id do lote');
  console.log('OK testLocateBySaleIdNotBlockSaleId');
}

function testDoesNotCreateNewArtifacts() {
  const signedPdf = read('app/api/sales/[saleId]/termination-document/signed-pdf/route.ts');
  const getTerm = read('app/api/sales/[saleId]/termination-document/route.ts');
  const history = read('components/map/LotHistoryPanel.tsx');
  const section = read('components/sales/TerminationOperationDocumentsSection.tsx');
  assert(signedPdf.includes('createSaleDocumentSignedUrl'), 'reusa arquivo persistido');
  assert(!signedPdf.includes('renderTerminationHtmlToPdf'), 'não gera PDF novo');
  assert(!signedPdf.includes('freezeTerminationDocumentSnapshot'), 'não recongela');
  assert(!getTerm.includes('executeReleaseLot'), 'GET não reexecuta');
  assert(!history.includes('executeReleaseLot'), 'histórico não reexecuta');
  assert(!section.includes('executeReleaseLot'), 'seção não reexecuta');
  assert(!section.includes('sendTerminationDocumentForSignature'), 'não cria assinatura');
  console.log('OK testDoesNotCreateNewArtifacts');
}

function testHistoryPrefersSignedPdfRoute() {
  const unsigned = lotHistoryTerminationDocumentLinks({
    action: 'sale_cancelled',
    saleId: 'sale-closed',
    motiveCode: 'desistencia',
  });
  assert(unsigned?.signed === false, 'não assinado');
  assert(unsigned?.viewHref === terminationDocumentViewHref('sale-closed'), 'original HTML');
  const signed = lotHistoryTerminationDocumentLinks(
    {
      action: 'sale_cancelled',
      saleId: 'sale-closed',
      motiveCode: 'desistencia',
    },
    { signed: true },
  );
  assert(signed?.signedPdfHref === terminationDocumentSignedPdfHref('sale-closed'), 'rota signed-pdf');
  assert(
    signed?.signedPdfDownloadHref ===
      terminationDocumentSignedPdfHref('sale-closed', { download: true }),
    'download signed-pdf',
  );
  assert(
    lotHistoryTerminationSaleIds([
      { action: 'sale_cancelled', saleId: 'sale-closed', motiveCode: 'desistencia' },
    ])[0] === 'sale-closed',
    'sale_id preservado no evento',
  );
  const panel = read('components/map/LotHistoryPanel.tsx');
  assert(panel.includes('Ver documento'), 'não assinado: Ver documento');
  assert(panel.includes('Visualizar documento assinado'), 'assinado: visualizar');
  assert(panel.includes('Baixar PDF assinado'), 'assinado: baixar');
  assert(panel.includes('termLinks.signedPdfHref'), 'abre signed-pdf');
  assert(panel.includes('Documento original'), 'original de auditoria');
  console.log('OK testHistoryPrefersSignedPdfRoute');
}

function testCancelledContractRecovery() {
  const page = read('app/contracts/page.tsx');
  const section = read('components/sales/TerminationOperationDocumentsSection.tsx');
  const panel = read('components/sales/SaleDocumentsPanel.tsx');
  assert(page.includes('TerminationOperationDocumentsSection'), 'contrato histórico tem seção');
  assert(page.includes('selectedContract.sale_id'), 'recupera pelo sale_id do contrato');
  assert(!page.includes('blocks.sale_id'), 'não depende de blocks.sale_id');
  assert(section.includes('Documentos da Operação'), 'título da seção');
  assert(section.includes('buildTerminationOperationDocumentRows'), 'lista termo existente');
  assert(section.includes('terminationDocumentMetaHref'), 'lê meta do termo');
  assert(panel.includes('preferSaleOperationDocuments'), 'painel prioriza assinado');
  assert(panel.includes('terminationDocumentSignedPdfHref'), 'painel usa signed-pdf');
  assert(panel.includes('Documento original') || panel.includes('saleOperationDocumentDisplayLabel'), 'original rotulado');
  const rows = buildTerminationOperationDocumentRows({
    saleId: 'sale-closed',
    documentNumber: 'TD-000000009/2026',
    generatedAt: '2026-08-25T12:00:00.000Z',
    signedArtifactAvailable: true,
  });
  assert(rows[0]?.documentNumber === 'TD-000000009/2026', 'número TD');
  assert(rows[0]?.viewHref.includes('/termination-document/signed-pdf'), 'principal assinado');
  assert(rows[1]?.viewHref.includes('format=html'), 'original HTML');
  assert(
    preferSaleOperationDocuments([
      { document_type: 'DESISTENCIA', id: 'a' },
      { document_type: 'DESISTENCIA_ASSINADO', id: 'b' },
    ])[0]?.id === 'b',
    'assinado primeiro',
  );
  console.log('OK testCancelledContractRecovery');
}

function testDoesNotReactivateSale() {
  const page = read('app/contracts/page.tsx');
  const section = read('components/sales/TerminationOperationDocumentsSection.tsx');
  assert(page.includes('Contrato cancelado: somente histórico.'), 'contrato permanece histórico');
  assert(!section.includes('executeReleaseLot'), 'não reabre desistência');
  assert(!section.includes('needs_regenerar'), 'não regenera contrato');
  assert(!page.includes('status: "ativo"') || page.includes('cancelado'), 'página ainda trata cancelado');
  console.log('OK testDoesNotReactivateSale');
}

function testMetaHrefAndSignedPdfDownload() {
  assert(
    terminationDocumentMetaHref('sale-1').includes('meta=1'),
    'meta não devolve HTML congelado em massa',
  );
  const signedPdf = read('app/api/sales/[saleId]/termination-document/signed-pdf/route.ts');
  assert(signedPdf.includes("download") && signedPdf.includes('attachment'), 'download sem gerar PDF');
  assert(signedPdf.includes('SIGNED_PDF_NOT_READY'), '409 se ainda não assinado');
  console.log('OK testMetaHrefAndSignedPdfDownload');
}

function main() {
  testDoesNotOverwriteOriginal();
  testLocateBySaleIdNotBlockSaleId();
  testDoesNotCreateNewArtifacts();
  testHistoryPrefersSignedPdfRoute();
  testCancelledContractRecovery();
  testDoesNotReactivateSale();
  testMetaHrefAndSignedPdfDownload();
  console.log('OK — mandatory-termination-document-signed-recovery-tests passed');
}

main();
