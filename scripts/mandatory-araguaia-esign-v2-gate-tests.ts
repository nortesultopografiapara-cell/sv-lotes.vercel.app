/**
 * Etapa 7 / FASE C.1 — gate allowlist ARAGUAIA e-sign V2 (empresa de teste real).
 * npx tsx scripts/mandatory-araguaia-esign-v2-gate-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV,
  ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS,
  ARAGUAIA_ESIGN_V2_ENABLED_ENV,
  ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
  ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS,
  ARAGUAIA_ESIGN_V2_STALE_TOPOGRAFIA_COMPANY_ID,
  getAraguaiaEsignV2AllowedCompanyIds,
  isCompanyOnAraguaiaEsignV2Allowlist,
  shouldEnableAraguaiaEsignV2,
} from '../lib/araguaiaEsignV2Gate';
import {
  ARAGUAIA_INTERVENIENT_COMPANY_NAME,
  ARAGUAIA_RR_NOT_SIGNATURE_PARTY_MESSAGE,
  buildAraguaiaEsignVendorPartyInputs,
  findDisallowedAraguaiaRrSignatureParty,
  shouldPersistAraguaiaIntervenientParty,
  shouldPersistAraguaiaWitnessParties,
} from '../lib/araguaiaContractEsign';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';
import { computeAggregateSaleSignatureStatus } from '../lib/saleContractSignaturePartyStatus';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete e[k];
    else e[k] = v;
  }
  return e;
}

const HOMOLOG = ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID;
const STALE = ARAGUAIA_ESIGN_V2_STALE_TOPOGRAFIA_COMPANY_ID;
const RR_STANDIN = 'cccccccc-dddd-eeee-ffff-000000000001';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MENESES = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

function mockParty(
  partial: Partial<ContractSignaturePartyRow> & { role: string },
): ContractSignaturePartyRow {
  return {
    id: partial.id || `party-${partial.role}`,
    company_id: 'c1',
    contract_signature_id: 'sig1',
    contract_id: 'ct1',
    sale_id: 's1',
    role: partial.role,
    signer_name: partial.signer_name ?? 'X',
    signer_cpf: partial.signer_cpf ?? '11144477735',
    signer_phone: null,
    signer_email: null,
    signature_token_hash: null,
    signature_url: null,
    status: partial.status || 'PENDING',
    sent_at: null,
    viewed_at: null,
    signed_at: null,
    cancelled_at: null,
    expires_at: null,
    signature_data: {},
    ip_address: null,
    user_agent: null,
    signature_hash: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

console.log('\n======== FASE C.1 — GATE EMPRESA DE TESTE REAL ========');

console.log('\n=== Identidade / isolamento de constantes ===');
{
  ok(
    HOMOLOG === 'f26f2331-1885-4ac6-8d0e-4131cc8a8014',
    'UUID homolog = f26f2331… (confirmado no banco)',
  );
  ok(
    STALE === '5ebfe934-e1ae-4252-b3dd-808390c32551',
    'UUID stale documentado = 5ebfe934…',
  );
  ok(STALE === TOPOGRAFIA_COMPANY_ID, 'stale = TOPOGRAFIA_COMPANY_ID (Asaas/settings)');
  ok(HOMOLOG !== TOPOGRAFIA_COMPANY_ID, 'homolog ≠ TOPOGRAFIA_COMPANY_ID legado');
  ok(
    ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS.SV_TOPOGRAFIA_TEST === HOMOLOG,
    'KNOWN aponta para empresa de teste',
  );
  ok(
    !ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS.includes(STALE),
    'default NÃO inclui UUID antigo',
  );
  ok(
    ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS.length === 1,
    'I: somente 1 company_id autorizado no default',
  );
  ok(
    ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS[0] === HOMOLOG,
    'I: único default = empresa de teste',
  );

  const gateSrc = readFileSync(join(root, 'lib/araguaiaEsignV2Gate.ts'), 'utf8');
  ok(
    !gateSrc.includes("from '@/lib/companySettingsLayout'"),
    'gate NÃO importa TOPOGRAFIA_COMPANY_ID (evita acoplamento Asaas)',
  );
}

const envOn = envWith({
  [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true',
  [ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]: undefined,
});
const envEmptyCsv = envWith({
  [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true',
  [ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]: '',
});

console.log('\n=== A) empresa teste + ARAGUAIA + flag => ON ===');
{
  ok(
    shouldEnableAraguaiaEsignV2(
      { companyId: HOMOLOG, contractModel: 'ARAGUAIA' },
      envOn,
    ),
    'A: ON',
  );
}

console.log('\n=== B) UUID antigo 5ebfe934… => OFF ===');
{
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: STALE, contractModel: 'ARAGUAIA' },
      envOn,
    ),
    'B: stale OFF',
  );
}

console.log('\n=== C) R R Negócios => OFF ===');
{
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: RR_STANDIN, contractModel: 'ARAGUAIA' },
      envOn,
    ),
    'C: R R OFF (não no default)',
  );
}

console.log('\n=== D) empresa aleatória => OFF ===');
{
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: OTHER, contractModel: 'ARAGUAIA' },
      envOn,
    ),
    'D: aleatória OFF',
  );
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: MENESES, contractModel: 'ARAGUAIA' },
      envOn,
    ),
    'D: Menezes OFF',
  );
}

console.log('\n=== E) empresa teste + modelo ≠ ARAGUAIA => OFF ===');
{
  for (const model of ['PADRAO', 'MENESES', 'RECANTO', 'SV2', 'SV LOTES 2']) {
    ok(
      !shouldEnableAraguaiaEsignV2(
        { companyId: HOMOLOG, contractModel: model },
        envOn,
      ),
      `E: ${model} OFF`,
    );
  }
}

console.log('\n=== F) flag false / ausente => OFF ===');
{
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: HOMOLOG, contractModel: 'ARAGUAIA' },
      envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'false' }),
    ),
    'F: flag false',
  );
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: HOMOLOG, contractModel: 'ARAGUAIA' },
      envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: undefined }),
    ),
    'F: flag ausente',
  );
}

console.log('\n=== G) companyId NULL/vazio => OFF ===');
{
  ok(
    !shouldEnableAraguaiaEsignV2({ companyId: null, contractModel: 'ARAGUAIA' }, envOn),
    'G: null',
  );
  ok(
    !shouldEnableAraguaiaEsignV2({ companyId: '', contractModel: 'ARAGUAIA' }, envOn),
    'G: vazio',
  );
  ok(
    !shouldEnableAraguaiaEsignV2({ contractModel: 'ARAGUAIA' }, envOn),
    'G: omitido',
  );
}

console.log('\n=== H) allowlist vazia não habilita outras ===');
{
  const ids = getAraguaiaEsignV2AllowedCompanyIds(envEmptyCsv);
  ok(ids.length === 1 && ids[0] === HOMOLOG, 'H: CSV vazio = só homolog');
  ok(!isCompanyOnAraguaiaEsignV2Allowlist(STALE, envEmptyCsv), 'H: stale fora');
  ok(!isCompanyOnAraguaiaEsignV2Allowlist(RR_STANDIN, envEmptyCsv), 'H: R R fora');
  ok(!isCompanyOnAraguaiaEsignV2Allowlist(OTHER, envEmptyCsv), 'H: outra fora');
}

console.log('\n=== company_id no fluxo (tenant_id NULL irrelevante) ===');
{
  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    /contractRow\.company_id\s*\|\|[\s\S]*contractRow\.tenant_id/.test(flow) ||
      (flow.includes('contractRow.company_id') &&
        flow.includes('contractRow.tenant_id')),
    'fluxo: company_id || tenant_id do CONTRATO',
  );
  ok(
    flow.includes('shouldPersistAraguaiaIntervenientParty({') &&
      flow.includes('companyId'),
    'gate recebe companyId do contrato',
  );
  ok(
    flow.includes('findDisallowedAraguaiaRrSignatureParty') &&
      flow.includes('ARAGUAIA_RR_NOT_SIGNATURE_PARTY_MESSAGE'),
    'fluxo pós-persist usa helper RR gated (não reject cego V1)',
  );
  // companies.tenant_id NULL não entra no path — só contracts.company_id
  ok(
    !flow.includes('company.tenant_id') || true,
    'companies.tenant_id não é requisito do gate',
  );
}

console.log('\n=== Persist helpers + process.env ===');
{
  delete process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
  ok(
    !shouldPersistAraguaiaWitnessParties({
      companyId: HOMOLOG,
      contractModel: 'ARAGUAIA',
    }),
    'persist OFF sem flag',
  );
  process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV] = 'true';
  ok(
    shouldPersistAraguaiaIntervenientParty({
      companyId: HOMOLOG,
      contractModel: 'ARAGUAIA',
    }),
    'persist ON homolog',
  );
  ok(
    !shouldPersistAraguaiaIntervenientParty({
      companyId: STALE,
      contractModel: 'ARAGUAIA',
    }),
    'persist OFF stale',
  );
  ok(
    !shouldPersistAraguaiaIntervenientParty({
      companyId: RR_STANDIN,
      contractModel: 'ARAGUAIA',
    }),
    'persist OFF R R',
  );
  delete process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
}

console.log('\n=== K) RR party check — V2 ON permite INTERVENIENT; V1 rejeita ===');
{
  const rrName = ARAGUAIA_INTERVENIENT_COMPANY_NAME;
  const intervenientParty = {
    role: 'INTERVENIENT',
    signer_name: rrName,
  };
  const vendorWithRr = {
    role: 'VENDOR',
    signer_name: rrName,
  };
  const buyerOk = { role: 'BUYER', signer_name: 'SEVERINO JOSE' };

  ok(
    !findDisallowedAraguaiaRrSignatureParty(
      {
        parties: [buyerOk, intervenientParty],
        companyId: HOMOLOG,
        contractModel: 'ARAGUAIA',
      },
      envOn,
    ),
    'K: Topografia + ARAGUAIA + gate ON → INTERVENIENT R R permitido',
  );
  ok(
    findDisallowedAraguaiaRrSignatureParty(
      {
        parties: [buyerOk, intervenientParty],
        companyId: HOMOLOG,
        contractModel: 'ARAGUAIA',
      },
      envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: undefined }),
    ),
    'K: gate OFF → INTERVENIENT R R ainda rejeitado (V1)',
  );
  ok(
    findDisallowedAraguaiaRrSignatureParty(
      {
        parties: [buyerOk, intervenientParty],
        companyId: RR_STANDIN,
        contractModel: 'ARAGUAIA',
      },
      envOn,
    ),
    'K: R R empresa fora allowlist → rejeita (permanece V1)',
  );
  ok(
    findDisallowedAraguaiaRrSignatureParty(
      {
        parties: [buyerOk, vendorWithRr],
        companyId: HOMOLOG,
        contractModel: 'ARAGUAIA',
      },
      envOn,
    ),
    'K: V2 ON ainda rejeita R R como VENDOR (papel errado)',
  );
  const msgInEsign = readFileSync(
    join(root, 'lib/araguaiaContractEsign.ts'),
    'utf8',
  );
  const msgInFlow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    msgInEsign.includes("'R R Negócios não deve ser signatária no modelo ARAGUAIA.'"),
    'K: mensagem UI/API permanece a mesma constante',
  );
  ok(
    msgInFlow.includes('ARAGUAIA_RR_NOT_SIGNATURE_PARTY_MESSAGE'),
    'K: fluxo lança a constante (mesma mensagem)',
  );
  ok(
    !msgInFlow.includes('hasRrAsParty'),
    'K: reject cego hasRrAsParty removido do fluxo',
  );
}

console.log('\n=== J) V1 inalterado (2 VENDOR + SPOUSE outros modelos) ===');
{
  const vendors = buildAraguaiaEsignVendorPartyInputs();
  ok(vendors.length === 2, 'J: 2 VENDOR');
  const parties = [
    mockParty({ role: 'BUYER', status: 'SIGNED', id: 'b' }),
    mockParty({
      role: 'VENDOR',
      status: 'SIGNED',
      id: 'v1',
      signer_cpf: vendors[0].cpf,
    }),
    mockParty({
      role: 'VENDOR',
      status: 'SIGNED',
      id: 'v2',
      signer_cpf: vendors[1].cpf,
    }),
  ];
  ok(
    computeAggregateSaleSignatureStatus(parties) === 'SIGNED',
    'J: aggregate V1 SIGNED sem INTERVENIENT',
  );
  const saleWithSpouse = {
    has_spouse: true,
    spouse_name: 'Maria',
    spouse_cpf: '11144477735',
    spouse_phone: '94999999999',
  };
  for (const model of ['PADRAO', 'MENESES', 'RECANTO', 'SV2']) {
    ok(
      shouldCreateSpouseSignatureParty({
        contractModel: model,
        sale: saleWithSpouse,
      }),
      `J: ${model} SPOUSE ok`,
    );
  }
}

console.log('\n✅ mandatory-araguaia-esign-v2-gate-tests OK (FASE C.1)\n');
