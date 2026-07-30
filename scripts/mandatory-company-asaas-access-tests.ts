/**
 * Regressão — acesso Asaas Company multi-tenant (sem copiar credenciais).
 * npx tsx scripts/mandatory-company-asaas-access-tests.ts
 */
import {
  ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV,
  describeCompanyAsaasProvision,
  getCompanyAsaasAllowedCompanyIds,
  isCompanyAsaasAllowlistRestricted,
  isCompanyAsaasEnabled,
} from '../lib/finance/companyAsaasAccess';
import { TOPOGRAFIA_COMPANY_ID } from '../lib/companySettingsLayout';
import { MENESES_COMPANY_ID } from '../lib/saasContractContent';
import fs from 'node:fs';
import path from 'node:path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testDefaultAllowsAnyTenant() {
  assert(!isCompanyAsaasAllowlistRestricted(), 'modo restrito desligado por padrão');
  assert(isCompanyAsaasEnabled(TOPOGRAFIA_COMPANY_ID), 'topografia ok');
  assert(isCompanyAsaasEnabled(MENESES_COMPANY_ID), 'meneses ok');
  assert(
    isCompanyAsaasEnabled('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    'empresa futura ok',
  );
  assert(!isCompanyAsaasEnabled(''), 'vazio bloqueado');
  assert(!isCompanyAsaasEnabled(null), 'null bloqueado');
  console.log('OK testDefaultAllowsAnyTenant');
}

function testAllowlistContainsReferenceCompanies() {
  const ids = getCompanyAsaasAllowedCompanyIds().map((id) => id.toLowerCase());
  assert(ids.includes(TOPOGRAFIA_COMPANY_ID.toLowerCase()), 'topografia na allowlist');
  assert(ids.includes(MENESES_COMPANY_ID.toLowerCase()), 'meneses na allowlist');
  console.log('OK testAllowlistContainsReferenceCompanies');
}

function testRestrictModeEnvDocumented() {
  const src = read('lib/finance/companyAsaasAccess.ts');
  assert(src.includes(ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV), 'env restrito');
  const prev = process.env[ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV];
  process.env[ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV] = 'true';
  // cache: módulo já cacheou restrict=false — validamos só documentação + provision
  const provision = describeCompanyAsaasProvision(TOPOGRAFIA_COMPANY_ID);
  assert(provision.financialAccountsPreseeded === false, 'sem preseed conta');
  assert(provision.credentialsPreseeded === false, 'sem preseed token');
  assert(provision.asaasAccessEnabled === true, 'acesso habilitado');
  if (prev === undefined) delete process.env[ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV];
  else process.env[ASAAS_COMPANY_RESTRICT_TO_ALLOWLIST_ENV] = prev;
  console.log('OK testRestrictModeEnvDocumented');
}

function testCreateRouteDoesNotCopyCredentials() {
  const create = read('app/api/companies/create/route.ts');
  assert(create.includes('describeCompanyAsaasProvision'), 'provision no create');
  assert(!/sandbox_api_key|production_api_key|walletId/i.test(create), 'sem credenciais');
  console.log('OK testCreateRouteDoesNotCopyCredentials');
}

function main() {
  testDefaultAllowsAnyTenant();
  testAllowlistContainsReferenceCompanies();
  testRestrictModeEnvDocumented();
  testCreateRouteDoesNotCopyCredentials();
  console.log('\nALL mandatory-company-asaas-access-tests PASSED');
}

main();
