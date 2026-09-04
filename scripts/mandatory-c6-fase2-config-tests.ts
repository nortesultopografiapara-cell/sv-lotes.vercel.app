/**
 * C6 Bank Fase 2 — configuração local (sem API C6, sem emissão).
 * npm run test:c6-fase2
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertC6ConfigResponseSafe,
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '../lib/banking/c6/c6ConfigRepository';
import { EMPTY_C6_BANK_CONFIG } from '../lib/banking/c6/c6ConfigTypes';
import {
  C6_EMIT_NOT_HOMOLOGATED_MESSAGE,
  throwIfC6EmissionAttempt,
} from '../lib/banking/c6/c6EmitGuard';
import {
  encryptBankingSecret,
  decryptBankingSecret,
} from '../lib/banking/credentialsCrypto';
import {
  createC6FinancialAccount,
  linkFinancialAccountToC6Integration,
} from '../lib/finance/c6FinancialAccountService';
import { NEW_C6_FINANCIAL_ACCOUNT_NAME } from '../lib/finance/companyFinancialAccountTypes';
import {
  normalizeChargesEmitProvider,
  UnknownChargesProviderError,
} from '../lib/charges/chargeProviderRouting';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

type Row = Record<string, unknown>;

function resolveOpenSslBin(): string | null {
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  ].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" version`, { stdio: 'ignore' });
      return bin;
    } catch {
      /* next */
    }
  }
  return null;
}

function loadFixturePair(): { cert: string; key: string } | null {
  const certPath = path.join(root, 'scripts/fixtures/inter-test-cert.pem');
  const keyPath = path.join(root, 'scripts/fixtures/inter-test-key.pem');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8'),
    };
  }
  return null;
}

function generateRealTestPair(): { cert: string; key: string } {
  const fixture = loadFixturePair();
  if (fixture) return fixture;
  const openssl = resolveOpenSslBin();
  if (!openssl) throw new Error('openssl/fixture indisponível');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-pem-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  try {
    execSync(
      `"${openssl}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=svlotes-c6-test"`,
      { stdio: 'ignore' },
    );
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function matchFilters(rows: Row[], filters: Array<[string, unknown]>) {
  return rows.filter((row) =>
    filters.every(([col, val]) => {
      if (Array.isArray(val)) return val.includes(row[col]);
      return row[col] === val;
    }),
  );
}

function createStore() {
  const integrations: Row[] = [
    {
      id: 'int-asaas',
      company_id: 'co-1',
      provider: 'ASAAS_COMPANY',
      bank_provider: 'ASAAS_COMPANY',
      is_default: true,
      environment: 'SANDBOX',
      status: 'ACTIVE',
      client_id: null,
      certificate_name: null,
      active: true,
      configured_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'int-inter',
      company_id: 'co-1',
      provider: 'INTER',
      bank_provider: 'INTER',
      is_default: false,
      environment: 'SANDBOX',
      status: 'DRAFT',
      client_id: 'inter-id',
      certificate_name: 'inter-cert',
      active: true,
      configured_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  const accounts: Row[] = [
    {
      id: 'fa-asaas',
      company_id: 'co-1',
      name: 'Conta Asaas',
      account_type: 'IMOBILIARIA',
      beneficiary_name: null,
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-asaas',
      is_default: true,
      active: true,
      notes: 'Asaas',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'fa-inter',
      company_id: 'co-1',
      name: 'Conta Inter',
      account_type: 'IMOBILIARIA',
      beneficiary_name: null,
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: 'int-inter',
      is_default: false,
      active: true,
      notes: 'Inter',
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
    {
      id: 'fa-empty',
      company_id: 'co-1',
      name: 'Conta sem provider',
      account_type: 'IMOBILIARIA',
      beneficiary_name: null,
      document: null,
      email: null,
      phone: null,
      environment: 'SANDBOX',
      bank_integration_id: null,
      is_default: false,
      active: true,
      notes: null,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    },
  ];
  const credentials: Row[] = [];
  let seq = 1;

  const admin = {
    from(table: string) {
      const state: {
        filters: Array<[string, unknown]>;
        op: string;
        payload: Row | null;
      } = { filters: [], op: 'select', payload: null };

      const rowsOf = () => {
        if (table === 'bank_integrations') return integrations;
        if (table === 'company_financial_accounts') return accounts;
        if (table === 'bank_credentials') return credentials;
        return [];
      };

      const applyUpdate = () => {
        const rows = matchFilters(rowsOf(), state.filters);
        for (const row of rows) Object.assign(row, state.payload || {});
        return rows;
      };

      const api: Record<string, unknown> = {
        select: () => {
          if (state.op !== 'insert') state.op = 'select';
          return api;
        },
        insert: (payload: Row) => {
          state.op = 'insert';
          state.payload = payload;
          return api;
        },
        update: (payload: Row) => {
          state.op = 'update';
          state.payload = payload;
          return api;
        },
        eq: (col: string, val: unknown) => {
          state.filters.push([col, val]);
          return api;
        },
        order: () => api,
        limit: () => api,
        maybeSingle: async () => {
          if (state.op === 'insert' && state.payload) {
            const row = {
              id: `${table}-${seq++}`,
              ...state.payload,
            };
            rowsOf().push(row);
            return { data: row, error: null };
          }
          if (state.op === 'update') {
            const rows = applyUpdate();
            return { data: rows[0] || null, error: null };
          }
          const rows = matchFilters(rowsOf(), state.filters);
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          if (state.op === 'insert' && state.payload) {
            const row = {
              id: `${table}-${seq++}`,
              environment: state.payload.environment || 'SANDBOX',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...state.payload,
            };
            rowsOf().push(row);
            return { data: row, error: null };
          }
          const rows = matchFilters(rowsOf(), state.filters);
          return { data: rows[0] || null, error: rows[0] ? null : { message: 'not found' } };
        },
      };

      const finalize = async () => {
        if (state.op === 'insert' && state.payload) {
          const row = {
            id: `${table}-${seq++}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...state.payload,
          };
          rowsOf().push(row);
          return { data: row, error: null };
        }
        if (state.op === 'update') {
          const rows = applyUpdate();
          return { data: rows[0] || null, error: null };
        }
        return { data: matchFilters(rowsOf(), state.filters), error: null };
      };
      (api as { then?: typeof Promise.prototype.then }).then = (
        onfulfilled: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) => finalize().then(onfulfilled, onrejected);

      return api;
    },
  };

  return {
    admin: admin as unknown as SupabaseClient,
    integrations,
    accounts,
    credentials,
  };
}

function testPanelAndRoutes() {
  const panel = read('components/finance/C6BankConfigPanel.tsx');
  assert.match(panel, /Configurar C6 Bank/);
  assert.match(panel, /Client ID/);
  assert.match(panel, /Client Secret/);
  assert.match(panel, /Selecionar certificado/);
  assert.match(panel, /Selecionar chave privada/);
  assert.match(panel, /Sandbox/);
  assert.match(panel, /Produção/);
  assert.match(panel, /\/api\/banking\/c6\/config/);
  assert.match(panel, /Configurado ••••••••••/);
  assert.match(panel, /C6_EMIT_NOT_HOMOLOGATED_MESSAGE|ainda não homologada para emissão/);
  assert.doesNotMatch(panel, /Testar conexão/);
  assert.doesNotMatch(panel, /webhook/i);
  assert.doesNotMatch(panel, /c6bank\.com|oauth\/v2|cobranca\/v3/i);

  const banks = read('components/finance/BanksDevelopmentPanel.tsx');
  assert.match(banks, /Configurar C6 Bank/);
  assert.match(banks, /Em homologação/);
  assert.match(banks, /C6BankConfigPanel/);
  assert.match(banks, /Configurar Banco Inter/);
  assert.match(banks, /bg-emerald-500\/15 text-emerald-300/);

  const route = read('app/api/banking/c6/config/route.ts');
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /test-connection/);
  assert.match(route, /Nunca logar body\/PEM/);
  assert.match(route, /assertC6ConfigResponseSafe/);

  const link = read('app/api/banking/c6/link-financial-account/route.ts');
  assert.match(link, /createC6FinancialAccount/);
  assert.match(link, /linkFinancialAccountToC6Integration/);
  assert.doesNotMatch(link, /recoverMislinked/);

  const libDir = path.join(root, 'lib/banking/c6');
  for (const file of fs.readdirSync(libDir)) {
    const src = fs.readFileSync(path.join(libDir, file), 'utf8');
    assert.doesNotMatch(src, /https:\/\//, `${file} sem URL HTTP C6`);
  }
  console.log('OK testPanelAndRoutes');
}

function testRoutingStillFailClosed() {
  assert.equal(normalizeChargesEmitProvider('C6'), 'C6');
  assert.equal(normalizeChargesEmitProvider('INTER'), 'INTER');
  assert.equal(normalizeChargesEmitProvider('ASAAS_COMPANY'), 'ASAAS_COMPANY');
  assert.throws(
    () => normalizeChargesEmitProvider('NUBANK'),
    (err: unknown) => err instanceof UnknownChargesProviderError,
  );
  try {
    throwIfC6EmissionAttempt('C6');
    throw new Error('deveria bloquear emissão');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.equal((err as Error).message, C6_EMIT_NOT_HOMOLOGATED_MESSAGE);
  }
  console.log('OK testRoutingStillFailClosed');
}

async function testSaveGetSanitizeAndPreserve(pair: { cert: string; key: string }) {
  const original = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'sv-lotes-c6-fase2-test-key-32';
  const store = createStore();

  const saved = await saveCompanyC6BankConfig(store.admin, 'co-1', {
    environment: 'SANDBOX',
    clientId: 'c6-client-visible',
    clientSecret: 'c6-secret-hidden',
    certificatePem: pair.cert,
    privateKeyPem: pair.key,
    certificateFileName: 'c6.crt',
    privateKeyFileName: 'c6.key',
    financialAccountId: 'fa-empty',
  });
  assertC6ConfigResponseSafe(saved);
  assert.equal(saved.provider, 'C6');
  assert.equal(saved.clientId, 'c6-client-visible');
  assert.equal(saved.hasClientSecret, true);
  assert.equal(saved.hasCertificate, true);
  assert.equal(saved.hasPrivateKey, true);
  assert.equal(saved.environment, 'SANDBOX');
  assert.equal(saved.financialAccountId, 'fa-empty');
  const json = JSON.stringify(saved);
  assert.equal(json.includes('c6-secret-hidden'), false);
  assert.equal(json.includes('BEGIN CERTIFICATE'), false);
  assert.equal(json.includes('BEGIN PRIVATE KEY'), false);
  assert.equal(json.includes('clientSecret'), false);

  const oauth = store.credentials.find((c) => c.credential_type === 'oauth');
  assert.ok(oauth);
  const cipher = String(oauth?.encrypted_payload || '');
  assert.match(cipher, /^v1:/);
  assert.equal(cipher.includes('c6-secret-hidden'), false);
  assert.equal(decryptBankingSecret(cipher), 'c6-secret-hidden');

  const fa = store.accounts.find((a) => a.id === 'fa-empty');
  assert.equal(fa?.bank_integration_id, saved.id);

  const preserved = await saveCompanyC6BankConfig(
    store.admin,
    'co-1',
    {
      environment: 'PRODUCTION',
      clientId: 'c6-client-visible',
    },
    { integrationId: saved.id },
  );
  assert.equal(preserved.hasClientSecret, true);
  assert.equal(preserved.hasCertificate, true);
  assert.equal(preserved.hasPrivateKey, true);
  assert.equal(preserved.environment, 'PRODUCTION');
  assert.equal(decryptBankingSecret(String(oauth?.encrypted_payload || '')), 'c6-secret-hidden');

  const otherTenant = await getCompanyC6BankConfig(store.admin, 'co-2');
  assert.equal(otherTenant.id, null);
  assert.equal(otherTenant.clientId, '');
  assert.deepEqual(otherTenant.hasClientSecret, false);

  const loaded = await getCompanyC6BankConfig(store.admin, 'co-1', {
    integrationId: saved.id,
  });
  assertC6ConfigResponseSafe(loaded);
  assert.equal(loaded.clientId, 'c6-client-visible');

  if (original === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = original;
  console.log('OK testSaveGetSanitizeAndPreserve');
}

async function testFinancialAccountIsolation(pair: { cert: string; key: string }) {
  const original = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'sv-lotes-c6-fase2-test-key-32';
  const store = createStore();

  await saveCompanyC6BankConfig(store.admin, 'co-1', {
    environment: 'SANDBOX',
    clientId: 'c6-client-visible',
    clientSecret: 'c6-secret-hidden',
    certificatePem: pair.cert,
    privateKeyPem: pair.key,
    certificateFileName: 'c6.crt',
    privateKeyFileName: 'c6.key',
  });

  await assert.rejects(
    () => linkFinancialAccountToC6Integration(store.admin, 'co-1', 'fa-asaas'),
    /Asaas/,
  );
  await assert.rejects(
    () => linkFinancialAccountToC6Integration(store.admin, 'co-1', 'fa-inter'),
    /Inter/,
  );

  const linked = await linkFinancialAccountToC6Integration(store.admin, 'co-1', 'fa-empty');
  assert.equal(linked.provider, 'C6');
  assert.equal(linked.name.includes('sem provider') || linked.id === 'fa-empty', true);

  const created = await createC6FinancialAccount(store.admin, 'co-1', {
    createAdditional: true,
    name: NEW_C6_FINANCIAL_ACCOUNT_NAME,
  });
  assert.equal(created.provider, 'C6');
  assert.equal(created.name, NEW_C6_FINANCIAL_ACCOUNT_NAME);
  assert.equal(created.isDefault, false);

  if (original === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = original;
  console.log('OK testFinancialAccountIsolation');
}

function testSafeEmptyResponse() {
  const empty = EMPTY_C6_BANK_CONFIG('co-x');
  assertC6ConfigResponseSafe(empty);
  const unsafe = { ...empty, clientSecret: 'x' } as typeof empty & { clientSecret: string };
  assert.throws(() => assertC6ConfigResponseSafe(unsafe));
  const cipher = encryptBankingSecret('keep-secret');
  assert.notEqual(cipher, 'keep-secret');
  console.log('OK testSafeEmptyResponse');
}

function testInterAsaasUntouched() {
  const interPanel = read('components/finance/InterBankConfigPanel.tsx');
  assert.match(interPanel, /Testar conexão/);
  assert.match(interPanel, /Configurar Banco Inter/);
  const asaas = read('components/finance/AsaasIntegrationPanel.tsx');
  assert.match(asaas, /Conectar conta Asaas/);
  const banks = read('components/finance/BanksDevelopmentPanel.tsx');
  assert.match(banks, /bg-emerald-500\/15 text-emerald-300/);
  console.log('OK testInterAsaasUntouched');
}

async function main() {
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY ||= 'sv-lotes-c6-fase2-test-key-32';
  testPanelAndRoutes();
  testRoutingStillFailClosed();
  testSafeEmptyResponse();
  testInterAsaasUntouched();

  let pair: { cert: string; key: string } | null = null;
  try {
    pair = generateRealTestPair();
  } catch {
    console.log('AVISO — openssl/fixture indisponível; testes de persistência PEM serão pulados.');
  }
  if (pair) {
    await testSaveGetSanitizeAndPreserve(pair);
    await testFinancialAccountIsolation(pair);
  }

  console.log('ALL mandatory-c6-fase2-config-tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
