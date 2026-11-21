/**
 * Fase 3B — cadastro C6 com mocks. Sem banco, sem rede e sem credencial real.
 * npx tsx scripts/mandatory-c6-config-phase3b-tests.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BANK_PROVIDERS } from '../lib/banking/types';
import { isC6ConfigPersistBlocked, isC6RemoteOperationBlocked } from '../lib/banking/c6/c6EmitGuard';
import {
  getCompanyC6BankConfig,
  saveCompanyC6BankConfig,
} from '../lib/banking/c6/c6ConfigRepository';
import { executeC6BankSlipCreate } from '../lib/banking/c6/c6BoletoClient';
import { C6EmissionNotHomologatedError } from '../lib/banking/c6/c6EmitGuard';
import { verifyPrimaryAdminPassword } from '../lib/primaryAdminReauth';
import type { PrimaryAdminReauthDeps } from '../lib/primaryAdminReauth';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const DEVELOP_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
const PRODUCTION_URL = 'https://aezktedncttwpqeunjej.supabase.co';
const SECRET = 'segredo-c6-de-teste';

type Row = Record<string, unknown> & { id?: string };

function memoryAdmin() {
  const tables: Record<string, Row[]> = {
    bank_integrations: [],
    bank_credentials: [],
    company_financial_accounts: [],
  };
  let sequence = 1;
  const calls = { from: 0 };
  function from(table: string) {
    calls.from += 1;
    const filters: Array<[string, unknown]> = [];
    let action: 'select' | 'insert' | 'update' = 'select';
    let payload: Row | null = null;
    const run = () => {
      const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
      if (action === 'insert') {
        const row = { id: `row-${sequence++}`, ...(payload || {}) };
        tables[table].push(row);
        return { data: [row], error: null };
      }
      const rows = (tables[table] || []).filter(matches);
      if (action === 'update' && payload) {
        for (const row of rows) Object.assign(row, payload);
      }
      return { data: rows, error: null };
    };
    const api = {
      select() {
        return api;
      },
      insert(row: Row) {
        action = 'insert';
        payload = row;
        return api;
      },
      update(row: Row) {
        action = 'update';
        payload = row;
        return api;
      },
      eq(key: string, value: unknown) {
        filters.push([key, value]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: async () => {
        const result = run();
        return { data: result.data[0] || null, error: result.error };
      },
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        try {
          resolve(run());
        } catch (error) {
          if (reject) reject(error);
        }
      },
    };
    return api;
  }
  return { from, tables, calls };
}

function opensslPair(): { cert: string; key: string } | null {
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  ].filter(Boolean) as string[];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-phase3b-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  for (const bin of candidates) {
    try {
      execSync(
        `"${bin}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=c6-phase3b-test"`,
        { stdio: 'ignore' },
      );
      return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    } catch {
      /* tenta o próximo binário */
    }
  }
  return null;
}

function reauthDeps(passwordCalls: { n: number }): PrimaryAdminReauthDeps {
  return {
    loadOperator: async (userId) =>
      userId === 'operador-a'
        ? { id: 'operador-a', tenant_id: 'empresa-a', role: 'ADMIN', status: 'ACTIVE' }
        : null,
    loadCompanyPrimaryAdminUserId: async (companyId) =>
      companyId === 'empresa-a' ? 'principal-a' : null,
    loadUser: async (userId) =>
      userId === 'principal-a'
        ? {
            id: 'principal-a',
            tenant_id: 'empresa-a',
            role: 'ADMIN',
            status: 'ACTIVE',
            email: 'principal@example.test',
            full_name: 'Principal A',
          }
        : null,
    verifyPassword: async ({ password }) => {
      passwordCalls.n += 1;
      return password === 'senha-correta' ? { userId: 'principal-a' } : { userId: null };
    },
    countRecentFailures: async () => 0,
    now: () => Date.parse('2026-11-21T12:00:00Z'),
  };
}

async function main() {
  assert(BANK_PROVIDERS.includes('C6'), 'C6 entra no tipo do provider');
  assert(BANK_PROVIDERS.includes('INTER') && BANK_PROVIDERS.includes('ASAAS_COMPANY'), 'Asaas e Inter permanecem');
  assert(isC6ConfigPersistBlocked(PRODUCTION_URL), 'host Production bloqueia a gravação');
  assert(isC6ConfigPersistBlocked(DEVELOP_URL) === false, 'host Develop permite gravar o cadastro');
  assert(isC6RemoteOperationBlocked('PRODUCTION', DEVELOP_URL), 'ambiente Production continua sem chamada');
  assert(isC6RemoteOperationBlocked('SANDBOX', PRODUCTION_URL), 'host Production continua sem chamada');

  const passwordCalls = { n: 0 };
  const deps = reauthDeps(passwordCalls);
  const otherCompany = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: 'operador-a',
    password: 'senha-correta',
    companyId: 'empresa-b',
  });
  assert(otherCompany.ok === false, 'administrador de uma empresa não autoriza outra');
  assert(passwordCalls.n === 0, 'empresa divergente não consulta a senha');
  const missingPassword = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: 'operador-a',
    password: '',
    companyId: 'empresa-a',
  });
  assert(missingPassword.ok === false, 'reautenticação exige a senha do Administrador Principal');
  const accepted = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: 'operador-a',
    password: 'senha-correta',
    companyId: 'empresa-a',
  });
  assert(accepted.ok === true && accepted.tenantId === 'empresa-a', 'senha conferida na empresa da sessão');

  const root = path.resolve(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/banking/c6/config/route.ts'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261121120000_bank_integrations_provider_c6.sql'),
    'utf8',
  );
  assert(!/export async function POST/.test(route), 'não há teste de conexão nem emissão na rota');
  assert(route.includes('companyId: auth.tenantId'), 'a reautenticação usa a empresa da sessão');
  assert(!route.includes('record.companyId'), 'o corpo não escolhe a empresa');
  assert(route.includes('isC6ConfigPersistBlocked()'), 'a rota recusa gravar no host Production');
  assert(panel.includes('Emissão DESATIVADA'), 'a tela mostra emissão desativada');
  assert(panel.includes("setClientSecret('')"), 'o segredo não é preenchido com valor do banco');
  assert(!panel.includes('emission_enabled: true'), 'a tela não liga a emissão');
  assert(!/DELETE\s+FROM/i.test(migration), 'a migration não apaga registros');
  assert(migration.includes('uq_bank_integrations_company_c6'), 'há proteção de uma integração C6 por empresa');
  assert(!migration.includes('uq_bank_credentials_integration_type'), 'não cria índice único global de credenciais');
  assert(migration.includes("ARRAY[''C6''::text,"), 'acrescenta C6 à lista que já existir');
  assert(!migration.includes('SANTANDER'), 'não substitui a lista fechada de providers');
  assert(migration.includes('Nenhum constraint foi alterado.'), 'formato desconhecido interrompe sem alterar o check');

  const previousKey = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  const blockedAdmin = memoryAdmin();
  let missingKey = false;
  try {
    await saveCompanyC6BankConfig(
      blockedAdmin as never,
      'empresa-a',
      { environment: 'SANDBOX', clientId: 'cliente' },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
  } catch (error) {
    missingKey = error instanceof Error && error.message.includes('BANKING_CREDENTIALS_ENCRYPTION_KEY');
  }
  assert(missingKey, 'sem chave de criptografia a gravação falha');
  assert(blockedAdmin.tables.bank_integrations.length === 0, 'a falha da chave não grava integração');

  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
  let productionWrites = 0;
  const productionAdmin = {
    from() {
      productionWrites += 1;
      throw new Error('banco não deveria ser chamado');
    },
  };
  let productionBlocked = false;
  try {
    await saveCompanyC6BankConfig(
      productionAdmin as never,
      'empresa-a',
      { environment: 'SANDBOX', clientId: 'cliente', clientSecret: SECRET },
      undefined,
      { supabaseUrl: PRODUCTION_URL },
    );
  } catch (error) {
    productionBlocked = error instanceof Error && error.message.includes('bloqueado em Production');
  }
  assert(productionBlocked && productionWrites === 0, 'Production recusa a gravação antes do banco');

  const pair = opensslPair();
  assert(pair, 'o par de teste PEM foi gerado localmente');
  const admin = memoryAdmin();
  admin.tables.company_financial_accounts.push({
    id: 'conta-asaas',
    company_id: 'empresa-a',
    bank_integration_id: 'int-asaas',
  });
  admin.tables.bank_integrations.push({
    id: 'int-asaas',
    company_id: 'empresa-a',
    provider: 'ASAAS_COMPANY',
  });
  let asaasKept = false;
  try {
    await saveCompanyC6BankConfig(
      admin as never,
      'empresa-a',
      {
        environment: 'SANDBOX',
        clientId: 'cliente-c6',
        clientSecret: SECRET,
        certificatePem: pair?.cert,
        privateKeyPem: pair?.key,
        financialAccountId: 'conta-asaas',
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
  } catch (error) {
    asaasKept = error instanceof Error && error.message.includes('Asaas');
  }
  assert(asaasKept, 'conta do Asaas não é reutilizada');

  const saved = await saveCompanyC6BankConfig(
    admin as never,
    'empresa-a',
    {
      environment: 'PRODUCTION',
      clientId: 'cliente-c6',
      clientSecret: SECRET,
      certificatePem: pair?.cert,
      privateKeyPem: pair?.key,
      certificateFileName: 'certificado.pem',
      privateKeyFileName: 'chave.pem',
      boletoIntent: true,
      bolepixIntent: false,
    },
    undefined,
    { supabaseUrl: DEVELOP_URL },
  );
  const stored = admin.tables.bank_integrations.find((row) => row.company_id === 'empresa-a' && row.provider === 'C6');
  const metadata = stored?.metadata as { c6?: Record<string, unknown> };
  assert(saved.status === 'DRAFT' && saved.active === false && saved.emissionEnabled === false, 'o cadastro salvo fica inativo');
  assert(stored?.active === false && stored?.status === 'DRAFT', 'a linha gravada fica inativa');
  assert(metadata.c6?.emission_enabled === false, 'emissão permanece desligada');
  assert(metadata.c6?.webhook_enabled === false && metadata.c6?.settlement_enabled === false, 'webhook e liquidação permanecem desligados');
  assert(metadata.c6?.boleto === true && metadata.c6?.bolepix === false, 'só a intenção de uso é gravada');
  const credentialJson = JSON.stringify(admin.tables.bank_credentials);
  assert(!credentialJson.includes(SECRET), 'o segredo não fica em claro');
  assert(!credentialJson.includes('BEGIN CERTIFICATE'), 'o certificado não fica em claro');
  const publicJson = JSON.stringify(saved);
  assert(!publicJson.includes(SECRET) && !publicJson.includes('BEGIN CERTIFICATE'), 'a resposta não vaza segredo');
  const other = await getCompanyC6BankConfig(admin as never, 'empresa-b');
  assert(other.id === null, 'outra empresa não vê a configuração');

  let bankCalls = 0;
  let emitBlocked = false;
  try {
    await executeC6BankSlipCreate(
      {
        companyId: 'empresa-a',
        environment: 'PRODUCTION',
        clientId: 'cliente-c6',
        clientSecret: SECRET,
        certificatePem: pair?.cert || '',
        privateKeyPem: pair?.key || '',
      },
      {
        companyId: 'empresa-a',
        environment: 'PRODUCTION',
        external_reference_id: 'REF1',
        amount: 10,
        due_date: '2026-12-20',
        payer: {
          name: 'Pagador Teste',
          tax_id: '52998224725',
          address: { street: 'Rua A', number: 10, city: 'Sao Paulo', state: 'SP', zip_code: '01313000' },
        },
      },
      {
        fetchFn: async () => {
          bankCalls += 1;
          return { status: 201, bodyText: '{}' };
        },
      },
    );
  } catch (error) {
    emitBlocked = error instanceof C6EmissionNotHomologatedError;
  }
  assert(emitBlocked && bankCalls === 0, 'a emissão continua bloqueada antes do fetch');

  const repository = fs.readFileSync(path.join(root, 'lib/banking/c6/c6ConfigRepository.ts'), 'utf8');
  assert(!/finance_receipts|cash_movements|contracts|sales/.test(repository + route), 'o cadastro não opera parcela, caixa, contrato ou venda');
  const asaas = fs.readFileSync(path.join(root, 'lib/finance/asaasCompanyClient.ts'), 'utf8');
  const inter = fs.readFileSync(path.join(root, 'lib/banking/inter/interCobrancaClient.ts'), 'utf8');
  assert(!asaas.includes('lib/banking/c6') && !inter.includes('lib/banking/c6'), 'Asaas e Inter não passam a depender do C6');

  if (previousKey === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  console.log('C6_CONFIG_PHASE3B_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
