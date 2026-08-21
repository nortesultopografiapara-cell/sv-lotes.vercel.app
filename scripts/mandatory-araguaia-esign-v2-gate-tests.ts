/**
 * Etapa 7 / FASE B — gate allowlist ARAGUAIA e-sign V2.
 * npx tsx scripts/mandatory-araguaia-esign-v2-gate-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV,
  ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS,
  ARAGUAIA_ESIGN_V2_ENABLED_ENV,
  ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS,
  getAraguaiaEsignV2AllowedCompanyIds,
  shouldEnableAraguaiaEsignV2,
} from '../lib/araguaiaEsignV2Gate';
import {
  buildAraguaiaEsignVendorPartyInputs,
  shouldPersistAraguaiaIntervenientParty,
  shouldPersistAraguaiaWitnessParties,
} from '../lib/araguaiaContractEsign';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import { shouldCreateSpouseSignatureParty } from '../lib/saleContractSignaturePartyRules';
import {
  computeAggregateSaleSignatureStatus,
} from '../lib/saleContractSignaturePartyStatus';
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

const OTHER_COMPANY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const RR_PENDING = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

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

console.log('\n======== FASE B — GATE ALLOWLIST ARAGUAIA E-SIGN V2 ========');

console.log('\n=== Origem dos IDs ===');
{
  ok(
    ARAGUAIA_ESIGN_V2_KNOWN_COMPANY_IDS.SV_TOPOGRAFIA === TOPOGRAFIA_COMPANY_ID,
    'SV Topografia = TOPOGRAFIA_COMPANY_ID do layout',
  );
  ok(
    ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS.includes(TOPOGRAFIA_COMPANY_ID),
    'default allowlist inclui SV Topografia',
  );
  ok(
    !ARAGUAIA_ESIGN_V2_DEFAULT_ALLOWED_COMPANY_IDS.some((id) =>
      /R.?R/i.test(id),
    ),
    'R R NÃO hardcoded sem SELECT (sem UUID inventado)',
  );
}

console.log('\n=== A) ARAGUAIA + empresa autorizada => V2 ===');
{
  const env = envWith({
    [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true',
  });
  ok(
    shouldEnableAraguaiaEsignV2(
      { companyId: TOPOGRAFIA_COMPANY_ID, contractModel: 'ARAGUAIA' },
      env,
    ),
    'A: Topografia + ARAGUAIA + flag',
  );
  process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV] = 'true';
  ok(
    shouldPersistAraguaiaIntervenientParty({
      companyId: TOPOGRAFIA_COMPANY_ID,
      contractModel: 'ARAGUAIA',
    }),
    'A: persist INTERVENIENT ON com gate',
  );
  ok(
    shouldPersistAraguaiaWitnessParties({
      companyId: TOPOGRAFIA_COMPANY_ID,
      contractModel: 'ARAGUAIA',
    }),
    'A: persist WITNESS ON com gate',
  );
  delete process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
}

console.log('\n=== A2) ARAGUAIA + R R via env CSV => V2 ===');
{
  const env = envWith({
    [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true',
    [ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]: RR_PENDING,
  });
  ok(
    shouldEnableAraguaiaEsignV2(
      { companyId: RR_PENDING, contractModel: 'ARAGUAIA' },
      env,
    ),
    'A2: R R na allowlist via env',
  );
  ok(
    getAraguaiaEsignV2AllowedCompanyIds(env).includes(TOPOGRAFIA_COMPANY_ID),
    'A2: defaults + env (Topografia permanece)',
  );
}

console.log('\n=== B) ARAGUAIA + empresa NÃO autorizada => V1 ===');
{
  const env = envWith({
    [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true',
    [ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]: undefined,
  });
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: OTHER_COMPANY, contractModel: 'ARAGUAIA' },
      env,
    ),
    'B: ARAGUAIA fora da allowlist = V2 off',
  );
}

console.log('\n=== C) PADRAO + empresa autorizada => atual ===');
{
  const env = envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true' });
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: TOPOGRAFIA_COMPANY_ID, contractModel: 'PADRAO' },
      env,
    ),
    'C: PADRAO não habilita V2',
  );
}

console.log('\n=== D/E/F) MENESES / RECANTO / SV2 inalterados (V2 off) ===');
{
  const env = envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true' });
  for (const model of ['MENESES', 'RECANTO', 'RECANTO_PRIMAVERA', 'SV2', 'SV LOTES 2']) {
    ok(
      !shouldEnableAraguaiaEsignV2(
        { companyId: TOPOGRAFIA_COMPANY_ID, contractModel: model },
        env,
      ),
      `${model} => V2 off`,
    );
  }
}

console.log('\n=== G) sem companyId => fail closed ===');
{
  const env = envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'true' });
  ok(
    !shouldEnableAraguaiaEsignV2({ companyId: '', contractModel: 'ARAGUAIA' }, env),
    'G: companyId vazio',
  );
  ok(
    !shouldEnableAraguaiaEsignV2({ companyId: null, contractModel: 'ARAGUAIA' }, env),
    'G: companyId null',
  );
  ok(
    !shouldEnableAraguaiaEsignV2({ contractModel: 'ARAGUAIA' }, env),
    'G: companyId omitido',
  );
}

console.log('\n=== H) flag desligada => V2 off ===');
{
  const env = envWith({
    [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: undefined,
    [ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS_ENV]: RR_PENDING,
  });
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: TOPOGRAFIA_COMPANY_ID, contractModel: 'ARAGUAIA' },
      env,
    ),
    'H: flag ausente',
  );
  ok(
    !shouldEnableAraguaiaEsignV2(
      { companyId: RR_PENDING, contractModel: 'ARAGUAIA' },
      envWith({ [ARAGUAIA_ESIGN_V2_ENABLED_ENV]: 'false' }),
    ),
    'H: flag false',
  );
}

console.log('\n=== I) nenhuma regressão nos 2 VENDOR ===');
{
  const vendors = buildAraguaiaEsignVendorPartyInputs();
  ok(vendors.length === 2, 'I: 2 VENDOR inputs');
  ok(vendors[0].cpf !== vendors[1].cpf, 'I: CPFs distintos');
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
  const agg = computeAggregateSaleSignatureStatus(parties);
  ok(agg === 'SIGNED', 'I: V1 aggregate 2 VENDOR + BUYER = SIGNED');
}

console.log('\n=== J) SPOUSE continua nos modelos que usam SPOUSE ===');
{
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
      `J: ${model} ainda cria SPOUSE`,
    );
  }
  ok(
    !shouldCreateSpouseSignatureParty({
      contractModel: 'ARAGUAIA',
      sale: saleWithSpouse,
    }),
    'J: ARAGUAIA continua sem SPOUSE (regra de modelo)',
  );
}

console.log('\n=== Wiring party flow ===');
{
  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  ok(
    flow.includes('shouldPersistAraguaiaIntervenientParty({'),
    'flow passa companyId/contractModel ao INTERVENIENT',
  );
  ok(
    flow.includes('shouldPersistAraguaiaWitnessParties({'),
    'flow passa companyId/contractModel às testemunhas',
  );
  const gateSrc = readFileSync(join(root, 'lib/araguaiaEsignV2Gate.ts'), 'utf8');
  ok(gateSrc.includes('shouldEnableAraguaiaEsignV2'), 'helper central existe');
  ok(
    gateSrc.includes('ARAGUAIA_ESIGN_V2_ALLOWED_COMPANY_IDS'),
    'env allowlist documentada',
  );
}

console.log('\n=== Persist helpers com gate explícito (process.env limpo) ===');
{
  delete process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
  ok(
    !shouldPersistAraguaiaWitnessParties({
      companyId: TOPOGRAFIA_COMPANY_ID,
      contractModel: 'ARAGUAIA',
    }),
    'persist OFF sem flag no process.env',
  );
  process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV] = 'true';
  ok(
    shouldPersistAraguaiaIntervenientParty({
      companyId: TOPOGRAFIA_COMPANY_ID,
      contractModel: 'ARAGUAIA',
    }),
    'persist ON Topografia + flag',
  );
  ok(
    !shouldPersistAraguaiaIntervenientParty({
      companyId: OTHER_COMPANY,
      contractModel: 'ARAGUAIA',
    }),
    'persist OFF empresa estranha mesmo com flag',
  );
  delete process.env[ARAGUAIA_ESIGN_V2_ENABLED_ENV];
}

console.log('\n✅ mandatory-araguaia-esign-v2-gate-tests OK\n');
