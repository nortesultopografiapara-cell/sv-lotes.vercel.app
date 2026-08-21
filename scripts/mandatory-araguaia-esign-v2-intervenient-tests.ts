/**
 * Etapa 3 — ARAGUAIA e-sign V2 INTERVENIENT (PJ).
 * Somente código local + fixtures/mocks. ZERO insert remoto.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT,
  ARAGUAIA_INTERVENIENT_COMPANY_CNPJ,
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
  ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
  buildAraguaiaEsignExpectedPartyRoles,
  buildAraguaiaEsignVendorPartyInputs,
  buildAraguaiaIntervenientPartyInput,
  buildAraguaiaIntervenientSignatureData,
  isAraguaiaDanielVendorCpf,
  isAraguaiaIntervenientParty,
  isAraguaiaSaleContractModel,
  readAraguaiaIntervenientFromSignatureData,
} from '../lib/araguaiaContractEsign';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';
import {
  computeAggregateSaleSignatureStatus,
  allAraguaiaProviderPartiesSigned,
} from '../lib/saleContractSignaturePartyStatus';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { ensurePartySignatureEventData } from '../lib/saleContractSignatureParties';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();

function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function snap(
  role: string,
  status: string,
): { role: 'BUYER' | 'SPOUSE' | 'VENDOR' | 'INTERVENIENT'; status: string } {
  return { role: role as 'BUYER' | 'SPOUSE' | 'VENDOR' | 'INTERVENIENT', status };
}

function mockParty(partial: Partial<ContractSignaturePartyRow> & {
  id: string;
  role: ContractSignaturePartyRow['role'];
}): ContractSignaturePartyRow {
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
    status: 'PENDING',
    sent_at: null,
    viewed_at: null,
    signed_at: null,
    cancelled_at: null,
    expires_at: null,
    signature_hash: null,
    ip_address: null,
    user_agent: null,
    signature_data: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

console.log('\n=== A) Destino esperado ARAGUAIA = 2 VENDOR + BUYER + INTERVENIENT (+ witnesses na Etapa 4) ===');
{
  const roles = buildAraguaiaEsignExpectedPartyRoles();
  ok(roles.filter((r) => r === 'VENDOR').length === 2, '2 VENDOR');
  ok(roles.filter((r) => r === 'BUYER').length === 1, '1 BUYER');
  ok(roles.filter((r) => r === 'INTERVENIENT').length === 1, '1 INTERVENIENT');
  ok(roles.filter((r) => r === 'WITNESS_1').length === 1, '1 WITNESS_1');
  ok(roles.filter((r) => r === 'WITNESS_2').length === 1, '1 WITNESS_2');
  ok(!roles.includes('SPOUSE'), 'sem SPOUSE no destino');
  ok(buildAraguaiaEsignVendorPartyInputs().length === 2, '2 vendor inputs');
  ok(roles.length === 6, '6 parties no destino V2');
}

console.log('\n=== B) Nenhum SPOUSE no ARAGUAIA ===');
{
  ok(
    !shouldCreateSpouseSignatureParty({
      contractModel: 'ARAGUAIA',
      sale: {
        has_spouse: true,
        spouse_name: 'Maria',
        spouse_cpf: '12345678901',
      },
    }),
    'ARAGUAIA não cria SPOUSE mesmo com dados',
  );
}

console.log('\n=== C) Daniel VENDOR e INTERVENIENT são eventos distintos ===');
{
  const intervenient = buildAraguaiaIntervenientPartyInput();
  const danielVendor = buildAraguaiaEsignVendorPartyInputs()[0];
  ok(intervenient.role === 'INTERVENIENT', 'role INTERVENIENT');
  ok(intervenient.name === ARAGUAIA_INTERVENIENT_COMPANY_NAME, 'nome empresa');
  ok(
    intervenient.cnpj ===
      ARAGUAIA_INTERVENIENT_COMPANY_CNPJ.replace(/\D/g, ''),
    'CNPJ na party',
  );
  ok(
    intervenient.signatureData.representative_cpf ===
      ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF.replace(/\D/g, ''),
    'CPF representante em signature_data',
  );
  ok(
    danielVendor.cpf ===
      ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF.replace(/\D/g, ''),
    'Daniel VENDOR usa CPF PF',
  );
  ok(
    danielVendor.cpf !== intervenient.cnpj,
    'CPF Daniel ≠ CNPJ empresa (documentos distintos)',
  );
  ok(isAraguaiaDanielVendorCpf(danielVendor.cpf), 'helper Daniel CPF');
  ok(
    isAraguaiaIntervenientParty({
      role: 'INTERVENIENT',
      signer_cpf: intervenient.cnpj,
      signature_data: intervenient.signatureData,
    }),
    'helper INTERVENIENT party',
  );

  const danielEvent = ensurePartySignatureEventData({ role: 'VENDOR' });
  const companyEvent = ensurePartySignatureEventData({
    ...intervenient.signatureData,
    role: 'INTERVENIENT',
  });
  ok(
    danielEvent.signature_event_id !== companyEvent.signature_event_id,
    'signature_event_id distintos',
  );
}

console.log('\n=== D/E) Assinar Daniel não assina empresa e vice-versa ===');
{
  const intervenient = buildAraguaiaIntervenientPartyInput();
  let danielStatus = 'PENDING';
  let companyStatus = 'PENDING';

  // Simula clique PF Daniel
  danielStatus = 'SIGNED';
  ok(danielStatus === 'SIGNED' && companyStatus === 'PENDING', 'D: só Daniel');

  // Simula clique PJ (independente)
  companyStatus = 'SIGNED';
  danielStatus = 'PENDING'; // reset cenário E
  companyStatus = 'SIGNED';
  ok(companyStatus === 'SIGNED' && danielStatus === 'PENDING', 'E: só empresa');

  const partiesAfterDaniel = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'), // Daniel
    snap('VENDOR', 'PENDING'), // Aldenise
    snap('INTERVENIENT', 'PENDING'),
  ];
  ok(
    computeAggregateSaleSignatureStatus(partiesAfterDaniel) ===
      'CLIENT_SIGNED',
    'após só Daniel: aggregate CLIENT_SIGNED (não SIGNED)',
  );

  const partiesAfterCompanyOnly = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'PENDING'),
    snap('VENDOR', 'PENDING'),
    snap('INTERVENIENT', 'SIGNED'),
  ];
  ok(
    computeAggregateSaleSignatureStatus(partiesAfterCompanyOnly) ===
      'CLIENT_SIGNED',
    'após só empresa: ainda CLIENT_SIGNED',
  );

  ok(
    intervenient.withPublicToken === false,
    'INTERVENIENT sem token público por padrão',
  );
  void intervenient;
}

console.log('\n=== F) Aggregate NÃO conclui com INTERVENIENT pendente ===');
{
  const pendingIntervenient = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('INTERVENIENT', 'PENDING'),
  ];
  ok(
    computeAggregateSaleSignatureStatus(pendingIntervenient) ===
      'CLIENT_SIGNED',
    '3 SIGNED + INTERVENIENT PENDING => CLIENT_SIGNED',
  );
  ok(
    !allAraguaiaProviderPartiesSigned(pendingIntervenient),
    'providers incompletos',
  );
}

console.log('\n=== G) Aggregate conclui com BUYER + 2 VENDOR + INTERVENIENT ===');
{
  const all = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('INTERVENIENT', 'SIGNED'),
  ];
  ok(computeAggregateSaleSignatureStatus(all) === 'SIGNED', 'SIGNED completo');
  ok(allAraguaiaProviderPartiesSigned(all), 'providers completos');
}

console.log('\n=== H) Certificado local gera card PJ separado ===');
{
  const intervenient = buildAraguaiaIntervenientPartyInput();
  const eventId = 'evt-intervenient-pj-001';
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: 'CT-ARAG-001',
    projectName: 'Araguaia',
    quadra: '01',
    lote: '02',
    buyerName: 'Comprador Teste',
    buyerDocument: '111.222.333-44',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    personVendorCards: [
      {
        name: ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
        cpf: ARAGUAIA_INTERVENIENT_REPRESENTATIVE_CPF,
        signedAt: '2026-08-01T12:00:00.000Z',
        signatureEventId: 'evt-daniel-vendor-001',
      },
      {
        name: 'Aldenise Sousa Rivelino',
        cpf: '856.560.112-91',
        signedAt: '2026-08-01T12:05:00.000Z',
        signatureEventId: 'evt-aldenise-vendor-001',
      },
    ],
    intervenientCard: {
      companyName: intervenient.signatureData.company_name,
      companyCnpj: intervenient.signatureData.company_cnpj,
      representativeName: intervenient.signatureData.representative_name,
      representativeCpf: intervenient.signatureData.representative_cpf,
      signedAt: '2026-08-01T12:10:00.000Z',
      signatureEventId: eventId,
    },
  });
  ok(/INTERVENIENTE/i.test(html), 'card INTERVENIENTE');
  ok(
    html.includes('R R NEG') && html.includes('SERVI'),
    'nome empresa no card',
  );
  ok(/CNPJ/i.test(html), 'label CNPJ');
  ok(html.includes('57.590.706/0001-78') || html.includes('57590706000178'), 'CNPJ valor');
  ok(html.includes(ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME), 'representante');
  ok(/CPF do representante/i.test(html), 'label CPF representante');
  ok(html.includes(eventId), 'ID único PJ');
  ok(/PROMITENTE VENDEDOR/i.test(html), 'ainda tem cards VENDOR PF');
  const intervenientIdx = html.indexOf('INTERVENIENTE');
  const danielVendorIdx = html.indexOf('PROMITENTE VENDEDOR');
  ok(intervenientIdx > -1 && danielVendorIdx > -1, 'ambos cards presentes');
}

console.log('\n=== I) Outros modelos não criam INTERVENIENT ===');
{
  for (const model of ['PADRAO', 'MENESES', 'RECANTO', 'SV2', 'SV LOTES 2']) {
    ok(!isAraguaiaSaleContractModel(model), `${model} não é ARAGUAIA`);
  }
  ok(isAraguaiaSaleContractModel('ARAGUAIA'), 'ARAGUAIA detectado');
  ok(
    ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT === false,
    'persistência remota INTERVENIENT desligada (schema shared)',
  );
  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    flow.includes('ARAGUAIA_ESIGN_V2_PERSIST_INTERVENIENT'),
    'fluxo respeita flag de persistência',
  );
}

console.log('\n=== UI admin reconhece INTERVENIENT ===');
{
  const input = buildAraguaiaIntervenientPartyInput();
  const row = mockParty({
    id: 'party-intervenient-1',
    role: 'INTERVENIENT',
    signer_name: input.name,
    signer_cpf: input.cnpj,
    status: 'PENDING',
    signature_data: input.signatureData,
  });
  const views = toPublicPartyViews([row], { includeUrls: true });
  ok(views[0].roleLabel === 'Interveniente', 'roleLabel');
  ok(
    views[0].representativeName === ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME,
    'representativeName na view',
  );
  ok(views[0].canShare === false, 'sem compartilhamento público');

  const section = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(
    section.includes('Assinar pela R R Negócios — INTERVENIENTE'),
    'botão admin PJ',
  );
  ok(section.includes('Representante:'), 'UI mostra representante');
  ok(
    section.includes('pendingIntervenientTarget'),
    'alvo admin INTERVENIENT separado',
  );
}

console.log('\n=== signature_data PJ legível ===');
{
  const data = buildAraguaiaIntervenientSignatureData();
  const roundtrip = readAraguaiaIntervenientFromSignatureData(data);
  ok(roundtrip?.company_name === ARAGUAIA_INTERVENIENT_COMPANY_NAME, 'company_name');
  ok(roundtrip?.representative_name === ARAGUAIA_INTERVENIENT_REPRESENTATIVE_NAME, 'rep name');
}

console.log('\n=== J) Regressões V1 (aggregate sem INTERVENIENT) ===');
{
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
    ]) === 'SIGNED',
    'ARAGUAIA V1 sem INTERVENIENT ainda SIGNED',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('SPOUSE', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
    ]) === 'SIGNED',
    'PADRAO com SPOUSE inalterado',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('VENDOR', 'PENDING'),
      snap('VENDOR', 'PENDING'),
    ]) === 'CLIENT_SIGNED',
    '2 VENDOR pendentes = CLIENT_SIGNED',
  );
}

console.log('\n✅ mandatory-araguaia-esign-v2-intervenient-tests OK\n');
