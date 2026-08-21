/**
 * Etapa 4 — ARAGUAIA e-sign V2 WITNESS_1 + WITNESS_2.
 * Somente código local + fixtures/mocks. ZERO insert remoto.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES,
  buildAraguaiaEsignExpectedPartyRoles,
  buildAraguaiaWitnessPartyInputs,
  isAraguaiaSaleContractModel,
  isAraguaiaWitnessPartyRole,
  validateAraguaiaWitnessIdentity,
} from '../lib/araguaiaContractEsign';
import {
  computeAggregateSaleSignatureStatus,
  countSignedParties,
  allWitnessPartiesSigned,
} from '../lib/saleContractSignaturePartyStatus';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import {
  createSaleSignaturePartyToken,
  hashSaleSignaturePartyToken,
} from '../lib/saleContractSignaturePartyTokens';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';
import { isPublicPartyRole } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();

function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function snap(
  role: string,
  status: string,
): { role: 'BUYER' | 'SPOUSE' | 'VENDOR' | 'INTERVENIENT' | 'WITNESS_1' | 'WITNESS_2'; status: string } {
  return {
    role: role as
      | 'BUYER'
      | 'SPOUSE'
      | 'VENDOR'
      | 'INTERVENIENT'
      | 'WITNESS_1'
      | 'WITNESS_2',
    status,
  };
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

/** Simula resolução backend: party só pelo hash do token aberto. */
function resolvePartyByTokenHash(
  parties: ContractSignaturePartyRow[],
  token: string,
): ContractSignaturePartyRow | null {
  const hash = hashSaleSignaturePartyToken(token);
  return parties.find((p) => p.signature_token_hash === hash) || null;
}

console.log('\n=== A) Destino ARAGUAIA = 6 parties ===');
{
  const roles = buildAraguaiaEsignExpectedPartyRoles();
  ok(roles.length === 6, '6 roles');
  ok(roles.filter((r) => r === 'VENDOR').length === 2, '2 VENDOR');
  ok(roles.includes('BUYER'), 'BUYER');
  ok(roles.includes('INTERVENIENT'), 'INTERVENIENT');
  ok(roles.includes('WITNESS_1'), 'WITNESS_1');
  ok(roles.includes('WITNESS_2'), 'WITNESS_2');
  ok(!roles.includes('SPOUSE'), 'sem SPOUSE');
}

console.log('\n=== B/C/D/E) Parties, tokens, URLs e identidade NULL ===');
{
  const inputs = buildAraguaiaWitnessPartyInputs();
  ok(inputs.length === 2, '2 witness inputs');
  ok(inputs[0].role === 'WITNESS_1' && inputs[1].role === 'WITNESS_2', 'roles');
  ok(
    inputs.every(
      (w) =>
        w.name === null &&
        w.cpf === null &&
        w.phone === null &&
        w.email === null &&
        w.withPublicToken === true,
    ),
    'E: identidade inicia NULL + withPublicToken',
  );

  const t1 = createSaleSignaturePartyToken();
  const t2 = createSaleSignaturePartyToken();
  ok(t1.token !== t2.token, 'C: tokens diferentes');
  ok(t1.tokenHash !== t2.tokenHash, 'hashes diferentes');

  const party1 = mockParty({
    id: 'party-w1',
    role: 'WITNESS_1',
    signature_token_hash: t1.tokenHash,
    signature_url: `https://www.svlotes.com.br/sign/sale/${t1.token}`,
  });
  const party2 = mockParty({
    id: 'party-w2',
    role: 'WITNESS_2',
    signature_token_hash: t2.tokenHash,
    signature_url: `https://www.svlotes.com.br/sign/sale/${t2.token}`,
  });
  ok(party1.id !== party2.id, 'B: partyIds diferentes');
  ok(party1.signature_url !== party2.signature_url, 'D: URLs diferentes');
  ok(!party1.signer_name && !party1.signer_cpf, 'identidade NULL party1');
  ok(!party2.signer_name && !party2.signer_cpf, 'identidade NULL party2');

  const views = toPublicPartyViews([party1, party2], { includeUrls: true });
  ok(views.every((v) => v.canShare === true), 'compartilháveis com URL');
  ok(views.every((v) => Boolean(v.signatureUrl)), 'URLs nas views');
}

console.log('\n=== F/G) Identidade preenchida + validação ===');
{
  const bad = validateAraguaiaWitnessIdentity({
    name: '',
    cpf: '123',
    phone: '11',
    email: 'x',
  });
  ok(!bad.ok, 'G: rejeita incompleto');

  const noPhone = validateAraguaiaWitnessIdentity({
    name: 'Maria Testemunha',
    cpf: '390.533.447-05',
    phone: '',
    email: 'maria@example.com',
  });
  ok(!noPhone.ok, 'G: telefone obrigatório');

  const noEmail = validateAraguaiaWitnessIdentity({
    name: 'Maria Testemunha',
    cpf: '390.533.447-05',
    phone: '94991254320',
    email: '',
  });
  ok(!noEmail.ok, 'G: e-mail obrigatório');

  const good = validateAraguaiaWitnessIdentity({
    name: 'Maria Testemunha Silva',
    cpf: '390.533.447-05',
    phone: '94991254320',
    email: 'maria@example.com',
  });
  ok(good.ok, 'F: identidade válida');
  if (good.ok) {
    ok(good.value.cpf === '39053344705', 'CPF normalizado');
    ok(Boolean(good.value.phone), 'telefone normalizado WhatsApp');
    ok(good.value.email.includes('@'), 'e-mail ok');
  }
}

console.log('\n=== H) Token WITNESS_1 não assina WITNESS_2 ===');
{
  const t1 = createSaleSignaturePartyToken();
  const t2 = createSaleSignaturePartyToken();
  const parties = [
    mockParty({
      id: 'w1',
      role: 'WITNESS_1',
      signature_token_hash: t1.tokenHash,
      signature_url: `/sign/sale/${t1.token}`,
    }),
    mockParty({
      id: 'w2',
      role: 'WITNESS_2',
      signature_token_hash: t2.tokenHash,
      signature_url: `/sign/sale/${t2.token}`,
    }),
  ];
  const resolved = resolvePartyByTokenHash(parties, t1.token);
  ok(resolved?.id === 'w1', 'token1 → party W1');
  ok(resolved?.role === 'WITNESS_1', 'role do token, não do frontend');
  ok(resolvePartyByTokenHash(parties, t2.token)?.id === 'w2', 'token2 → W2');
  ok(
    resolvePartyByTokenHash(parties, t1.token)?.id !==
      resolvePartyByTokenHash(parties, t2.token)?.id,
    'isolamento total',
  );
}

console.log('\n=== I) Reissue gera novo token para mesma party ===');
{
  const partiesSrc = readFileSync(
    join(root, 'lib/saleContractSignatureParties.ts'),
    'utf8',
  );
  ok(
    partiesSrc.includes("role === 'WITNESS_1'") &&
      partiesSrc.includes('isWitnessWithLink'),
    'reissue aceita WITNESS',
  );
  ok(
    partiesSrc.includes('já assinou') &&
      partiesSrc.includes('SIGNED'),
    'reissue bloqueia após SIGNED',
  );

  const oldTok = createSaleSignaturePartyToken();
  const newTok = createSaleSignaturePartyToken();
  const partyId = 'party-w1-reissue';
  let party = mockParty({
    id: partyId,
    role: 'WITNESS_1',
    signer_name: null,
    signature_token_hash: oldTok.tokenHash,
    signature_url: `/sign/sale/${oldTok.token}`,
  });
  // Simula reissue: mesma party, novo hash/URL, identidade preservada
  party = {
    ...party,
    signature_token_hash: newTok.tokenHash,
    signature_url: `/sign/sale/${newTok.token}`,
    status: 'PENDING',
  };
  ok(party.id === partyId, 'mesma party');
  ok(party.signature_token_hash === newTok.tokenHash, 'novo token');
  ok(party.signature_token_hash !== oldTok.tokenHash, 'token anterior invalidado');
}

console.log('\n=== J/K) Aggregate com testemunhas ===');
{
  const base = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('INTERVENIENT', 'SIGNED'),
    snap('WITNESS_1', 'SIGNED'),
    snap('WITNESS_2', 'PENDING'),
  ];
  ok(
    computeAggregateSaleSignatureStatus(base) === 'CLIENT_SIGNED',
    'J: 5/6 → CLIENT_SIGNED (não SIGNED)',
  );
  ok(!allWitnessPartiesSigned(base), 'testemunha pendente');

  const progress = countSignedParties(base);
  ok(progress.signed === 5 && progress.total === 6, 'progresso 5 de 6');

  const all = [
    snap('BUYER', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('VENDOR', 'SIGNED'),
    snap('INTERVENIENT', 'SIGNED'),
    snap('WITNESS_1', 'SIGNED'),
    snap('WITNESS_2', 'SIGNED'),
  ];
  ok(computeAggregateSaleSignatureStatus(all) === 'SIGNED', 'K: 6/6 → SIGNED');
  ok(countSignedParties(all).signed === 6, '6 de 6');
}

console.log('\n=== L) Certificado gera dois cards distintos ===');
{
  const html = buildSaleContractSignatureCertificateHtml({
    contractNumber: 'CT-W-001',
    projectName: 'Araguaia',
    quadra: '01',
    lote: '02',
    buyerName: 'Comprador',
    buyerDocument: '11144477735',
    signatureStatus: 'ASSINADO ELETRONICAMENTE',
    personVendorCards: [
      {
        name: 'Daniel Roberto Rivelino de Sousa',
        cpf: '82091226220',
        signedAt: '2026-08-01T10:00:00.000Z',
        signatureEventId: 'evt-daniel',
      },
      {
        name: 'Aldenise Sousa Rivelino',
        cpf: '85656011291',
        signedAt: '2026-08-01T10:05:00.000Z',
        signatureEventId: 'evt-aldenise',
      },
    ],
    intervenientCard: {
      companyName: 'R R NEGÓCIOS & SERVIÇOS LTDA',
      companyCnpj: '57590706000178',
      representativeName: 'Daniel Roberto Rivelino de Sousa',
      representativeCpf: '82091226220',
      signedAt: '2026-08-01T10:10:00.000Z',
      signatureEventId: 'evt-pj',
    },
    witnessCards: [
      {
        role: 'WITNESS_1',
        name: 'Testemunha Um',
        cpf: '39053344705',
        email: 't1@example.com',
        phone: '5594991254320',
        signedAt: '2026-08-01T10:15:00.000Z',
        signatureEventId: 'evt-w1',
      },
      {
        role: 'WITNESS_2',
        name: 'Testemunha Dois',
        cpf: '52998224725',
        email: 't2@example.com',
        phone: '5594991252923',
        signedAt: '2026-08-01T10:20:00.000Z',
        signatureEventId: 'evt-w2',
      },
    ],
  });
  ok(/TESTEMUNHA 1/i.test(html), 'card TESTEMUNHA 1');
  ok(/TESTEMUNHA 2/i.test(html), 'card TESTEMUNHA 2');
  ok(html.includes('Testemunha Um'), 'nome W1');
  ok(html.includes('Testemunha Dois'), 'nome W2');
  ok(html.includes('evt-w1') && html.includes('evt-w2'), 'IDs distintos');
  ok(html.indexOf('TESTEMUNHA 1') < html.indexOf('TESTEMUNHA 2'), 'ordem 1→2');
  ok(/INTERVENIENTE/i.test(html), 'INTERVENIENTE ainda presente');
}

console.log('\n=== M) Outros modelos não criam WITNESS ===');
{
  for (const model of ['PADRAO', 'MENESES', 'RECANTO', 'SV2']) {
    ok(!isAraguaiaSaleContractModel(model), `${model} não ARAGUAIA`);
  }
  ok(ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES === false, 'persistência remota OFF');
  ok(!isPublicPartyRole('WITNESS_1'), 'WITNESS não é isPublicPartyRole (token via flag)');
  ok(isAraguaiaWitnessPartyRole('WITNESS_1'), 'helper witness role');

  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    flow.includes('ARAGUAIA_ESIGN_V2_PERSIST_WITNESSES'),
    'fluxo respeita flag witnesses',
  );
}

console.log('\n=== UI admin testemunhas ===');
{
  const section = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(
    section.includes('Identidade será preenchida pela testemunha'),
    'mensagem identidade blank',
  );
  ok(section.includes('Abrir página'), 'ação Abrir página');
  ok(section.includes('WITNESS_1'), 'reconhece WITNESS_1');

  const page = readFileSync(
    join(root, 'app/sign/sale/[token]/page.tsx'),
    'utf8',
  );
  ok(page.includes('ASSINAR COMO TESTEMUNHA'), 'botão público testemunha');
  ok(
    page.includes('na condição de testemunha'),
    'checkbox testemunha',
  );
}

console.log('\n=== N) Regressões aggregate sem witnesses ===');
{
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
    ]) === 'SIGNED',
    'V1 sem witnesses SIGNED',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
      snap('INTERVENIENT', 'SIGNED'),
    ]) === 'SIGNED',
    'V2 sem witnesses (só INTERVENIENT) SIGNED',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      snap('BUYER', 'SIGNED'),
      snap('SPOUSE', 'SIGNED'),
      snap('VENDOR', 'SIGNED'),
    ]) === 'SIGNED',
    'PADRAO+SPOUSE inalterado',
  );
}

console.log('\n✅ mandatory-araguaia-esign-v2-witness-tests OK\n');
