/**
 * Testes — assinatura eletrônica ARAGUAIA (2 VENDOR PF + BUYER + SPOUSE).
 * npx tsx scripts/mandatory-araguaia-esign-tests.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARAGUAIA_DANIEL_ESIGN_EMAIL,
  ARAGUAIA_ESIGN_VENDORS,
  buildAraguaiaEsignVendorPartyInputs,
  isAraguaiaSaleContractModel,
  resolveAraguaiaEsignVendorPhone,
  sortAraguaiaVendorParties,
} from '../lib/araguaiaContractEsign';
import {
  buildSaleContractSignatureCertificateHtml,
} from '../lib/saleContractSignatureCertificateHtml';
import {
  computeAggregateSaleSignatureStatus,
  canVendorSignFromParties,
  allVendorPartiesSigned,
} from '../lib/saleContractSignaturePartyStatus';
import {
  ensurePartySignatureEventData,
  readPartySignatureEventId,
} from '../lib/saleContractSignatureParties';
import { normalizeWhatsAppPhone } from '../lib/whatsapp/clickToChat';

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log('OK', msg);
}

function testEsignVendorsConfig() {
  const inputs = buildAraguaiaEsignVendorPartyInputs();
  ok(inputs.length === 2, '2 VENDORs ARAGUAIA');
  ok(inputs[0].name.includes('Daniel'), 'Daniel nome');
  ok(inputs[1].name.includes('Aldenise'), 'Aldenise nome');
  ok(inputs[0].cpf.includes('820') || inputs[0].cpf === '82091226220', 'Daniel CPF');
  ok(inputs[1].cpf.includes('856') || inputs[1].cpf === '85656011291', 'Aldenise CPF');
  ok(
    inputs[0].email === ARAGUAIA_DANIEL_ESIGN_EMAIL &&
      inputs[0].email === 'rrnegocioseservicos@gmail.com',
    'Daniel e-mail rrnegocioseservicos@gmail.com',
  );
  ok(inputs[1].email === null, 'Aldenise e-mail NULL');
  ok(
    resolveAraguaiaEsignVendorPhone(ARAGUAIA_ESIGN_VENDORS[0].phoneRaw) ===
      '5594991254320',
    'WhatsApp Daniel 94991254320 → 5594991254320',
  );
  ok(
    resolveAraguaiaEsignVendorPhone(ARAGUAIA_ESIGN_VENDORS[1].phoneRaw) ===
      '5594991252923',
    'WhatsApp Aldenise 94991252923 → 5594991252923',
  );
  ok(
    normalizeWhatsAppPhone('94991254320') === '5594991254320',
    'helper global WhatsApp Daniel',
  );
  ok(
    normalizeWhatsAppPhone('94991252923') === '5594991252923',
    'helper global WhatsApp Aldenise',
  );
  ok(isAraguaiaSaleContractModel('ARAGUAIA'), 'modelo ARAGUAIA');
  ok(!isAraguaiaSaleContractModel('MENESES'), 'não Meneses');
}

function testAggregateMultiVendor() {
  const base = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(base) === 'CLIENT_SIGNED',
    '1 VENDOR pendente → CLIENT_SIGNED (não SIGNED)',
  );
  ok(!allVendorPartiesSigned(base), 'nem todos VENDORs assinaram');

  const all = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(all) === 'SIGNED',
    '2 VENDOR + BUYER → SIGNED',
  );

  const withSpousePendingVendor = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'SPOUSE' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(withSpousePendingVendor) ===
      'CLIENT_SIGNED',
    'com cônjuge e 1 VENDOR pendente → CLIENT_SIGNED',
  );

  const withSpouseAll = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'SPOUSE' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(withSpouseAll) === 'SIGNED',
    '2 VENDOR + BUYER + SPOUSE → SIGNED',
  );

  const onlyDaniel = [
    { role: 'BUYER' as const, status: 'PENDING' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(onlyDaniel) === 'PARTIALLY_SIGNED',
    'só Daniel assinou → PARTIALLY_SIGNED',
  );

  const classic = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(classic) === 'SIGNED',
    '1 VENDOR clássico → SIGNED (regressão)',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      { role: 'BUYER' as const, status: 'SIGNED' },
      { role: 'VENDOR' as const, status: 'PENDING' },
    ]) === 'CLIENT_SIGNED',
    '1 VENDOR clássico pendente → CLIENT_SIGNED',
  );
  ok(
    canVendorSignFromParties([
      { role: 'BUYER' as const, status: 'SIGNED' },
      { role: 'VENDOR' as const, status: 'PENDING' },
    ]).ok,
    'canVendorSign clássico CLIENT_SIGNED',
  );
}

function testCertificatePersonVendors() {
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000001/2026',
    projectName: 'Chacreamento Araguaia',
    quadra: '01',
    lote: '01',
    buyerName: 'Comprador Teste',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    companyName: 'R R Negocios',
    representativeName: 'Ignorar',
    representativeCpf: '000',
    signedAt: '2026-08-20T12:00:00.000Z',
    buyerSignatureEventId: 'buyer-uuid-1111',
    spouseName: 'Conjuge Teste',
    spouseDocument: '22233344405',
    spouseSignedAt: '2026-08-20T12:01:00.000Z',
    spouseSignatureEventId: 'spouse-uuid-2222',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        email: 'rrnegocioseservicos@gmail.com',
        signedAt: '2026-08-20T12:02:00.000Z',
        signatureEventId: 'daniel-uuid-3333',
      },
      {
        name: 'Aldenise Alves Sousa',
        cpf: '85656011291',
        email: null,
        signedAt: '2026-08-20T12:03:00.000Z',
        signatureEventId: 'aldenise-uuid-4444',
      },
    ],
  });
  ok(html.includes('Daniel Roberto Rivelino de Sousa'), 'cert Daniel');
  ok(html.includes('Aldenise Alves Sousa'), 'cert Aldenise');
  ok(html.includes('PROMITENTE VENDEDOR'), 'papel PF');
  ok(!/Empresa[\s\S]{0,40}R R/i.test(html), 'sem EMPRESA no card PF');
  ok(!html.includes('Representante'), 'sem REPRESENTANTE');
  ok(
    html.indexOf('Daniel') < html.indexOf('Aldenise'),
    'ordem Daniel → Aldenise',
  );
  ok(html.includes('daniel-uuid-3333'), 'ID único Daniel');
  ok(html.includes('aldenise-uuid-4444'), 'ID único Aldenise');
  ok(html.includes('buyer-uuid-1111'), 'ID único BUYER');
  ok(html.includes('spouse-uuid-2222'), 'ID único SPOUSE');
  ok(
    !html.match(/ID único da assinatura[\s\S]{0,40}Não informado/i),
    'certificado sem Não informado no ID',
  );
  ok(html.includes('rrnegocioseservicos@gmail.com'), 'e-mail Daniel no cert');
}

function testSignatureEventIdPersistence() {
  const a = ensurePartySignatureEventData({ role: 'VENDOR' });
  const b = ensurePartySignatureEventData({ role: 'BUYER' });
  ok(
    typeof a.signature_event_id === 'string' &&
      String(a.signature_event_id).length > 10,
    'gera UUID',
  );
  ok(a.signature_event_id === a.signature_id, 'alias signature_id');
  ok(a.signature_event_id !== b.signature_event_id, 'UUIDs distintos');
  const reused = ensurePartySignatureEventData({
    signature_event_id: 'fixed-uuid-9999',
  });
  ok(reused.signature_event_id === 'fixed-uuid-9999', 'reutiliza UUID existente');
  ok(
    readPartySignatureEventId({
      id: 'party-row-id',
      signature_data: { signature_event_id: 'evt-1' },
    }) === 'evt-1',
    'lê signature_event_id',
  );
  ok(
    readPartySignatureEventId({
      id: 'party-row-fallback',
      signature_data: {},
    }) === 'party-row-fallback',
    'fallback party.id',
  );
}

function testSortVendors() {
  const sorted = sortAraguaiaVendorParties([
    {
      signer_name: 'Aldenise Alves Sousa',
      signer_cpf: '85656011291',
      created_at: '2026-01-02',
    },
    {
      signer_name: 'Daniel Roberto Rivelino de Sousa',
      signer_cpf: '82091226220',
      created_at: '2026-01-01',
    },
  ]);
  ok(sorted[0].signer_name?.includes('Daniel'), 'sort Daniel primeiro');
  ok(sorted[1].signer_name?.includes('Aldenise'), 'sort Aldenise segundo');
}

function testPartyFlowWiring() {
  const flow = fs.readFileSync(
    path.join(process.cwd(), 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(flow.includes('buildAraguaiaEsignVendorPartyInputs'), 'flow usa esign ARAGUAIA');
  ok(flow.includes('isAraguaiaSaleContractModel'), 'flow gate modelo');
  ok(flow.includes('vendors: araguaiaVendors'), 'cria vendors[]');
  ok(
    flow.includes('resolveSaleContractModelFromContext'),
    'resolve modelo via projeto/contexto',
  );
  ok(
    flow.includes("party.role !== 'VENDOR'") ||
      flow.includes("party.role === 'VENDOR'"),
    'assinatura pública VENDOR',
  );
  ok(
    flow.includes('vendor: araguaiaVendors'),
    'ARAGUAIA não usa seller empresa como único vendor',
  );

  const modal = fs.readFileSync(
    path.join(
      process.cwd(),
      'components/contracts/SaleContractMultiPartyShareModal.tsx',
    ),
    'utf8',
  );
  ok(modal.includes('isPublicVendor'), 'modal compartilha VENDOR com link');
  ok(modal.includes('PROMITENTE VENDEDOR'), 'heading PROMITENTE VENDEDOR');

  const vendorModal = fs.readFileSync(
    path.join(
      process.cwd(),
      'components/contracts/SaleContractVendorSignModal.tsx',
    ),
    'utf8',
  );
  ok(vendorModal.includes('partyId'), 'modal admin com partyId');
  ok(vendorModal.includes('vendorTargets'), 'seletor multi-VENDOR');

  const signRoute = fs.readFileSync(
    path.join(
      process.cwd(),
      'app/api/contracts/[id]/signature/sign-vendor/route.ts',
    ),
    'utf8',
  );
  ok(signRoute.includes('partyId'), 'API sign-vendor partyId');
}

function testIsolationOtherModels() {
  const parties = fs.readFileSync(
    path.join(process.cwd(), 'lib/saleContractSignatureParties.ts'),
    'utf8',
  );
  ok(
    parties.includes('withPublicToken: false') ||
      parties.includes('multiPublic') ||
      parties.includes('params.vendors'),
    'createParties ainda distingue single vs multi',
  );
  ok(
    parties.includes('withPublicToken === true'),
    'force token para VENDOR ARAGUAIA',
  );
  ok(
    parties.includes('ensurePartySignatureEventData'),
    'persiste signature_event_id na party',
  );
}

function main() {
  testEsignVendorsConfig();
  testAggregateMultiVendor();
  testCertificatePersonVendors();
  testSignatureEventIdPersistence();
  testSortVendors();
  testPartyFlowWiring();
  testIsolationOtherModels();
  console.log('mandatory-araguaia-esign-tests: all passed');
}

main();
