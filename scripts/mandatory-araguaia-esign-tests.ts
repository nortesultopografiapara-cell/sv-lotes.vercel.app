/**
 * Testes — assinatura eletrônica ARAGUAIA (2 VENDOR PF + BUYER + SPOUSE).
 * npx tsx scripts/mandatory-araguaia-esign-tests.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
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
  ok(inputs[0].email === null && inputs[1].email === null, 'e-mail NULL');
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

  const withSpousePartial = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'SPOUSE' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(withSpousePartial) === 'CLIENT_SIGNED',
    'com cônjuge e 1 VENDOR pendente → CLIENT_SIGNED',
  );

  const withSpouseComplete = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'SPOUSE' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(withSpouseComplete) === 'SIGNED',
    '2 VENDOR + BUYER + SPOUSE → SIGNED',
  );

  const danielFirst = [
    { role: 'BUYER' as const, status: 'PENDING' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(danielFirst) === 'PARTIALLY_SIGNED',
    'só Daniel assinou → PARTIALLY_SIGNED',
  );

  const singleVendor = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(singleVendor) === 'SIGNED',
    '1 VENDOR clássico → SIGNED (regressão)',
  );

  const singlePending = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(singlePending) === 'CLIENT_SIGNED',
    '1 VENDOR clássico pendente → CLIENT_SIGNED',
  );

  const gate = canVendorSignFromParties(singlePending);
  ok(gate.ok, 'canVendorSign clássico CLIENT_SIGNED');
}

function testCertificatePersonVendors() {
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000001/2026',
    projectName: 'Chacreamento Araguaia',
    quadra: '02',
    lote: '54',
    buyerName: 'Maria Clara',
    buyerDocument: '39053344705',
    companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
    companyCnpj: '57590706000178',
    representativeName: 'Daniel Roberto Rivelino de Sousa',
    representativeCpf: '82091226220',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signedAt: '2026-08-20T15:00:00.000Z',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        phone: '94991254320',
        email: null,
        signedAt: '2026-08-20T14:00:00.000Z',
      },
      {
        name: 'Aldenise Alves Sousa',
        cpf: '85656011291',
        phone: '94991252923',
        email: null,
        signedAt: '2026-08-20T14:30:00.000Z',
      },
    ],
  });

  ok(html.includes('Daniel Roberto Rivelino de Sousa'), 'cert Daniel');
  ok(html.includes('Aldenise Alves Sousa'), 'cert Aldenise');
  ok(html.includes('PROMITENTE VENDEDOR'), 'papel PF');
  ok(!html.includes('Empresa'), 'sem EMPRESA no card PF');
  ok(!html.includes('Representante'), 'sem REPRESENTANTE');
  const danielIdx = html.indexOf('Daniel Roberto');
  const aldeniseIdx = html.indexOf('Aldenise');
  ok(danielIdx >= 0 && aldeniseIdx > danielIdx, 'ordem Daniel → Aldenise');
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
    flow.includes("party.role !== 'VENDOR'") ||
      flow.includes("party.role === 'VENDOR'"),
    'assinatura pública VENDOR',
  );
  ok(!/normalizeSellerFromCompany\(company\)[\s\S]{0,200}araguaiaVendors/.test(flow) ||
    flow.includes('vendor: araguaiaVendors'), 'ARAGUAIA não usa seller empresa como único vendor');
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
}

function main() {
  testEsignVendorsConfig();
  testAggregateMultiVendor();
  testCertificatePersonVendors();
  testSortVendors();
  testPartyFlowWiring();
  testIsolationOtherModels();
  console.log('mandatory-araguaia-esign-tests: all passed');
}

main();
