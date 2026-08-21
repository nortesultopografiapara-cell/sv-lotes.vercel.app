/**
 * Etapa 8 — correções pós-homologação 6/6 (Preview / ARAGUAIA e-sign V2).
 * npx tsx scripts/mandatory-araguaia-esign-v2-homolog-fixes-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAraguaiaContractContext,
} from '../lib/araguaiaContractContext';
import {
  buildAraguaiaPhysicalSignaturesGridHtml,
  buildAraguaiaSignaturesHtml,
} from '../lib/araguaiaContractParties';
import {
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  buildAraguaiaIntervenientPartyInput,
  shouldPersistAraguaiaIntervenientParty,
} from '../lib/araguaiaContractEsign';
import { buildAraguaiaElectronicSignatureSlotsFromParties } from '../lib/araguaiaContractElectronicSignatures';
import { resolveAraguaiaIntervenientIdentity } from '../lib/araguaiaIntervenientIdentity';
import {
  ARAGUAIA_ESIGN_V2_ENABLED_ENV,
  ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
  shouldEnableAraguaiaEsignV2,
} from '../lib/araguaiaEsignV2Gate';
import {
  PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
  resolvePortalContractPdfAvailability,
} from '../lib/portal-cliente/contractDownload';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

const TOPOGRAFIA = {
  id: ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
  razao_social: 'S.V TOPOGRAFIA E PROJETO LTDA',
  name: 'S.V TOPOGRAFIA E PROJETO LTDA',
  cnpj: '12.345.678/0001-90',
  document: '12345678000190',
  legal_representative: 'REPRESENTANTE TOPOGRAFIA',
  representative_cpf: '390.533.447-05',
  legal_representative_email: 'rep.topo@example.com',
  legal_representative_phone: '94991112233',
};

console.log('\n======== ETAPA 8 — HOMOLOG FIXES ========');

console.log('\n=== A/B) Topografia → INTERVENIENT alinhada (sem R R hardcoded) ===');
{
  const identity = resolveAraguaiaIntervenientIdentity({ company: TOPOGRAFIA });
  ok(identity.usedCompanySource, 'A: usedCompanySource');
  ok(
    identity.companyName === 'S.V TOPOGRAFIA E PROJETO LTDA',
    'A: razão Topografia',
  );
  ok(!/R\s*R\s*NEG/i.test(identity.companyName), 'B: nome sem R R');
  ok(identity.companyCnpjDigits === '12345678000190', 'A: CNPJ Topografia');

  const party = buildAraguaiaIntervenientPartyInput({ company: TOPOGRAFIA });
  ok(party.name === identity.companyName, 'A: party nome = identidade');
  ok(party.cnpj === identity.companyCnpjDigits, 'A: party CNPJ = identidade');
  ok(
    party.signatureData.company_name === identity.companyName,
    'A: signature_data company',
  );
  ok(!/R\s*R\s*NEG/i.test(party.name), 'B: party sem R R');
  ok(
    !/R\s*R\s*NEG/i.test(party.signatureData.company_name),
    'B: signature_data sem R R',
  );

  const ctx = buildAraguaiaContractContext({
    tenant: TOPOGRAFIA,
    customer: { name: 'Severino', cpf_cnpj: '11144477735' },
    project: { name: 'Chacreamento Araguaia', contract_model: 'ARAGUAIA' },
    block: { number: '33', block_name: '02' },
    sale: { total_value: 50, down_payment: 0, installments_count: 1 },
  });
  ok(
    ctx.intervenienteName === 'S.V TOPOGRAFIA E PROJETO LTDA',
    'A: preâmbulo Topografia',
  );
  ok(!/R\s*R\s*NEG/i.test(ctx.intervenienteName), 'B: preâmbulo sem R R');
  ok(
    ctx.intervenienteRepresentativeName === 'REPRESENTANTE TOPOGRAFIA',
    'A: rep legal no ctx',
  );
  ok(
    ctx.sellers.some((s) => s.name === 'REPRESENTANTE TOPOGRAFIA'),
    'A: VENDOR = Representante Legal',
  );

  const physical = buildAraguaiaPhysicalSignaturesGridHtml(ctx);
  ok(
    physical.includes('S.V TOPOGRAFIA E PROJETO LTDA'),
    'A: bloco físico Topografia',
  );
  ok(
    physical.includes('REPRESENTANTE TOPOGRAFIA'),
    'A: bloco físico Representante Legal',
  );
  ok(!/R\s*R\s*NEG/i.test(physical), 'B: bloco físico sem R R');
  ok(!/Daniel Roberto/i.test(physical), 'B: físico sem Daniel hardcoded');

  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    flow.includes('buildAraguaiaIntervenientPartyInput({') &&
      flow.includes('company'),
    'A: fluxo passa company ao builder',
  );
}

console.log('\n=== C) LEGAL_ENTITY / INTERVENIENT → label CNPJ ===');
{
  const modal = readFileSync(
    join(root, 'components/contracts/SaleContractVendorSignModal.tsx'),
    'utf8',
  );
  const section = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(modal.includes("documentLabel = 'CPF'"), 'C: default CPF PF');
  ok(section.includes('documentLabel="CNPJ"'), 'C: INTERVENIENT usa CNPJ');
}

console.log('\n=== D) Topo do contrato — ações PDF assinado ===');
{
  const page = readFileSync(join(root, 'app/contracts/page.tsx'), 'utf8');
  ok(page.includes('Abrir PDF Assinado'), 'D: Abrir PDF Assinado no topo');
  ok(page.includes('Baixar PDF Assinado'), 'D: Baixar PDF Assinado no topo');
  ok(
    page.includes('isSaleContractFullySigned(selectedContract)') &&
      page.includes('pdf_signed_url'),
    'D: gated por SIGNED + pdf_signed_url',
  );
}

console.log('\n=== E/F/G) Portal SIGNED = só pdf_signed_url ===');
{
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'SIGNED',
      pdf_signed_url: 'https://example.com/signed.pdf',
      generated_html: '<html>unsigned</html>',
      pdf_url: 'https://example.com/original.pdf',
    } as never),
    'E: SIGNED + pdf_signed_url disponível',
  );
  ok(
    !resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'SIGNED',
      pdf_signed_url: null,
      generated_html: '<html>unsigned</html>',
      pdf_url: 'https://example.com/original.pdf',
    } as never),
    'F: SIGNED sem pdf_signed_url NÃO entrega unsigned/pdf_url',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'PENDING',
      pdf_signed_url: null,
      generated_html: '<html>ok</html>',
    } as never),
    'G: unsigned (PENDING) continua baixável via HTML',
  );
  const download = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  ok(
    download.includes(PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE),
    'F: mensagem processamento',
  );
  ok(
    download.includes('EXCLUSIVAMENTE pdf_signed_url') ||
      download.includes('só o PDF final assinado'),
    'E: regra exclusiva documentada',
  );
  const view = readFileSync(
    join(root, 'app/api/portal-cliente/contract/route.ts'),
    'utf8',
  );
  ok(
    view.includes('shouldBlockUnsignedFallbackAfterElectronicSign') &&
      view.includes('loadPortalContractPdfForDownload'),
    'E: view SIGNED não devolve HTML unsigned',
  );
  const dash = readFileSync(
    join(root, 'lib/portal-cliente/dashboard.ts'),
    'utf8',
  );
  ok(
    dash.includes('PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE'),
    'F: dashboard expõe processamento',
  );
}

console.log('\n=== H/I/J) PHYSICAL × ELECTRONIC + certificado ===');
{
  const ctx = buildAraguaiaContractContext({
    tenant: TOPOGRAFIA,
    customer: { name: 'Severino', cpf_cnpj: '11144477735' },
    project: { name: 'Araguaia', contract_model: 'ARAGUAIA' },
    block: { number: '33', block_name: '02' },
    sale: { total_value: 50 },
  });
  const unsigned = buildAraguaiaSignaturesHtml(ctx, {
    signatureMode: 'PHYSICAL_UNSIGNED',
  });
  ok(/signature-line/i.test(unsigned), 'H: linhas físicas');
  ok(/INTERVENIENTE/i.test(unsigned), 'H: INTERVENIENTE física');
  ok(/TESTEMUNHA 1/i.test(unsigned) && /TESTEMUNHA 2/i.test(unsigned), 'H: testemunhas');

  const party = buildAraguaiaIntervenientPartyInput({ company: TOPOGRAFIA });
  const parties = [
    {
      id: 'b',
      role: 'BUYER',
      signer_name: 'Severino',
      signer_cpf: '11144477735',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:00:00Z',
      signature_data: { signature_event_id: 'ev-b' },
    },
    {
      id: 'v1',
      role: 'VENDOR',
      signer_name: 'Daniel Roberto Rivelino de Sousa',
      signer_cpf: '82091226220',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:01:00Z',
      signature_data: { signature_event_id: 'ev-v1' },
    },
    {
      id: 'v2',
      role: 'VENDOR',
      signer_name: 'Aldenise',
      signer_cpf: '85656011291',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:02:00Z',
      signature_data: { signature_event_id: 'ev-v2' },
    },
    {
      id: 'i',
      role: 'INTERVENIENT',
      signer_name: party.name,
      signer_cpf: party.cnpj,
      status: 'SIGNED',
      signed_at: '2026-08-21T12:03:00Z',
      signature_data: {
        ...party.signatureData,
        signature_event_id: 'ev-i',
      },
    },
    {
      id: 'w1',
      role: 'WITNESS_1',
      signer_name: 'Testemunha Um',
      signer_cpf: '39053344705',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:04:00Z',
      signature_data: { signature_event_id: 'ev-w1' },
    },
    {
      id: 'w2',
      role: 'WITNESS_2',
      signer_name: 'Testemunha Dois',
      signer_cpf: '52998224725',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:05:00Z',
      signature_data: { signature_event_id: 'ev-w2' },
    },
  ];
  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(parties as never);
  ok(slots.length === 6, 'I: 6 slots eletrônicos');
  const electronic = buildAraguaiaSignaturesHtml(ctx, {
    signatureMode: 'ELECTRONIC_SIGNED',
    electronicSlots: slots,
  });
  ok(!/signature-line/i.test(electronic), 'I: sem linhas físicas vazias');
  ok(/ASSINADO ELETRONICAMENTE/i.test(electronic), 'I: resumo eletrônico');
  ok(electronic.includes('S.V TOPOGRAFIA E PROJETO LTDA'), 'I: Topografia no resumo');
  ok(!/R\s*R\s*NEG/i.test(electronic), 'I: resumo sem R R');

  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: '000000005/2026',
    projectName: 'Araguaia',
    quadra: '02',
    lote: '33',
    buyerName: 'Severino',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signatureToken: 'verify-token-etapa8',
    signatureHash: 'doc-hash-etapa8',
    qrCodeDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        signedAt: '2026-08-21T12:01:00Z',
        signatureEventId: 'ev-v1',
      },
      {
        name: 'Aldenise',
        cpf: '85656011291',
        signedAt: '2026-08-21T12:02:00Z',
        signatureEventId: 'ev-v2',
      },
    ],
    intervenientCard: {
      companyName: party.name,
      companyCnpj: party.cnpj,
      representativeName: party.signatureData.representative_name,
      representativeCpf: party.signatureData.representative_cpf,
      signedAt: '2026-08-21T12:03:00Z',
      signatureEventId: 'ev-i',
    },
    witnessCards: [
      {
        role: 'WITNESS_1',
        name: 'Testemunha Um',
        cpf: '39053344705',
        signedAt: '2026-08-21T12:04:00Z',
        signatureEventId: 'ev-w1',
      },
      {
        role: 'WITNESS_2',
        name: 'Testemunha Dois',
        cpf: '52998224725',
        signedAt: '2026-08-21T12:05:00Z',
        signatureEventId: 'ev-w2',
      },
    ],
  });
  ok(/INTERVENIENTE/i.test(cert), 'J: cert INTERVENIENTE');
  ok(cert.includes('S.V TOPOGRAFIA E PROJETO LTDA'), 'J: cert Topografia');
  ok(!/R\s*R\s*NEG/i.test(cert), 'J: cert sem R R');
  ok(cert.includes('verify-token-etapa8'), 'J: token');
  ok(cert.includes('doc-hash-etapa8'), 'J: hash');
  ok(/sv-cert-qr|QR Code/i.test(cert), 'J: QR');
}

console.log('\n=== K/L) Gate V1 + demais modelos ===');
{
  const envOff = { ...process.env };
  delete envOff[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID, contractModel: 'ARAGUAIA' },
      envOff,
    ),
    'K: gate OFF sem flag',
  );
  ok(
    !shouldPersistAraguaiaIntervenientParty(
      {
        companyId: 'cccccccc-dddd-eeee-ffff-000000000001',
        contractModel: 'ARAGUAIA',
      },
      { ...process.env, [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true' },
    ),
    'K: R R fora allowlist permanece V1',
  );
  for (const model of ['PADRAO', 'MENESES', 'RECANTO', 'SV2']) {
    ok(
      shouldCreateSpouseSignatureParty({
        contractModel: model,
        sale: {
          has_spouse: true,
          spouse_name: 'Maria',
          spouse_cpf: '11144477735',
          spouse_phone: '94999999999',
        },
      }),
      `L: ${model} SPOUSE intacto`,
    );
  }
  ok(
    ARAGUAIA_INTERVENIENT_COMPANY_NAME.includes('R R'),
    'K: constante fallback R R ainda existe (legado)',
  );
}

console.log('\n✅ mandatory-araguaia-esign-v2-homolog-fixes-tests OK\n');
