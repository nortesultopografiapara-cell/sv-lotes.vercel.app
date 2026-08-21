/**
 * Etapa 5 — ARAGUAIA PDF PHYSICAL_UNSIGNED × ELECTRONIC_SIGNED.
 * Somente código local + fixtures. ZERO remoto.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAraguaiaSignaturesHtml,
  type BuildAraguaiaSignaturesHtmlOptions,
} from '../lib/araguaiaContractParties';
import type { AraguaiaContractContext } from '../lib/araguaiaContractContext';
import {
  applyAraguaiaElectronicSignaturesToContractHtml,
  buildAraguaiaElectronicSignatureSlotsFromParties,
  buildAraguaiaElectronicSignaturesBlockHtml,
} from '../lib/araguaiaContractElectronicSignatures';
import {
  isAraguaiaEsignV2PersistEnabled,
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  buildAraguaiaIntervenientSignatureData,
} from '../lib/araguaiaContractEsign';
import {
  canProduceElectronicSignedContractDocument,
  resolveSaleContractDownloadArtifactKind,
  shouldBlockUnsignedFallbackAfterElectronicSign,
} from '../lib/saleContractSignatureRenderMode';
import { computeAggregateSaleSignatureStatus } from '../lib/saleContractSignaturePartyStatus';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { resolvePortalContractPdfAvailability } from '../lib/portal-cliente/contractDownload';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();
const fixturesDir = join(root, 'scripts', '_fixtures', 'araguaia-esign-v2');

function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function snap(role: string, status: string) {
  return {
    role: role as
      | 'BUYER'
      | 'VENDOR'
      | 'INTERVENIENT'
      | 'WITNESS_1'
      | 'WITNESS_2',
    status,
  };
}

function mockCtx(): AraguaiaContractContext {
  return {
    sellers: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '820.912.262-20',
        nationality: 'Brasileiro',
        maritalStatus: 'Casado',
        profession: 'Empresário',
        address: 'Endereço',
      },
      {
        name: 'Aldenise Sousa Rivelino',
        cpf: '856.560.112-91',
        nationality: 'Brasileira',
        maritalStatus: 'Casada',
        profession: 'Empresária',
        address: 'Endereço',
      },
    ],
    intervenienteName: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
    intervenienteCnpj: '57.590.706/0001-78',
    intervenienteAddress: 'Endereço',
    intervenienteCityUf: 'Parauapebas/PA',
    intervenienteRepresentativeName: 'Daniel Roberto Rivelino de Sousa',
    intervenienteRepresentativeCpf: '82091226220',
    buyerName: 'Comprador Teste Silva',
    buyerNationality: 'Brasileira',
    buyerMaritalStatus: 'Solteiro',
    buyerProfession: 'Autônomo',
    buyerCpf: '111.444.777-35',
    buyerRgLine: '',
    buyerEmail: 'buyer@example.com',
    buyerPhone: '94990000000',
    buyerAddress: 'Rua A',
    hasSpouse: false,
    spouseQualificationHtml: '',
    spouseName: '',
    spouseCpf: '',
    chacaraNumber: '01',
    quadra: '01',
    areaFmt: '1.000,00',
    areaExtenso: 'mil',
    frenteM: '20,00',
    fundoM: '20,00',
    ladoDireitoM: '50,00',
    ladoEsquerdoM: '50,00',
    frenteMExtenso: '',
    fundoMExtenso: '',
    ladoDireitoMExtenso: '',
    ladoEsquerdoMExtenso: '',
    confrontanteFrente: 'Rua',
    confrontanteFundo: 'Lote',
    confrontanteDireita: 'Lote',
    confrontanteEsquerda: 'Lote',
    streetName: 'Rua Principal',
    lotDescriptionHtml: '',
    priceFmt: 'R$ 50.000,00',
    priceExtenso: '',
    entryFmt: 'R$ 5.000,00',
    entryExtenso: '',
    entryDueDateBr: '01/01/2026',
    installmentCount: 10,
    installmentValueFmt: 'R$ 4.500,00',
    installmentValueExtenso: '',
    firstInstallmentDueBr: '01/02/2026',
    correctionLabel: 'INCC',
    brokerName: 'Corretor',
    closingLine: 'Parauapebas/PA, 21 de agosto de 2026.',
    pendingFields: [],
  } as unknown as AraguaiaContractContext;
}

function mockParty(
  partial: Partial<ContractSignaturePartyRow> & {
    id: string;
    role: ContractSignaturePartyRow['role'];
  },
): ContractSignaturePartyRow {
  return {
    company_id: 'c1',
    contract_signature_id: 'sig1',
    contract_id: 'ct1',
    sale_id: null,
    signer_name: null,
    signer_cpf: null,
    signer_phone: null,
    signer_email: null,
    signature_token_hash: null,
    signature_url: null,
    status: 'SIGNED',
    sent_at: null,
    viewed_at: null,
    signed_at: '2026-08-21T12:00:00.000Z',
    cancelled_at: null,
    expires_at: null,
    signature_hash: null,
    ip_address: null,
    user_agent: null,
    signature_data: {},
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T12:00:00.000Z',
    ...partial,
  };
}

const sixParties = [
  mockParty({
    id: 'v1',
    role: 'VENDOR',
    signer_name: 'Daniel Roberto Rivelino de Sousa',
    signer_cpf: '82091226220',
    signature_data: { signature_event_id: 'evt-daniel' },
  }),
  mockParty({
    id: 'v2',
    role: 'VENDOR',
    signer_name: 'Aldenise Sousa Rivelino',
    signer_cpf: '85656011291',
    signature_data: { signature_event_id: 'evt-aldenise' },
  }),
  mockParty({
    id: 'b1',
    role: 'BUYER',
    signer_name: 'Comprador Teste Silva',
    signer_cpf: '11144477735',
    signature_data: { signature_event_id: 'evt-buyer' },
  }),
  mockParty({
    id: 'i1',
    role: 'INTERVENIENT',
    signer_name: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
    signer_cpf: '57590706000178',
    signature_data: {
      ...buildAraguaiaIntervenientSignatureData(),
      signature_event_id: 'evt-intervenient',
    },
  }),
  mockParty({
    id: 'w1',
    role: 'WITNESS_1',
    signer_name: 'Testemunha Um Real',
    signer_cpf: '39053344705',
    signature_data: { signature_event_id: 'evt-w1' },
  }),
  mockParty({
    id: 'w2',
    role: 'WITNESS_2',
    signer_name: 'Testemunha Dois Real',
    signer_cpf: '52998224725',
    signature_data: { signature_event_id: 'evt-w2' },
  }),
];

console.log('\n=== A/B/C) PHYSICAL_UNSIGNED ===');
{
  const unsigned = buildAraguaiaSignaturesHtml(mockCtx(), {
    signatureMode: 'PHYSICAL_UNSIGNED',
  } as BuildAraguaiaSignaturesHtmlOptions);
  ok(/signature-line/i.test(unsigned), 'A: linhas físicas presentes');
  ok(/PROMITENTE VENDEDOR/i.test(unsigned), 'VENDOR label');
  ok(unsigned.includes('Daniel Roberto Rivelino de Sousa'), 'Daniel');
  ok(unsigned.includes('Aldenise Sousa Rivelino'), 'Aldenise');
  ok(/PROMITENTE COMPRADOR/i.test(unsigned), 'BUYER');
  ok(/INTERVENIENTE/i.test(unsigned), 'INTERVENIENTE');
  ok(/TESTEMUNHA 1/i.test(unsigned), 'TESTEMUNHA 1');
  ok(/TESTEMUNHA 2/i.test(unsigned), 'TESTEMUNHA 2');
  ok(
    (unsigned.match(/PROMITENTE VENDEDOR/gi) || []).length >= 2,
    'B: 2 VENDOR',
  );
  ok(
    !/ASSINADO ELETRONICAMENTE/i.test(unsigned),
    'C: sem cards eletrônicos',
  );
  ok(
    unsigned.includes('data-signature-mode="PHYSICAL_UNSIGNED"'),
    'modo PHYSICAL no HTML',
  );
  ok(!/SPOUSE|CÔNJUGE ANUENTE/i.test(unsigned), 'Q: sem SPOUSE');
}

console.log('\n=== D–I) ELECTRONIC_SIGNED ===');
{
  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(sixParties);
  ok(slots.length === 6, 'E: 6 slots');
  const electronic = buildAraguaiaElectronicSignaturesBlockHtml(slots);
  ok(!/class="signature-line"/i.test(electronic), 'D: sem linhas físicas');
  ok(/ASSINADO ELETRONICAMENTE/i.test(electronic), 'badge eletrônico');
  ok(electronic.includes('Daniel Roberto Rivelino de Sousa'), 'Daniel PF');
  ok(electronic.includes('Aldenise Sousa Rivelino'), 'Aldenise');
  ok(electronic.includes('Comprador Teste Silva'), 'buyer');
  ok(
    electronic.includes('R R NEG') && /CNPJ/i.test(electronic),
    'F: INTERVENIENTE empresa+CNPJ',
  );
  ok(/Representada por/i.test(electronic), 'F: representante');
  ok(electronic.includes('Testemunha Um Real'), 'G: WITNESS_1 identidade');
  ok(electronic.includes('Testemunha Dois Real'), 'H: WITNESS_2 identidade');
  ok(electronic.includes('evt-daniel'), 'I: ID Daniel');
  ok(electronic.includes('evt-aldenise'), 'I: ID Aldenise');
  ok(electronic.includes('evt-buyer'), 'I: ID buyer');
  ok(electronic.includes('evt-intervenient'), 'I: ID intervenient');
  ok(electronic.includes('evt-w1') && electronic.includes('evt-w2'), 'I: IDs W');

  const wrapped = `
    <div class="sv-contract-araguaia">
      <div class="contract-signatures contract-signatures--araguaia">
        <div class="signature-line"></div>
        <p>PROMITENTE VENDEDOR</p>
      </div>
    </div>`;
  const replaced = applyAraguaiaElectronicSignaturesToContractHtml(
    wrapped,
    sixParties,
  );
  ok(!/class="signature-line"/i.test(replaced), 'replace remove linhas físicas');
  ok(/ASSINADO ELETRONICAMENTE/i.test(replaced), 'replace injeta eletrônico');
}

console.log('\n=== J/K) Gate 6/6 ===');
{
  const five = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('INTERVENIENT', 'SIGNED'),
    snap('WITNESS_1', 'SIGNED'),
    snap('WITNESS_2', 'PENDING'),
  ];
  const agg5 = computeAggregateSaleSignatureStatus(five);
  ok(agg5 !== 'SIGNED', 'J: 5/6 não SIGNED');
  ok(!canProduceElectronicSignedContractDocument(agg5), 'J: não gera final');

  const six = five.map((p) =>
    p.role === 'WITNESS_2' ? snap('WITNESS_2', 'SIGNED') : p,
  );
  const agg6 = computeAggregateSaleSignatureStatus(six);
  ok(agg6 === 'SIGNED', 'K: 6/6 SIGNED');
  ok(canProduceElectronicSignedContractDocument(agg6), 'K: permite final');
}

console.log('\n=== L) Certificado 6 cards ===');
{
  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: 'CT-FIX',
    projectName: 'Araguaia',
    quadra: '01',
    lote: '02',
    buyerName: 'Comprador Teste Silva',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        signedAt: '2026-08-21T12:00:00.000Z',
        signatureEventId: 'evt-daniel',
      },
      {
        name: 'Aldenise Sousa Rivelino',
        cpf: '85656011291',
        signedAt: '2026-08-21T12:01:00.000Z',
        signatureEventId: 'evt-aldenise',
      },
    ],
    intervenientCard: {
      companyName: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
      companyCnpj: '57590706000178',
      representativeName: 'Daniel Roberto Rivelino de Sousa',
      representativeCpf: '82091226220',
      signedAt: '2026-08-21T12:02:00.000Z',
      signatureEventId: 'evt-intervenient',
    },
    witnessCards: [
      {
        role: 'WITNESS_1',
        name: 'Testemunha Um Real',
        cpf: '39053344705',
        signedAt: '2026-08-21T12:03:00.000Z',
        signatureEventId: 'evt-w1',
      },
      {
        role: 'WITNESS_2',
        name: 'Testemunha Dois Real',
        cpf: '52998224725',
        signedAt: '2026-08-21T12:04:00.000Z',
        signatureEventId: 'evt-w2',
      },
    ],
  });
  ok(/PROMITENTE VENDEDOR/i.test(cert), 'cert VENDOR');
  ok(/INTERVENIENTE/i.test(cert), 'cert INTERVENIENTE');
  ok(/TESTEMUNHA 1/i.test(cert) && /TESTEMUNHA 2/i.test(cert), 'cert witnesses');
}

console.log('\n=== M/N/O/P) Artefatos distinct + downloads ===');
{
  ok(
    resolveSaleContractDownloadArtifactKind({
      signatureStatus: 'PENDING',
      contractStatus: 'ativo',
      pdfSignedUrl: null,
    }) === 'UNSIGNED',
    'M: pending → UNSIGNED',
  );
  ok(
    resolveSaleContractDownloadArtifactKind({
      signatureStatus: 'SIGNED',
      contractStatus: 'assinado',
      pdfSignedUrl: 'https://example.com/signed.pdf',
    }) === 'SIGNED',
    'N: admin escolhe SIGNED',
  );
  ok(
    shouldBlockUnsignedFallbackAfterElectronicSign({
      signatureStatus: 'SIGNED',
      contractStatus: 'assinado',
    }),
    'O: portal bloqueia fallback unsigned',
  );
  ok(
    !shouldBlockUnsignedFallbackAfterElectronicSign({
      signatureStatus: 'PENDING',
      contractStatus: 'ativo',
    }),
    'P: sem signed, portal permite fallback',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'PENDING',
      generated_html: '<html></html>',
    } as never),
    'P: availability com HTML',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'assinado',
      signature_status: 'SIGNED',
      generated_html: '<html>unsigned</html>',
      pdf_signed_url: null,
    } as never),
    'O: assinado sem URL → disponível via helper admin (regen)',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'assinado',
      signature_status: 'SIGNED',
      pdf_signed_url: 'https://example.com/s.pdf',
    } as never),
    'O: assinado com URL → disponível',
  );
}

console.log('\n=== Flags + wiring ===');
{
  delete process.env.ARAGUAIA_ESIGN_V2_ENABLED;
  ok(isAraguaiaEsignV2PersistEnabled() === false, 'flag env OFF por default');
  const service = readFileSync(
    join(root, 'lib/saleContractSignatureService.ts'),
    'utf8',
  );
  ok(
    service.includes('applyAraguaiaElectronicSignaturesToContractHtml'),
    'PDF signed usa bloco eletrônico ARAGUAIA',
  );
  const portal = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  ok(
    portal.includes('shouldBlockUnsignedFallbackAfterElectronicSign'),
    'portal sem fallback unsigned pós-sign',
  );
}

console.log('\n=== Fixtures HTML locais ===');
{
  mkdirSync(fixturesDir, { recursive: true });
  const unsignedFull = buildAraguaiaSignaturesHtml(mockCtx(), {
    signatureMode: 'PHYSICAL_UNSIGNED',
  });
  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(sixParties);
  const signedFull = buildAraguaiaSignaturesHtml(mockCtx(), {
    signatureMode: 'ELECTRONIC_SIGNED',
    electronicSlots: slots,
  });
  const unsignedPath = join(fixturesDir, 'araguaia-physical-unsigned.html');
  const signedPath = join(fixturesDir, 'araguaia-electronic-signed.html');
  writeFileSync(unsignedPath, unsignedFull, 'utf8');
  writeFileSync(signedPath, signedFull, 'utf8');
  ok(/signature-line/i.test(readFileSync(unsignedPath, 'utf8')), 'fixture unsigned');
  ok(
    !/signature-line/i.test(readFileSync(signedPath, 'utf8')) &&
      /ASSINADO ELETRONICAMENTE/i.test(readFileSync(signedPath, 'utf8')),
    'fixture signed',
  );
  console.log(`  fixtures → ${fixturesDir}`);
}

console.log('\n✅ mandatory-araguaia-esign-v2-pdf-modes-tests OK\n');
