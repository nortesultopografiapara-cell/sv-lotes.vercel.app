/**
 * Testes obrigatórios — PATCH /api/companies/update (plano personalizado Master).
 * npx tsx scripts/mandatory-companies-update-route-tests.ts
 */

import {
  buildCompanyUpdatePayload,
  COMPANY_CORE_WRITE_FIELDS,
  COMPANY_OPTIONAL_WRITE_COLUMNS,
  persistCompanyUpdateInPhases,
} from '../lib/companiesUpdateService';
import { parseCustomMonthlyPrice } from '../lib/companyPricing';
import { isPlatformAdmin } from '../lib/rls';
import { extractMissingCompanyColumnFromError } from '../lib/saasPlans';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const SV_TOPOGRAFIA_ID = '5ebfe934-e1ae-4252-b3dd-808390c32551';

function svTopografiaBody() {
  return {
    companyId: SV_TOPOGRAFIA_ID,
    userId: '00000000-0000-4000-8000-000000000099',
    name: 'S.V TOPOGRAFIA E PROJETO LTDA',
    cnpj: '00000000000100',
    phone: '94999999999',
    email: 'contato@svtopografia.com',
    plan: 'personalizado',
    plan_type: 'personalizado',
    custom_price_enabled: true,
    custom_monthly_price: 'R$ 0,01',
    max_projects: 18,
    max_lots: 15000,
    max_brokers: 35,
    admin_users_limit: 8,
    saas_commercial_note: '',
    status_operacional: 'Ativa',
    is_test_company: false,
  };
}

function testMasterAndSuperAdminPermission() {
  assert(isPlatformAdmin('SUPER_ADMIN'), 'SUPER_ADMIN');
  assert(isPlatformAdmin('MASTER_ADMIN'), 'MASTER_ADMIN');
  assert(!isPlatformAdmin('ADMIN'), 'ADMIN empresa');
  console.log('OK testMasterAndSuperAdminPermission');
}

function testPersonalizadoPayloadSvTopografia() {
  const built = buildCompanyUpdatePayload(svTopografiaBody());
  assert(built.companyId === SV_TOPOGRAFIA_ID, 'companyId');
  assert(built.planKey === 'personalizado', 'plano personalizado');
  assert(built.updatePayload.project_limit === 18, 'project_limit 18');
  assert(built.updatePayload.max_lots === 15000, 'max_lots 15000');
  assert(built.updatePayload.broker_limit === 35, 'broker_limit 35');
  assert(built.updatePayload.admin_users_limit === 8, 'admin_users_limit 8');
  assert(built.updatePayload.custom_monthly_price === 0.01, 'R$ 0,01');
  assert(built.updatePayload.saas_commercial_note === null, 'nota vazia → null');
  console.log('OK testPersonalizadoPayloadSvTopografia');
}

function testCurrencyFormats() {
  assert(parseCustomMonthlyPrice('R$ 0,01') === 0.01, 'R$ 0,01');
  assert(parseCustomMonthlyPrice('0,01') === 0.01, '0,01');
  assert(parseCustomMonthlyPrice(1) === 1, '1');
  assert(parseCustomMonthlyPrice('1,50') === 1.5, '1,50');
  console.log('OK testCurrencyFormats');
}

function testPhasedPayloadSplit() {
  const built = buildCompanyUpdatePayload(svTopografiaBody());
  const coreKeys = new Set(COMPANY_CORE_WRITE_FIELDS);
  const optionalKeys = new Set(COMPANY_OPTIONAL_WRITE_COLUMNS);

  for (const key of ['project_limit', 'broker_limit', 'custom_monthly_price', 'plan']) {
    assert(coreKeys.has(key as (typeof COMPANY_CORE_WRITE_FIELDS)[number]), `core ${key}`);
    assert(key in built.updatePayload, `payload ${key}`);
  }

  for (const key of ['max_lots', 'saas_commercial_note', 'admin_users_limit']) {
    assert(optionalKeys.has(key as (typeof COMPANY_OPTIONAL_WRITE_COLUMNS)[number]), `optional ${key}`);
    assert(key in built.updatePayload, `payload optional ${key}`);
  }

  console.log('OK testPhasedPayloadSplit');
}

async function testPhasedUpdateStripsOptionalOnSchemaMiss() {
  let attempts = 0;
  const mockAdmin = {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              attempts++;
              if ('max_lots' in payload) {
                return {
                  data: null,
                  error: {
                    message: "Could not find the 'max_lots' column of 'companies' in the schema cache",
                  },
                };
              }
              return { data: { ...payload, id: SV_TOPOGRAFIA_ID }, error: null };
            },
          }),
        }),
      }),
    }),
  };

  const built = buildCompanyUpdatePayload(svTopografiaBody());
  const result = await persistCompanyUpdateInPhases(
    mockAdmin as never,
    SV_TOPOGRAFIA_ID,
    built.updatePayload,
  );

  assert(result.error == null, 'core salvo mesmo com optional ausente');
  assert(result.data?.project_limit === 18, 'mantém project_limit');
  assert(attempts <= 4, 'no máximo 4 round-trips (não dezenas)');
  console.log('OK testPhasedUpdateStripsOptionalOnSchemaMiss');
}

async function testSupabaseErrorReturnsMessage() {
  const mockAdmin = {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'permission denied for table companies' },
            }),
          }),
        }),
      }),
    }),
  };

  const built = buildCompanyUpdatePayload(svTopografiaBody());
  const result = await persistCompanyUpdateInPhases(
    mockAdmin as never,
    SV_TOPOGRAFIA_ID,
    built.updatePayload,
  );

  assert(result.error?.message?.includes('permission denied'), 'erro claro do Supabase');
  console.log('OK testSupabaseErrorReturnsMessage');
}

function testRouteHasTimingLogsAndMaxDuration() {
  const fs = require('node:fs') as typeof import('node:fs');
  const route = fs.readFileSync('app/api/companies/update/route.ts', 'utf8');
  const service = fs.readFileSync('lib/companiesUpdateService.ts', 'utf8');
  const vercel = fs.readFileSync('vercel.json', 'utf8');
  assert(service.includes('[companies/update]'), 'logs prefix');
  assert(route.includes('createUpdateStepTimer'), 'timer na rota');
  assert(route.includes('maxDuration'), 'maxDuration');
  assert(vercel.includes('app/api/companies/update/route.ts'), 'vercel maxDuration');
  console.log('OK testRouteHasTimingLogsAndMaxDuration');
}

function testSchemaErrorParser() {
  const msg = extractMissingCompanyColumnFromError(
    "Could not find the 'max_projects' column of 'companies' in the schema cache",
  );
  assert(msg === 'max_projects', 'parser PGRST');
  console.log('OK testSchemaErrorParser');
}

async function run() {
  testMasterAndSuperAdminPermission();
  testPersonalizadoPayloadSvTopografia();
  testCurrencyFormats();
  testPhasedPayloadSplit();
  testRouteHasTimingLogsAndMaxDuration();
  testSchemaErrorParser();
  await testPhasedUpdateStripsOptionalOnSchemaMiss();
  await testSupabaseErrorReturnsMessage();
  console.log('OK — mandatory-companies-update-route-tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
