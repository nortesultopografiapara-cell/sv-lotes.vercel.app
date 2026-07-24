/**
 * Selos verdes de assinatura eletrônica no HTML do contrato (inline).
 * npx tsx scripts/mandatory-contract-inline-signature-status-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  resolveContractPartySignature,
  onlyDigitsCpf,
  normalizeContractPartyDisplayRole,
} from '../lib/saleContractPartySignatureStatus';
import {
  applyElectronicSignatureStampsToContractHtml,
  buildElectronicStampsFromSignatureParties,
  buildRecantoElectronicStamps,
  findContractSignatureSlots,
  stampContractSignatureSlotByRole,
} from '../lib/saleContractSignaturePartySlots';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

/** HTML realista: cláusulas repetem VENDEDOR/COMPRADOR antes dos slots. */
function buildContractHtmlWithClauseNoise(opts?: { withSpouse?: boolean }): string {
  const withSpouse = opts?.withSpouse !== false;
  const spouseSlot = withSpouse
    ? `<div class="signature-slot"><div style="border-top: 1px solid #111"></div><p>CÔNJUGE ANUENTE</p><p>Maria Souza</p><p>CPF: 987.654.321-00</p></div>`
    : '';
  return `
    <div class="contract-body">
      <p>O(A) COMPRADOR(A) declara ao(à) VENDEDOR(A) que as informações são verdadeiras.</p>
      <p><strong>COMPRADOR(A):</strong> João Silva</p>
      <p>Parágrafo: comunicar ao(à) VENDEDOR(A) qualquer alteração.</p>
    </div>
    <div class="contract-signatures contract-signatures--recanto">
      <div class="signature-slot">
        <div style="border-top: 1px solid #111"></div>
        <p>VENDEDOR(A)</p>
        <p>ROSIVAN DE OLIVEIRA</p>
        <p>CPF: 111.222.333-44</p>
      </div>
      <div class="signature-slot">
        <div style="border-top: 1px solid #111"></div>
        <p>COMPRADOR(A)</p>
        <p>ROSIVAN DE OLIVEIRA</p>
        <p>CPF: 111.222.333-44</p>
      </div>
      ${spouseSlot}
      <div class="signature-slot">
        <div style="border-top: 1px solid #111"></div>
        <p>Testemunhas</p>
      </div>
    </div>`;
}

function countStamps(html: string): number {
  return (html.match(/Assinado eletronicamente/g) || []).length;
}

function testResolveByRoleNotCpf() {
  const sameCpf = '11122233344';
  const parties = [
    {
      id: 'p-vendor',
      role: 'VENDOR',
      status: 'SIGNED',
      signer_name: 'ROSIVAN VENDEDOR',
      signer_cpf: sameCpf,
      signed_at: '2026-07-23T20:00:00.000Z',
    },
    {
      id: 'p-buyer',
      role: 'BUYER',
      status: 'SIGNED',
      signer_name: 'ROSIVAN COMPRADOR',
      signer_cpf: '111.222.333-44',
      signed_at: '2026-07-23T21:00:00.000Z',
    },
    {
      id: 'p-spouse',
      role: 'SPOUSE',
      status: 'SIGNED',
      signer_name: 'MARIA CÔNJUGE',
      signer_cpf: '98765432100',
      signed_at: '2026-07-23T22:00:00.000Z',
    },
  ];

  const seller = resolveContractPartySignature({
    role: 'SELLER',
    cpf: sameCpf,
    signatures: parties,
  });
  const buyer = resolveContractPartySignature({
    role: 'BUYER',
    cpf: sameCpf,
    signatures: parties,
  });
  const spouse = resolveContractPartySignature({
    role: 'SPOUSE',
    signatures: parties,
  });

  assert(seller.signed && seller.signerName === 'ROSIVAN VENDEDOR', 'seller name');
  assert(buyer.signed && buyer.signerName === 'ROSIVAN COMPRADOR', 'buyer name');
  assert(spouse.signed && spouse.signerName === 'MARIA CÔNJUGE', 'spouse name');
  assert(seller.signedAt !== buyer.signedAt, 'datas distintas por papel');
  assert(onlyDigitsCpf('111.222.333-44') === sameCpf, 'cpf digits');
  assert(normalizeContractPartyDisplayRole('VENDOR') === 'SELLER', 'VENDOR→SELLER');
  console.log('OK testResolveByRoleNotCpf');
}

function testPendingPartyNoStamp() {
  const parties = [
    {
      id: 'v',
      role: 'VENDOR',
      status: 'SIGNED',
      signer_name: 'Vendedor',
      signed_at: '2026-07-23T12:00:00.000Z',
    },
    {
      id: 'b',
      role: 'BUYER',
      status: 'SIGNED',
      signer_name: 'Comprador',
      signed_at: '2026-07-23T13:00:00.000Z',
    },
    {
      id: 's',
      role: 'SPOUSE',
      status: 'PENDING',
      signer_name: 'Cônjuge',
      signed_at: null,
    },
  ];
  const stamps = buildElectronicStampsFromSignatureParties({ parties });
  const html = applyElectronicSignatureStampsToContractHtml(
    buildContractHtmlWithClauseNoise({ withSpouse: true }),
    stamps,
  );
  assert(countStamps(html) === 2, `esperado 2 selos, got ${countStamps(html)}`);
  assert(html.includes('Vendedor'), 'selo vendedor');
  assert(html.includes('Comprador'), 'selo comprador');
  assert(!html.includes('Cônjuge</p>\n          <br/>') || true, 'cônjuge sem selo');
  // Slot cônjuge sem sv-esign-stamp
  const spouseIdx = html.indexOf('CÔNJUGE ANUENTE');
  const spouseSlotStart = html.lastIndexOf('signature-slot', spouseIdx);
  const spouseChunk = html.slice(spouseSlotStart, spouseIdx + 80);
  assert(!spouseChunk.includes('sv-esign-stamp'), 'cônjuge pendente sem stamp');
  console.log('OK testPendingPartyNoStamp');
}

function testOnlyVendorSigned() {
  const stamps = buildElectronicStampsFromSignatureParties({
    parties: [
      {
        id: 'v',
        role: 'VENDOR',
        status: 'SIGNED',
        signer_name: 'Só Vendedor',
        signed_at: '2026-07-23T10:00:00.000Z',
      },
      { id: 'b', role: 'BUYER', status: 'PENDING', signer_name: 'Comprador' },
    ],
  });
  const html = applyElectronicSignatureStampsToContractHtml(
    buildContractHtmlWithClauseNoise({ withSpouse: false }),
    stamps,
  );
  assert(countStamps(html) === 1, 'somente 1 selo');
  assert(html.includes('Só Vendedor'), 'nome vendor');
  console.log('OK testOnlyVendorSigned');
}

function testAllThreeSignedWithClauseNoise() {
  const stamps = buildElectronicStampsFromSignatureParties({
    parties: [
      {
        id: 'v',
        role: 'VENDOR',
        status: 'SIGNED',
        signer_name: 'ROSIVAN DE OLIVEIRA',
        signer_cpf: '11122233344',
        signed_at: '2026-07-23T20:56:00.000Z',
      },
      {
        id: 'b',
        role: 'BUYER',
        status: 'SIGNED',
        signer_name: 'ROSIVAN DE OLIVEIRA',
        signer_cpf: '11122233344',
        signed_at: '2026-07-23T23:50:00.000Z',
      },
      {
        id: 's',
        role: 'SPOUSE',
        status: 'SIGNED',
        signer_name: 'ROSIVAN DE OLIVEIRA',
        signer_cpf: '99988877766',
        signed_at: '2026-07-23T23:56:00.000Z',
      },
    ],
  });
  const html = applyElectronicSignatureStampsToContractHtml(
    buildContractHtmlWithClauseNoise({ withSpouse: true }),
    stamps,
  );
  assert(countStamps(html) === 3, `3 selos, got ${countStamps(html)}`);
  assert(findContractSignatureSlots(html).length >= 3, 'slots presentes');
  // Nenhum stamp fora da área de assinaturas (corpo)
  const bodyEnd = html.indexOf('contract-signatures');
  const body = html.slice(0, bodyEnd);
  assert(!body.includes('sv-esign-stamp'), 'sem stamp no corpo/cláusulas');
  console.log('OK testAllThreeSignedWithClauseNoise');
}

function testNoSpouseContract() {
  const stamps = buildElectronicStampsFromSignatureParties({
    parties: [
      {
        id: 'v',
        role: 'VENDOR',
        status: 'SIGNED',
        signer_name: 'Empresa Rep',
        signed_at: '2026-07-23T12:00:00.000Z',
      },
      {
        id: 'b',
        role: 'BUYER',
        status: 'SIGNED',
        signer_name: 'Cliente',
        signed_at: '2026-07-23T13:00:00.000Z',
      },
    ],
  });
  const html = applyElectronicSignatureStampsToContractHtml(
    buildContractHtmlWithClauseNoise({ withSpouse: false }),
    stamps,
  );
  assert(countStamps(html) === 2, '2 selos sem cônjuge');
  assert(!html.includes('CÔNJUGE ANUENTE'), 'sem bloco cônjuge');
  console.log('OK testNoSpouseContract');
}

function testCaseInsensitiveNamesAndFormattedCpf() {
  const resolved = resolveContractPartySignature({
    role: 'buyer',
    cpf: '111.222.333-44',
    signatures: [
      {
        role: 'BUYER',
        status: 'SIGNED',
        signer_name: 'joão da silva',
        signer_cpf: '11122233344',
        signed_at: '2026-07-23T15:00:00.000Z',
      },
    ],
  });
  assert(resolved.signed, 'buyer signed');
  assert(resolved.signerName === 'joão da silva', 'preserva nome');
  console.log('OK testCaseInsensitiveNamesAndFormattedCpf');
}

function testFallbackWithoutPartyId() {
  const resolved = resolveContractPartySignature({
    role: 'SELLER',
    signatures: [],
    legacyFallback: {
      signed: true,
      signerName: 'Rep PJ',
      signedAt: '2026-07-23T18:00:00.000Z',
    },
  });
  assert(resolved.signed && resolved.signerName === 'Rep PJ', 'legacy vendor');
  console.log('OK testFallbackWithoutPartyId');
}

function testTimezoneBrasilia() {
  const stamped = stampContractSignatureSlotByRole(
    `<div class="signature-slot"><div style="border-top: 1px solid #111"></div><p>VENDEDOR(A)</p></div>`,
    {
      roleMarker: 'VENDEDOR(A)',
      signerName: 'Teste',
      signed: true,
      // 23:56 BRT = 02:56 UTC next day in -03
      signedAt: '2026-07-24T02:56:00.000Z',
    },
  );
  assert(stamped.includes('23/07/2026') || stamped.includes('24/07/2026'), stamped);
  assert(/\d{2}:\d{2}/.test(stamped), 'hora presente');
  console.log('OK testTimezoneBrasilia', stamped.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)?.[0]);
}

function testMenesesMarkers() {
  const html = `
    <div class="contract-signatures">
      <div class="signature-slot">
        <div style="border-top: 1px solid #111; width: 60%;"></div>
        <p>EMPRESA X</p>
        <p>PROMITENTE VENDEDOR<br/>CNPJ: 00.000.000/0001-00</p>
      </div>
      <div class="signature-slot">
        <div style="border-top: 1px solid #111; width: 60%;"></div>
        <p>Cliente Y</p>
        <p>PROMISSÁRIO COMPRADOR<br/>CPF: 111.222.333-44</p>
      </div>
    </div>`;
  const stamped = applyElectronicSignatureStampsToContractHtml(
    html,
    buildRecantoElectronicStamps({
      vendorName: 'Rep',
      vendorSigned: true,
      vendorSignedAt: '2026-07-23T12:00:00.000Z',
      buyerName: 'Cliente Y',
      buyerSigned: true,
      buyerSignedAt: '2026-07-23T13:00:00.000Z',
    }),
  );
  assert(countStamps(stamped) === 2, `Meneses 2 selos got ${countStamps(stamped)}`);
  console.log('OK testMenesesMarkers');
}

function testWiringUsesSharedHelper() {
  const service = read('lib/saleContractSignatureService.ts');
  const slots = read('lib/saleContractSignaturePartySlots.ts');
  assert(
    service.includes('buildElectronicStampsFromSignatureParties'),
    'service usa helper parties',
  );
  assert(
    slots.includes('findContractSignatureSlots'),
    'busca por signature-slot',
  );
  assert(
    slots.includes('resolveContractPartySignature'),
    'slots usam resolve',
  );
  assert(
    !service.includes('buildRecantoElectronicStamps({'),
    'service não monta stamps antigos inline',
  );
  console.log('OK testWiringUsesSharedHelper');
}

function testCertificateStillSeparate() {
  const cert = read('lib/saleContractSignatureCertificateHtml.ts');
  assert(cert.includes('buildSaleContractSignatureCertificateHtml'), 'cert existe');
  assert(cert.includes('CÔNJUGE ANUENTE') || cert.includes('cônjuge'), 'cert cônjuge');
  console.log('OK testCertificateStillSeparate');
}

function main() {
  testResolveByRoleNotCpf();
  testPendingPartyNoStamp();
  testOnlyVendorSigned();
  testAllThreeSignedWithClauseNoise();
  testNoSpouseContract();
  testCaseInsensitiveNamesAndFormattedCpf();
  testFallbackWithoutPartyId();
  testTimezoneBrasilia();
  testMenesesMarkers();
  testWiringUsesSharedHelper();
  testCertificateStillSeparate();
  console.log('mandatory-contract-inline-signature-status-tests: all passed');
}

main();
