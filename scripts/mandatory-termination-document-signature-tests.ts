/**
 * Fase C — assinatura eletrônica do Termo de Desistência (reuso do motor homologado).
 * npx tsx scripts/mandatory-termination-document-signature-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { toPartyFacingTerminationHtml } from '../lib/termination-documents/partyFacingHtml';
import { terminationSignatureUiStatus } from '../lib/termination-documents/signature';
import { isTerminationSaleSignature } from '../lib/saleContractSignatureDocumentType';
import { buildSalePartySignatureShareMessage } from '../lib/saleContractSignatureShare';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function testReuseNotSecondEngine() {
  const sig = read('lib/termination-documents/signature.ts');
  const sendSale = read('lib/saleContractSignatureService.ts');
  assert(sig.includes("signed_document_type: TERMINATION_SIGNED_DOCUMENT_TYPE"), 'tipo TERMO');
  assert(sig.includes('createPartiesForSignatureProcess'), 'reusa parties');
  assert(sig.includes('buildSaleSignUrl'), 'reusa /sign/sale');
  assert(sig.includes('pickCustomerPhoneForSignature'), 'reusa contato homologado');
  assert(sig.includes("spouse: null"), 'sem cônjuge no termo');
  assert(sig.includes('intervenient: null'), 'sem interveniente');
  assert(sig.includes('witnesses: null'), 'sem testemunhas');
  assert(!sig.includes('sendSaleContractForSignature('), 'não chama send do contrato');
  assert(sendSale.includes('isTerminationSaleSignature(signatureRow)'), 'PDF assinado ramifica TERMO');
  assert(sendSale.includes('excludeTerminationSignatures'), 'listagem do contrato ignora TERMO');
  const disc = read('lib/saleContractSignatureDocumentType.ts');
  assert(disc.includes('export function excludeTerminationSignatures'), 'helper exportado');
  console.log('OK testReuseNotSecondEngine');
}

function testDoesNotRecalculateOrRerun() {
  const sig = read('lib/termination-documents/signature.ts');
  assert(!sig.includes('calculateTerminationSettlement'), 'não recalcula settlement');
  assert(!sig.includes('prepareReleaseSettlement'), 'não prepara settlement');
  assert(!sig.includes('executeReleaseLot'), 'não reexecuta desistência');
  assert(!sig.includes('freezeTerminationDocumentSnapshot'), 'não recongela');
  const persist = read('lib/termination-documents/persist.ts');
  assert(!persist.includes('saleContractSignatureService'), 'persist documental intacto');
  console.log('OK testDoesNotRecalculateOrRerun');
}

function testOriginalContractIsolation() {
  const partyFlow = read('lib/saleContractSignaturePartyFlow.ts');
  const service = read('lib/saleContractSignatureService.ts');
  assert(partyFlow.includes('isTerminationSaleSignature(signature)'), 'aggregate não espelha contrato');
  assert(service.includes('if (isTerminationSaleSignature(signature)) return;'), 'mirror pulado');
  assert(service.includes("persistSignedTerminationPdf"), 'artefato do termo, não pdf_signed_url do contrato');
  const api = read('app/api/sales/[saleId]/termination-document/signature/route.ts');
  assert(api.includes('sendTerminationDocumentForSignature'), 'API própria do termo');
  assert(!api.includes('sendSaleContractForSignature'), 'não usa POST de contrato');
  console.log('OK testOriginalContractIsolation');
}

function testStatusMachine() {
  assert(terminationSignatureUiStatus(null).label === 'Gerado', 'sem processo = Gerado');
  assert(terminationSignatureUiStatus('PENDING').label === 'Enviado para assinatura', 'PENDING');
  assert(terminationSignatureUiStatus('VIEWED').label === 'Enviado para assinatura', 'VIEWED');
  assert(terminationSignatureUiStatus('PARTIALLY_SIGNED').label === 'Parcialmente assinado', 'parcial');
  assert(terminationSignatureUiStatus('CLIENT_SIGNED').label === 'Parcialmente assinado', 'client_signed');
  assert(terminationSignatureUiStatus('SIGNED').label === 'Assinado', 'assinado');
  console.log('OK testStatusMachine');
}

function testDocumentTypeDiscriminator() {
  assert(isTerminationSaleSignature({ signed_document_type: 'TERMO' }), 'TERMO');
  assert(!isTerminationSaleSignature({ signed_document_type: 'CONTRATO_VENDA' }), 'contrato');
  assert(!isTerminationSaleSignature({ signed_document_type: null }), 'null = contrato legado');
  console.log('OK testDocumentTypeDiscriminator');
}

function testPartyFacingOverlayDoesNotRewriteHashSource() {
  const frozen =
    'conforme a política congelada na venda (araguaia.clause3.item8.v1; Cláusula 3)';
  const over = toPartyFacingTerminationHtml(frozen, {
    contractNumber: '000000007/2026',
    clauseReference: 'Cláusula 3 — itens 6 a 9',
  });
  assert(!over.includes('araguaia.clause3.item8.v1'), 'overlay remove código');
  assert(over.includes('contrato original'), 'cita contrato original');
  assert(over.includes('Cláusula 3'), 'cita cláusula');
  assert(frozen.includes('araguaia.clause3.item8.v1'), 'original congelado intacto');
  console.log('OK testPartyFacingOverlayDoesNotRewriteHashSource');
}

function testSignedArtifactSeparate() {
  const sig = read('lib/termination-documents/signature.ts');
  assert(sig.includes("SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO"), 'tipo assinado');
  assert(sig.includes("document_type', SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO"), 'não sobrescreve DESISTENCIA');
  assert(sig.includes('assertFrozenHtmlUnchanged'), 'valida HTML congelado antes do overlay');
  const publicRoute = read('app/api/sign/sale/[token]/route.ts');
  assert(publicRoute.includes('loadTerminationPdfForSign'), 'página pública ramifica TERMO');
  assert(publicRoute.includes('loadSaleContractPdfForSign'), 'contrato permanece no mesmo endpoint');
  console.log('OK testSignedArtifactSeparate');
}

function testUiAndShare() {
  const modal = read('components/map/ReleaseLotConfirmModal.tsx');
  const actions = read('components/map/TerminationDocumentSignatureActions.tsx');
  const panel = read('components/sales/SaleDocumentsPanel.tsx');
  assert(actions.includes('Enviar para assinatura'), 'botão enviar');
  assert(actions.includes('Baixar documento assinado'), 'download assinado');
  assert(actions.includes('instrument="termination"'), 'share do termo');
  assert(modal.includes('Termo de Desistência, Rescisão Contratual e Acerto Financeiro'), 'nomenclatura');
  assert(panel.includes('Baixar documento assinado'), 'painel documentos');
  const msg = buildSalePartySignatureShareMessage({
    signerName: 'Cliente',
    role: 'BUYER',
    projectName: 'Homolog',
    quadra: '01',
    lote: '02',
    contractNumber: '000000007/2026',
    signatureUrl: 'https://preview.vercel.app/sign/sale/token-abc',
    instrument: 'termination',
  });
  assert(msg.includes('Termo de Desistência, Rescisão Contratual e Acerto Financeiro'), 'whatsapp termo');
  assert(msg.includes('comprador/desistente'), 'papel comprador');
  assert(msg.includes('www.svlotes.com.br/sign/sale/'), 'domínio oficial');
  const contractMsg = buildSalePartySignatureShareMessage({
    signerName: 'Cliente',
    role: 'BUYER',
    projectName: 'Homolog',
    quadra: '01',
    lote: '02',
    contractNumber: '000000007/2026',
    signatureUrl: 'https://www.svlotes.com.br/sign/sale/token-abc',
  });
  assert(contractMsg.includes('contrato de compra e venda'), 'share de contrato intacto');
  console.log('OK testUiAndShare');
}

function testPublicPageReuse() {
  const page = read('app/sign/sale/[token]/page.tsx');
  assert(page.includes("documentKind === 'TERMO'"), 'página pública ramifica termo');
  assert(page.includes('Baixar documento assinado'), 'download na página pública');
  console.log('OK testPublicPageReuse');
}

function main() {
  testReuseNotSecondEngine();
  testDoesNotRecalculateOrRerun();
  testOriginalContractIsolation();
  testStatusMachine();
  testDocumentTypeDiscriminator();
  testPartyFacingOverlayDoesNotRewriteHashSource();
  testSignedArtifactSeparate();
  testUiAndShare();
  testPublicPageReuse();
  console.log('OK — mandatory-termination-document-signature-tests passed');
}

main();
