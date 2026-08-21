/**
 * Etapa 6 — Integração final local ARAGUAIA e-sign V2 (0/6 → 6/6).
 * Sem banco remoto. Sem ligar flags. Sem funcionalidade nova.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT,
  ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES,
  ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
  buildAraguaiaEsignExpectedPartyRoles,
  buildAraguaiaEsignVendorPartyInputs,
  buildAraguaiaIntervenientPartyInput,
  buildAraguaiaWitnessPartyInputs,
  validateAraguaiaWitnessIdentity,
} from '../lib/araguaiaContractEsign';
import { buildAraguaiaSignaturesHtml } from '../lib/araguaiaContractParties';
import type { AraguaiaContractContext } from '../lib/araguaiaContractContext';
import {
  applyAraguaiaElectronicSignaturesToContractHtml,
  buildAraguaiaElectronicSignatureSlotsFromParties,
} from '../lib/araguaiaContractElectronicSignatures';
import {
  canProduceElectronicSignedContractDocument,
  resolveSaleContractDownloadArtifactKind,
  shouldBlockUnsignedFallbackAfterElectronicSign,
} from '../lib/saleContractSignatureRenderMode';
import {
  computeAggregateSaleSignatureStatus,
  countSignedParties,
} from '../lib/saleContractSignaturePartyStatus';
import { ensurePartySignatureEventData } from '../lib/saleContractSignatureParties';
import { createSaleSignaturePartyToken } from '../lib/saleContractSignaturePartyTokens';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { resolvePortalContractPdfAvailability } from '../lib/portal-cliente/contractDownload';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';
import type {
  ContractSignaturePartyRow,
  SaleSignaturePartyRole,
  SaleSignaturePartyStatus,
} from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();
const fixturesDir = join(root, 'scripts', '_fixtures', 'araguaia-esign-v2');

function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

type LocalParty = ContractSignaturePartyRow & {
  plainToken?: string | null;
};

function mockCtx(): AraguaiaContractContext {
  return {
    sellers: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '820.912.262-20',
      },
      {
        name: 'Aldenise Alves Sousa',
        cpf: '856.560.112-91',
      },
    ],
    intervenienteName: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
    intervenienteCnpj: ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
    buyerName: 'Comprador Integracao Teste',
    buyerCpf: '111.444.777-35',
    closingLine: 'Parauapebas/PA, 21 de agosto de 2026.',
    hasSpouse: false,
  } as unknown as AraguaiaContractContext;
}

function createLocalProcess(): LocalParty[] {
  const vendors = buildAraguaiaEsignVendorPartyInputs();
  // Homologação: Aldenise Alves Sousa
  vendors[1] = {
    ...vendors[1],
    name: 'Aldenise Alves Sousa',
  };
  const intervenient = buildAraguaiaIntervenientPartyInput();
  const witnesses = buildAraguaiaWitnessPartyInputs();

  const parties: LocalParty[] = [];

  const push = (
    role: SaleSignaturePartyRole,
    fields: Partial<LocalParty> & { id: string },
  ) => {
    const withToken =
      role === 'BUYER' ||
      role === 'WITNESS_1' ||
      role === 'WITNESS_2' ||
      role === 'VENDOR';
    const tok = withToken ? createSaleSignaturePartyToken() : null;
    parties.push({
      company_id: 'co-local',
      contract_signature_id: 'sig-local',
      contract_id: 'ct-local',
      sale_id: null,
      role,
      signer_name: null,
      signer_cpf: null,
      signer_phone: null,
      signer_email: null,
      signature_token_hash: tok?.tokenHash || null,
      signature_url: tok
        ? `https://www.svlotes.com.br/sign/sale/${tok.token}`
        : null,
      plainToken: tok?.token || null,
      status: 'PENDING',
      sent_at: new Date().toISOString(),
      viewed_at: null,
      signed_at: null,
      cancelled_at: null,
      expires_at: null,
      signature_hash: null,
      ip_address: null,
      user_agent: null,
      signature_data: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...fields,
    });
  };

  push('BUYER', {
    id: 'party-buyer',
    signer_name: 'Comprador Integracao Teste',
    signer_cpf: '11144477735',
  });
  push('VENDOR', {
    id: 'party-daniel',
    signer_name: vendors[0].name,
    signer_cpf: vendors[0].cpf,
    signer_email: vendors[0].email,
    signer_phone: vendors[0].phone,
  });
  push('VENDOR', {
    id: 'party-aldenise',
    signer_name: vendors[1].name,
    signer_cpf: vendors[1].cpf,
    signer_email: vendors[1].email,
    signer_phone: vendors[1].phone,
  });
  push('INTERVENIENT', {
    id: 'party-rr',
    signer_name: intervenient.name,
    signer_cpf: intervenient.cnpj,
    signer_email: intervenient.email,
    signer_phone: intervenient.phone,
    signature_data: { ...intervenient.signatureData },
    signature_token_hash: null,
    signature_url: null,
    plainToken: null,
  });
  for (const w of witnesses) {
    push(w.role, {
      id: w.role === 'WITNESS_1' ? 'party-w1' : 'party-w2',
      signer_name: null,
      signer_cpf: null,
      signer_phone: null,
      signer_email: null,
    });
  }

  return parties;
}

function progressOf(parties: LocalParty[]) {
  return countSignedParties(
    parties.map((p) => ({ role: p.role, status: p.status })),
  );
}

function aggregateOf(parties: LocalParty[]) {
  return computeAggregateSaleSignatureStatus(
    parties.map((p) => ({ role: p.role, status: p.status })),
  );
}

function signParty(
  parties: LocalParty[],
  partyId: string,
  patch: {
    name?: string;
    cpf?: string;
    phone?: string | null;
    email?: string | null;
    hashSuffix: string;
  },
): LocalParty {
  const idx = parties.findIndex((p) => p.id === partyId);
  assert.ok(idx >= 0, `party ${partyId} existe`);
  const current = parties[idx];
  assert.notEqual(
    String(current.status).toUpperCase(),
    'SIGNED',
    `${partyId} ainda não assinada`,
  );

  const eventData = ensurePartySignatureEventData({
    ...(current.signature_data || {}),
    role: current.role,
    partyId: current.id,
  });

  const signed: LocalParty = {
    ...current,
    signer_name: patch.name ?? current.signer_name,
    signer_cpf: patch.cpf ?? current.signer_cpf,
    signer_phone:
      patch.phone !== undefined ? patch.phone : current.signer_phone,
    signer_email:
      patch.email !== undefined ? patch.email : current.signer_email,
    status: 'SIGNED' as SaleSignaturePartyStatus,
    signed_at: new Date().toISOString(),
    signature_hash: `hash-${patch.hashSuffix}`,
    ip_address: '203.0.113.10',
    user_agent: 'IntegrationTest/1.0',
    signature_data: eventData,
    updated_at: new Date().toISOString(),
  };
  parties[idx] = signed;
  return signed;
}

/** Simula abertura do link: só a party do token muda. */
function resolveByToken(
  parties: LocalParty[],
  token: string,
): LocalParty | null {
  return parties.find((p) => p.plainToken === token) || null;
}

console.log('\n======== ETAPA 6 — INTEGRAÇÃO LOCAL 0/6 → 6/6 ========');

const expectedRoles = buildAraguaiaEsignExpectedPartyRoles();
ok(expectedRoles.length === 6, 'destino 6 roles');
ok(
  !shouldCreateSpouseSignatureParty({
    contractModel: 'ARAGUAIA',
    sale: { has_spouse: true, spouse_name: 'X', spouse_cpf: '11144477735' },
  }),
  'ARAGUAIA sem SPOUSE',
);
ok(ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT === false, 'flag INTERVENIENT false');
ok(ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES === false, 'flag WITNESSES false');

const parties = createLocalProcess();
ok(parties.length === 6, '6 parties criadas');
ok(!parties.some((p) => p.role === 'SPOUSE'), 'nenhum SPOUSE');

const ids = parties.map((p) => p.id);
ok(new Set(ids).size === 6, 'partyIds distintos');

const daniel = parties.find((p) => p.id === 'party-daniel')!;
const rr = parties.find((p) => p.id === 'party-rr')!;
const w1 = parties.find((p) => p.id === 'party-w1')!;
const w2 = parties.find((p) => p.id === 'party-w2')!;

ok(daniel.signer_cpf === '82091226220', 'Daniel CPF PF');
ok(rr.signer_cpf === '57590706000178', 'R R CNPJ');
ok(daniel.signer_cpf !== rr.signer_cpf, 'Daniel PF ≠ R R PJ (documento)');
ok(daniel.id !== rr.id, 'Daniel partyId ≠ R R partyId');
ok(w1.signer_name === null && w1.signer_cpf === null, 'W1 identidade vazia');
ok(w2.signer_name === null && w2.signer_cpf === null, 'W2 identidade vazia');
ok(w1.plainToken && w2.plainToken && w1.plainToken !== w2.plainToken, 'tokens W distintos');
ok(w1.signature_url !== w2.signature_url, 'URLs W distintas');
ok(!rr.plainToken && !rr.signature_url, 'INTERVENIENT sem link público');

const statusLog: Array<{ step: string; signed: number; total: number; agg: string | null }> =
  [];

function logStep(step: string) {
  const p = progressOf(parties);
  const agg = aggregateOf(parties);
  statusLog.push({ step, signed: p.signed, total: p.total, agg });
  console.log(`  → ${step}: ${p.signed}/${p.total} aggregate=${agg}`);
}

console.log('\n--- Ciclo de assinaturas ---');
logStep('0/6 início');
ok(progressOf(parties).signed === 0, '0 assinaturas');
ok(aggregateOf(parties) === 'PENDING', 'aggregate PENDING');
ok(
  !canProduceElectronicSignedContractDocument(aggregateOf(parties)),
  '0/6 sem ELECTRONIC_SIGNED',
);

signParty(parties, 'party-buyer', {
  hashSuffix: 'buyer',
});
logStep('BUYER assinou');
ok(progressOf(parties).signed === 1, '1/6');
ok(aggregateOf(parties) === 'CLIENT_SIGNED', '1/6 CLIENT_SIGNED');

signParty(parties, 'party-daniel', { hashSuffix: 'daniel' });
logStep('Daniel VENDOR assinou');
ok(progressOf(parties).signed === 2, '2/6');
ok(String(parties.find((p) => p.id === 'party-rr')!.status) !== 'SIGNED', 'R R ainda PENDING');

signParty(parties, 'party-aldenise', { hashSuffix: 'aldenise' });
logStep('Aldenise VENDOR assinou');
ok(progressOf(parties).signed === 3, '3/6');

signParty(parties, 'party-rr', {
  name: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  cpf: '57590706000178',
  hashSuffix: 'rr-pj',
});
logStep('INTERVENIENT assinou');
ok(progressOf(parties).signed === 4, '4/6');
ok(
  parties.find((p) => p.id === 'party-daniel')!.signature_data!
    .signature_event_id !==
    parties.find((p) => p.id === 'party-rr')!.signature_data!.signature_event_id,
  'event_id Daniel ≠ R R',
);
ok(
  parties.find((p) => p.id === 'party-daniel')!.signature_hash !==
    parties.find((p) => p.id === 'party-rr')!.signature_hash,
  'hash Daniel ≠ R R',
);

const w1Tok = parties.find((p) => p.id === 'party-w1')!.plainToken!;
const openedW1 = resolveByToken(parties, w1Tok);
ok(openedW1?.id === 'party-w1', 'token W1 resolve só W1');
ok(resolveByToken(parties, w1Tok)?.id !== 'party-w2', 'token W1 ≠ W2');

const w1Identity = validateAraguaiaWitnessIdentity({
  name: 'Testemunha Um Integracao',
  cpf: '390.533.447-05',
  phone: '94991254320',
  email: 'testemunha1@example.com',
});
ok(w1Identity.ok, 'W1 identidade válida');
if (w1Identity.ok) {
  signParty(parties, 'party-w1', {
    name: w1Identity.value.name,
    cpf: w1Identity.value.cpf,
    phone: w1Identity.value.phone,
    email: w1Identity.value.email,
    hashSuffix: 'w1',
  });
}
logStep('WITNESS_1 assinou');
ok(progressOf(parties).signed === 5, '5/6');
{
  const agg5 = aggregateOf(parties);
  ok(agg5 !== 'SIGNED', '5/6 NÃO SIGNED');
  ok(!canProduceElectronicSignedContractDocument(agg5), '5/6 sem doc final');
  ok(
    resolveSaleContractDownloadArtifactKind({
      signatureStatus: agg5,
      contractStatus: 'ativo',
      pdfSignedUrl: null,
    }) === 'UNSIGNED',
    '5/6 admin => UNSIGNED',
  );
  ok(
    !shouldBlockUnsignedFallbackAfterElectronicSign({
      signatureStatus: agg5,
      contractStatus: 'ativo',
    }),
    '5/6 portal ainda pré-assinatura',
  );
}

const w2Tok = parties.find((p) => p.id === 'party-w2')!.plainToken!;
ok(resolveByToken(parties, w2Tok)?.id === 'party-w2', 'token W2 → W2');
const w2Identity = validateAraguaiaWitnessIdentity({
  name: 'Testemunha Dois Integracao',
  cpf: '529.982.247-25',
  phone: '94991252923',
  email: 'testemunha2@example.com',
});
ok(w2Identity.ok, 'W2 identidade válida');
if (w2Identity.ok) {
  signParty(parties, 'party-w2', {
    name: w2Identity.value.name,
    cpf: w2Identity.value.cpf,
    phone: w2Identity.value.phone,
    email: w2Identity.value.email,
    hashSuffix: 'w2',
  });
}
logStep('WITNESS_2 assinou — 6/6');
ok(progressOf(parties).signed === 6, '6/6');
ok(aggregateOf(parties) === 'SIGNED', 'aggregate SIGNED');
ok(
  canProduceElectronicSignedContractDocument(aggregateOf(parties)),
  '6/6 permite ELECTRONIC_SIGNED',
);

const eventIds = parties.map(
  (p) => String(p.signature_data?.signature_event_id || ''),
);
ok(eventIds.every(Boolean), 'todos com signature_event_id');
ok(new Set(eventIds).size === 6, '6 signature_event_id distintos');
ok(
  new Set(parties.map((p) => p.signature_hash)).size === 6,
  '6 hashes distintos',
);

console.log('\n--- PDF unsigned 0/6 ---');
{
  const unsigned = buildAraguaiaSignaturesHtml(mockCtx(), {
    signatureMode: 'PHYSICAL_UNSIGNED',
  });
  ok(/signature-line/i.test(unsigned), 'linhas físicas');
  ok(unsigned.includes('Daniel Roberto Rivelino de Sousa'), 'Daniel');
  ok(unsigned.includes('Aldenise Alves Sousa'), 'Aldenise');
  ok(unsigned.includes('Comprador Integracao Teste'), 'comprador');
  ok(/INTERVENIENTE/i.test(unsigned), 'INTERVENIENTE');
  ok(/TESTEMUNHA 1/i.test(unsigned) && /TESTEMUNHA 2/i.test(unsigned), 'testemunhas');
  ok(!/ASSINADO ELETRONICAMENTE/i.test(unsigned), 'sem cards eletrônicos');
  ok(!/CÔNJUGE ANUENTE|SPOUSE/i.test(unsigned), 'sem SPOUSE');
  mkdirSync(fixturesDir, { recursive: true });
  writeFileSync(
    join(fixturesDir, 'integration-0-6-unsigned.html'),
    unsigned,
    'utf8',
  );
}

console.log('\n--- PDF signed 6/6 ---');
{
  const shell = `
    <div class="sv-contract-araguaia">
      <div class="contract-signatures contract-signatures--araguaia">
        <div class="signature-line"></div>
        <p>PROMITENTE VENDEDOR</p>
      </div>
    </div>`;
  const signedHtml = applyAraguaiaElectronicSignaturesToContractHtml(
    shell,
    parties,
  );
  ok(!/class="signature-line"/i.test(signedHtml), 'zero linhas físicas');
  ok(/ASSINADO ELETRONICAMENTE/i.test(signedHtml), 'badge eletrônico');
  ok(signedHtml.includes('Daniel Roberto Rivelino de Sousa'), 'Daniel PF');
  ok(signedHtml.includes('Aldenise Alves Sousa'), 'Aldenise PF');
  ok(signedHtml.includes('Comprador Integracao Teste'), 'BUYER');
  ok(
    signedHtml.includes('R R NEG') && /CNPJ/i.test(signedHtml),
    'R R PJ',
  );
  ok(signedHtml.includes('Testemunha Um Integracao'), 'W1 no bloco');
  ok(signedHtml.includes('Testemunha Dois Integracao'), 'W2 no bloco');
  for (const id of eventIds) {
    ok(signedHtml.includes(id), `bloco contém ${id.slice(0, 8)}…`);
  }

  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(parties);
  ok(slots.length === 6, '6 slots eletrônicos');

  const cert = buildSaleContractSignatureCertificateHtml({
    contractNumber: 'CT-INT-001',
    projectName: 'Chacreamento Araguaia',
    quadra: '01',
    lote: '02',
    buyerName: 'Comprador Integracao Teste',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    signatureToken: 'verify-token-local-integration',
    signatureHash: 'doc-hash-local-integration-sha256',
    qrCodeDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        signedAt: parties[1].signed_at,
        signatureEventId: eventIds[1],
      },
      {
        name: 'Aldenise Alves Sousa',
        cpf: '85656011291',
        signedAt: parties[2].signed_at,
        signatureEventId: eventIds[2],
      },
    ],
    intervenientCard: {
      companyName: ARAGUAIA_INTERVENIENT_COMPANY_NAME,
      companyCnpj: ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
      representativeName: ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
      representativeCpf: ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
      signedAt: parties.find((p) => p.id === 'party-rr')!.signed_at,
      signatureEventId: eventIds[3],
    },
    witnessCards: [
      {
        role: 'WITNESS_1',
        name: 'Testemunha Um Integracao',
        cpf: '39053344705',
        email: 'testemunha1@example.com',
        phone: parties.find((p) => p.id === 'party-w1')!.signer_phone,
        signedAt: parties.find((p) => p.id === 'party-w1')!.signed_at,
        signatureEventId: eventIds[4],
      },
      {
        role: 'WITNESS_2',
        name: 'Testemunha Dois Integracao',
        cpf: '52998224725',
        email: 'testemunha2@example.com',
        phone: parties.find((p) => p.id === 'party-w2')!.signer_phone,
        signedAt: parties.find((p) => p.id === 'party-w2')!.signed_at,
        signatureEventId: eventIds[5],
      },
    ],
  });
  ok(/PROMITENTE VENDEDOR/i.test(cert), 'cert VENDOR');
  ok(/INTERVENIENTE/i.test(cert), 'cert INTERVENIENTE');
  ok(/TESTEMUNHA 1/i.test(cert) && /TESTEMUNHA 2/i.test(cert), 'cert witnesses');
  ok(cert.includes('verify-token-local-integration'), 'token verificação');
  ok(cert.includes('doc-hash-local-integration-sha256'), 'hash documento');
  ok(/sv-cert-qr|QR Code/i.test(cert), 'QR presente');
  ok(cert.includes(ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME), 'rep no cert');

  writeFileSync(
    join(fixturesDir, 'integration-6-6-electronic.html'),
    signedHtml,
    'utf8',
  );
  writeFileSync(
    join(fixturesDir, 'integration-6-6-certificate.html'),
    cert,
    'utf8',
  );
}

console.log('\n--- Admin / Portal pós 6/6 ---');
{
  ok(
    resolveSaleContractDownloadArtifactKind({
      signatureStatus: 'SIGNED',
      contractStatus: 'assinado',
      pdfSignedUrl: 'https://example.com/signed.pdf',
    }) === 'SIGNED',
    'admin => SIGNED',
  );
  ok(
    shouldBlockUnsignedFallbackAfterElectronicSign({
      signatureStatus: 'SIGNED',
      contractStatus: 'assinado',
    }),
    'portal bloqueia fallback unsigned',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'assinado',
      signature_status: 'SIGNED',
      pdf_signed_url: 'https://example.com/s.pdf',
      generated_html: '<html>unsigned</html>',
    } as never),
    'portal available com signed url',
  );
  ok(
    !resolvePortalContractPdfAvailability({
      id: '1',
      status: 'assinado',
      signature_status: 'SIGNED',
      pdf_signed_url: null,
      generated_html: '<html>unsigned</html>',
    } as never),
    'portal NÃO usa HTML quando deveria haver signed',
  );
}

console.log('\n--- Migration revisão ---');
{
  const mig = readFileSync(
    join(
      root,
      'supabase/migrations/20261006140000_contract_signature_parties_araguaia_esign_v2.sql',
    ),
    'utf8',
  );
  ok(mig.includes("'INTERVENIENT'"), 'migration INTERVENIENT');
  ok(mig.includes("'WITNESS_1'") && mig.includes("'WITNESS_2'"), 'migration WITNESS');
  ok(mig.includes('unique_singleton_roles'), 'singleton index');
  ok(mig.includes('unique_vendor_cpf'), 'vendor cpf preservado');
  ok(
    !mig.includes('DROP INDEX IF EXISTS public.idx_contract_signature_parties_token_hash'),
    'não dropa token_hash',
  );
  const notifyCount = (mig.match(/NOTIFY pgrst/g) || []).length;
  ok(notifyCount === 1, 'migration sem duplicata final (1 NOTIFY)');
  const rollback = readFileSync(
    join(
      root,
      'supabase/migrations/20261006140000_contract_signature_parties_araguaia_esign_v2.rollback.conceptual.sql',
    ),
    'utf8',
  );
  ok(rollback.includes('NÃO EXECUTAR'), 'rollback conceitual marcado');
  ok(rollback.includes('Rollback de aplicação'), 'rollback app preferencial');
}

writeFileSync(
  join(fixturesDir, 'integration-status-log.json'),
  JSON.stringify({ statusLog, partyIds: ids, eventIds }, null, 2),
  'utf8',
);

console.log('\n======== Status após cada assinatura ========');
for (const row of statusLog) {
  console.log(
    `  ${row.step.padEnd(28)} ${row.signed}/${row.total}  ${row.agg}`,
  );
}

console.log('\n✅ mandatory-araguaia-esign-v2-integration-tests OK\n');
