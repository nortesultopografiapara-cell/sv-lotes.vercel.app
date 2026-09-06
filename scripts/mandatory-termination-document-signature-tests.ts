/**
 * Fase C — assinatura eletrônica do Termo de Desistência (reuso do motor homologado).
 * npx tsx scripts/mandatory-termination-document-signature-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { toPartyFacingTerminationHtml } from '../lib/termination-documents/partyFacingHtml';
import { terminationSignatureUiStatus } from '../lib/termination-documents/signature';
import {
  canceledOriginalContractBlocksSignature,
  isTerminationSaleSignature,
} from '../lib/saleContractSignatureDocumentType';
import { buildSalePartySignatureShareMessage } from '../lib/saleContractSignatureShare';
import {
  DESISTENCIA_SHARE_MODAL_DESCRIPTION,
  INADIMPLENCIA_SHARE_MODAL_DESCRIPTION,
  TERMINATION_SHARE_MODAL_HEADING,
  terminationShareModalDescription,
} from '../lib/termination-documents/titles';
import { DESISTENCIA_DOCUMENT_TITLE, INADIMPLENCIA_DOCUMENT_TITLE } from '../lib/termination-documents/types';

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
  const sig = read('lib/termination-documents/signature.ts');
  assert(sig.includes('loadHistoricalSaleContractId'), 'e-sign resolve contrato da própria venda');
  assert(!sig.includes('loaded.snapshot.contractId'), 'não usa snapshot cego');
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
  assert(sig.includes('terminationSignedSaleDocumentType'), 'tipo assinado por operação');
  assert(!sig.includes("documentType: SALE_DOCUMENT_TYPE_DESISTENCIA,"), 'não sobrescreve DESISTENCIA');
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
  assert(modal.includes('Desistência concluída com sucesso.'), 'sucesso Desistência no modal');
  assert(
    read('lib/saleDocuments.ts').includes(
      'Termo de Desistência, Rescisão Contratual e Acerto Financeiro',
    ),
    'nomenclatura',
  );
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
  assert(
    terminationShareModalDescription() === DESISTENCIA_SHARE_MODAL_DESCRIPTION,
    'modal de termo sem tipo continua Desistência',
  );
  assert(
    terminationShareModalDescription({ title: DESISTENCIA_DOCUMENT_TITLE }) ===
      DESISTENCIA_SHARE_MODAL_DESCRIPTION,
    'Desistência no modal compartilhado',
  );
  assert(
    terminationShareModalDescription({ title: INADIMPLENCIA_DOCUMENT_TITLE }) ===
      INADIMPLENCIA_SHARE_MODAL_DESCRIPTION,
    'Inadimplência no modal compartilhado',
  );
  assert(TERMINATION_SHARE_MODAL_HEADING === 'Termo enviado para assinatura', 'heading do termo');
  const shareModal = read('components/contracts/SaleContractMultiPartyShareModal.tsx');
  assert(shareModal.includes('terminationShareModalDescription'), 'cópia do modal por tipo');
  assert(
    !shareModal.includes(
      "? 'Termo de Desistência, Rescisão Contratual e Acerto Financeiro. Cada participante possui link e contatos próprios.'",
    ),
    'não hardcoda Desistência para todo termo',
  );
  console.log('OK testUiAndShare');
}

function testPublicPageReuse() {
  const page = read('app/sign/sale/[token]/page.tsx');
  assert(page.includes("documentKind === 'TERMO'"), 'página pública ramifica termo');
  assert(page.includes('Baixar documento assinado'), 'download na página pública');
  console.log('OK testPublicPageReuse');
}

function testCanceledOriginalContractAllowsTermoSignature() {
  assert(
    canceledOriginalContractBlocksSignature({
      signedDocumentType: 'TERMO',
      contractStatus: 'cancelado',
    }) === false,
    'TERMO + original contract cancelled = signature allowed',
  );
  assert(
    canceledOriginalContractBlocksSignature({
      signedDocumentType: 'DESISTENCIA',
      contractStatus: 'cancelled',
    }) === false,
    'alias DESISTENCIA também não bloqueia',
  );
  assert(
    canceledOriginalContractBlocksSignature({
      signedDocumentType: 'CONTRATO_VENDA',
      contractStatus: 'cancelado',
    }) === true,
    'CONTRACT + contract cancelled = signature denied',
  );
  assert(
    canceledOriginalContractBlocksSignature({
      signedDocumentType: null,
      contractStatus: 'canceled',
    }) === true,
    'legado sem tipo = contrato e continua bloqueado',
  );
  assert(
    canceledOriginalContractBlocksSignature({
      signedDocumentType: 'CONTRATO_VENDA',
      contractStatus: 'ativo',
    }) === false,
    'contrato ativo continua permitido',
  );

  const partyFlow = read('lib/saleContractSignaturePartyFlow.ts');
  const service = read('lib/saleContractSignatureService.ts');
  const gate = read('lib/termination-documents/signatureGate.ts');
  assert(
    partyFlow.includes('assertOriginalContractAllowsElectronicSignature'),
    'party pública ramifica vigência do contrato',
  );
  assert(
    service.includes('assertOriginalContractAllowsElectronicSignature'),
    'legado público ramifica vigência do contrato',
  );
  assert(
    service.includes('canceledOriginalContractBlocksSignature'),
    'vendor também ramifica TERMO',
  );
  assert(
    gate.includes("'Contrato cancelado. Assinatura não permitida.'"),
    'mensagem homologada de contrato cancelado permanece',
  );
  assert(
    gate.includes('assertTerminationInstrumentReadyToSign'),
    'TERMO valida settlement/snapshot/documento',
  );
  assert(gate.includes("!== 'EXECUTED'"), 'exige settlement EXECUTED');
  assert(gate.includes('loaded.snapshot'), 'exige snapshot');
  assert(gate.includes('loaded.documentId'), 'exige DESISTENCIA original');
  assert(
    !gate.includes('calculateTerminationSettlement'),
    'gate não recalcula acerto',
  );
  assert(!gate.includes('executeReleaseLot'), 'gate não reexecuta desistência');

  const partyCanceledIdx = partyFlow.indexOf(
    "['CANCELLED', 'EXPIRED', 'ERROR'].includes(partyStatus)",
  );
  const partyGateIdx = partyFlow.indexOf(
    'await assertOriginalContractAllowsElectronicSignature',
  );
  assert(partyCanceledIdx >= 0, 'TERMO expirado/cancelado da party continua bloqueado');
  assert(
    partyCanceledIdx < partyGateIdx,
    'bloqueio próprio do processo/party ocorre antes da vigência do contrato',
  );
  console.log('OK testCanceledOriginalContractAllowsTermoSignature');
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
  testCanceledOriginalContractAllowsTermoSignature();
  console.log('OK — mandatory-termination-document-signature-tests passed');
}

main();
