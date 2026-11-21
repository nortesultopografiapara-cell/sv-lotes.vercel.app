/**
 * PUT completo da configuração C6 em empresa fictícia, só em memória.
 * npx tsx scripts/mandatory-c6-config-put-simulation-tests.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindC6AtomicRpc, type C6AtomicFault } from '../lib/banking/c6/c6ConfigAtomic';
import { decryptBankingSecret, encryptBankingSecret } from '../lib/banking/credentialsCrypto';
import { executeC6ConfigPut } from '../lib/banking/c6/c6ConfigPut';
import { buildC6ConfigPutBody } from '../lib/banking/c6/c6ConfigTypes';
import {
  isC6BoletoSandboxLiveAuthorized,
  throwIfC6EmissionAttempt,
} from '../lib/banking/c6/c6EmitGuard';
import type { PrimaryAdminReauthDeps } from '../lib/primaryAdminReauth';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const DEVELOP_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
const SECRET = 'segredo-c6-empresa-ficticia';
const PROTECTED_SECRET = 'segredo-c6-empresa-protegida';

type Row = Record<string, unknown> & { id?: string };
function memoryAdmin(options?: { fault?: C6AtomicFault }) {
  const tables: Record<string, Row[]> = {
    bank_integrations: [],
    bank_credentials: [],
    company_financial_accounts: [],
    audit_logs: [],
  };
  const writes: Array<{ table: string; action: string }> = [];
  let sequence = 1;
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Array<[string, unknown]> = [];
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | null = null;
    const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
    const run = () => {
      if (action === 'insert') {
        const row = { id: `row-${sequence++}`, ...(payload || {}) };
        tables[table].push(row);
        writes.push({ table, action });
        return { data: [row], error: null };
      }
      const rows = tables[table].filter(matches);
      if (action === 'update' && payload) {
        for (const row of rows) Object.assign(row, payload);
        writes.push({ table, action });
      }
      if (action === 'delete') {
        tables[table] = tables[table].filter((row) => !matches(row));
        writes.push({ table, action });
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
      delete() {
        action = 'delete';
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
          else throw error;
        }
      },
    };
    return api;
  }
  return bindC6AtomicRpc({ from, tables, writes }, options);
}

function opensslPair(): { cert: string; key: string } {
  const candidates = [process.env.OPENSSL_BIN, 'openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'].filter(
    Boolean,
  ) as string[];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-put-sim-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  for (const bin of candidates) {
    try {
      execSync(
        `"${bin}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=c6-put-sim"`,
        { stdio: 'ignore' },
      );
      return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    } catch {
      /* tenta o próximo binário */
    }
  }
  throw new Error('openssl local indisponível para o par de teste');
}

function sessionDeps(): PrimaryAdminReauthDeps {
  return {
    loadOperator: async (userId) =>
      userId === 'admin-ficticio'
        ? { id: 'admin-ficticio', tenant_id: 'empresa-ficticia', role: 'ADMIN', status: 'ACTIVE' }
        : null,
    loadCompanyPrimaryAdminUserId: async (companyId) =>
      companyId === 'empresa-ficticia' ? 'admin-ficticio' : null,
    loadUser: async (userId) =>
      userId === 'admin-ficticio'
        ? {
            id: 'admin-ficticio',
            tenant_id: 'empresa-ficticia',
            role: 'ADMIN',
            status: 'ACTIVE',
            email: 'admin.ficticio@example.test',
            full_name: 'Admin Ficticio',
          }
        : null,
    verifyPassword: async ({ password }) =>
      password === 'senha-ficticia' ? { userId: 'admin-ficticio' } : { userId: null },
    countRecentFailures: async () => 0,
    now: () => Date.parse('2026-11-21T13:00:00Z'),
  };
}

function protectedSnapshot(admin: ReturnType<typeof memoryAdmin>): string {
  return JSON.stringify({
    integration: admin.tables.bank_integrations.find((row) => row.id === 'c6-protegida'),
    credential: admin.tables.bank_credentials.find((row) => row.integration_id === 'c6-protegida'),
    account: admin.tables.company_financial_accounts.find((row) => row.id === 'conta-protegida'),
  });
}

async function main() {
  const previousKey = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
  const pair = opensslPair();
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(' '));
  };

  try {
    const emptyBody = buildC6ConfigPutBody({
      environment: 'SANDBOX',
      clientId: 'cliente-ficticio',
      password: 'senha-ficticia',
      boletoIntent: false,
      bolepixIntent: false,
      financialAccountId: '',
      clientSecret: '',
    });
    assert(!Object.prototype.hasOwnProperty.call(emptyBody, 'financialAccountId'), 'sem seleção a conta não vai no PUT');
    assert(!Object.prototype.hasOwnProperty.call(emptyBody, 'clientSecret'), 'segredo vazio não vai no PUT');
    const selected = buildC6ConfigPutBody({
      environment: 'SANDBOX',
      clientId: 'cliente-ficticio',
      password: 'senha-ficticia',
      boletoIntent: false,
      bolepixIntent: false,
      financialAccountId: 'conta-escolhida',
    });
    assert(selected.financialAccountId === 'conta-escolhida', 'seleção explícita envia a conta');

    const admin = memoryAdmin();
    const protectedCipher = encryptBankingSecret(PROTECTED_SECRET);
    admin.tables.bank_integrations.push({
      id: 'c6-protegida',
      company_id: 'empresa-protegida',
      provider: 'C6',
      bank_provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-protegido',
      certificate_name: 'certificado-protegido.txt',
      metadata: { origem: 'protegida' },
      configured_at: '2026-11-20T00:00:00.000Z',
      updated_at: '2026-11-20T00:00:00.000Z',
    });
    admin.tables.bank_credentials.push({
      id: 'cred-protegida',
      integration_id: 'c6-protegida',
      company_id: 'empresa-protegida',
      credential_type: 'oauth',
      encrypted_payload: protectedCipher,
    });
    admin.tables.company_financial_accounts.push({
      id: 'conta-protegida',
      company_id: 'empresa-protegida',
      bank_integration_id: null,
      name: 'Conta protegida',
    });
    const beforeProtected = protectedSnapshot(admin);

    const created = await executeC6ConfigPut({
      admin: admin as never,
      userId: 'admin-ficticio',
      tenantId: 'empresa-ficticia',
      supabaseUrl: DEVELOP_URL,
      deps: sessionDeps(),
      body: buildC6ConfigPutBody({
        environment: 'SANDBOX',
        clientId: 'cliente-ficticio',
        password: 'senha-ficticia',
        boletoIntent: false,
        bolepixIntent: false,
        clientSecret: SECRET,
        certificatePem: pair.cert,
        certificateFileName: 'certificado.pem',
        privateKeyPem: pair.key,
        privateKeyFileName: 'chave.pem',
      }),
    });
    assert(created.status === 200, 'o PUT da empresa fictícia é aceito');
    const createdConfig = created.body.config as { active?: boolean; emissionEnabled?: boolean; clientId?: string };
    assert(createdConfig.active === false && createdConfig.emissionEnabled === false, 'o PUT não ativa emissão');
    assert(!JSON.stringify(created.body).includes(SECRET), 'a resposta não devolve o segredo');
    assert(!JSON.stringify(created.body).includes('BEGIN CERTIFICATE'), 'a resposta não devolve certificado');
    const fictional = admin.tables.bank_integrations.find((row) => row.company_id === 'empresa-ficticia');
    const fictionalId = String(fictional?.id);
    const storedSecret = String(
      admin.tables.bank_credentials.find(
        (row) => row.integration_id === fictionalId && row.credential_type === 'oauth',
      )?.encrypted_payload || '',
    );
    assert(storedSecret.startsWith('v1:') && decryptBankingSecret(storedSecret) === SECRET, 'o segredo fictício é recuperável');
    assert(fictional?.active === false && fictional?.status === 'DRAFT' && fictional?.environment === 'SANDBOX', 'a linha fictícia nasce inativa');
    assert(protectedSnapshot(admin) === beforeProtected, 'a empresa protegida não muda na criação');

    const repeated = await executeC6ConfigPut({
      admin: admin as never,
      userId: 'admin-ficticio',
      tenantId: 'empresa-ficticia',
      supabaseUrl: DEVELOP_URL,
      deps: sessionDeps(),
      body: buildC6ConfigPutBody({
        environment: 'SANDBOX',
        clientId: 'cliente-ficticio',
        password: 'senha-ficticia',
        boletoIntent: false,
        bolepixIntent: false,
      }),
    });
    assert(repeated.status === 200, 'o segundo PUT sem segredo é aceito');
    assert(
      admin.tables.bank_credentials.find(
        (row) => row.integration_id === fictionalId && row.credential_type === 'oauth',
      )?.encrypted_payload === storedSecret,
      'campo vazio preserva a credencial',
    );
    assert(
      admin.tables.bank_integrations.find((row) => row.id === fictionalId)?.metadata &&
        (admin.tables.bank_integrations.find((row) => row.id === fictionalId)?.metadata as { c6?: { boleto?: boolean } }).c6
          ?.boleto === false,
      'a repetição sem mudança não altera a intenção',
    );
    assert(protectedSnapshot(admin) === beforeProtected, 'a empresa protegida não muda na repetição');
    const integrationBeforeNoop = JSON.stringify(admin.tables.bank_integrations.find((row) => row.id === fictionalId));
    const credentialBeforeNoop = JSON.stringify(
      admin.tables.bank_credentials.filter((row) => row.integration_id === fictionalId),
    );
    const writeCount = admin.writes.length;
    const noop = await executeC6ConfigPut({
      admin: admin as never,
      userId: 'admin-ficticio',
      tenantId: 'empresa-ficticia',
      supabaseUrl: DEVELOP_URL,
      deps: sessionDeps(),
      body: buildC6ConfigPutBody({
        environment: 'SANDBOX',
        clientId: 'cliente-ficticio',
        password: 'senha-ficticia',
        boletoIntent: false,
        bolepixIntent: false,
      }),
    });
    assert(noop.status === 200, 'PUT idêntico responde sucesso');
    assert(
      JSON.stringify(admin.tables.bank_integrations.find((row) => row.id === fictionalId)) === integrationBeforeNoop,
      'PUT idêntico não altera a integração',
    );
    assert(
      JSON.stringify(admin.tables.bank_credentials.filter((row) => row.integration_id === fictionalId)) === credentialBeforeNoop,
      'PUT idêntico não altera credencial',
    );
    assert(
      admin.writes.slice(writeCount).every((write) => write.table === 'audit_logs'),
      'PUT idêntico só registra a auditoria da senha',
    );
    assert(protectedSnapshot(admin) === beforeProtected, 'a empresa protegida permanece intacta');

    const other = await executeC6ConfigPut({
      admin: admin as never,
      userId: 'admin-ficticio',
      tenantId: 'empresa-protegida',
      supabaseUrl: DEVELOP_URL,
      deps: sessionDeps(),
      body: buildC6ConfigPutBody({
        environment: 'SANDBOX',
        clientId: 'cliente-invasor',
        password: 'senha-ficticia',
        boletoIntent: false,
        bolepixIntent: false,
        clientSecret: SECRET,
        certificatePem: pair.cert,
        privateKeyPem: pair.key,
      }),
    });
    assert(other.status === 403, 'sessão de uma empresa não grava em outra');
    assert(protectedSnapshot(admin) === beforeProtected, 'a recusa não grava a empresa protegida');

    const failing = memoryAdmin({ fault: 'link' });
    failing.tables.bank_integrations.push({
      id: 'c6-ficticia',
      company_id: 'empresa-ficticia',
      provider: 'C6',
      bank_provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-ficticio',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: { origem: 'ficticia', c6: { boleto: false, bolepix: false } },
      configured_at: '2026-11-20T00:00:00.000Z',
      updated_at: '2026-11-20T00:00:00.000Z',
    });
    failing.tables.bank_credentials.push({
      id: 'oauth-ficticia',
      integration_id: 'c6-ficticia',
      company_id: 'empresa-ficticia',
      credential_type: 'oauth',
      encrypted_payload: storedSecret,
    });
    failing.tables.company_financial_accounts.push({
      id: 'conta-ficticia',
      company_id: 'empresa-ficticia',
      bank_integration_id: null,
    });
    const beforeIntegration = JSON.stringify(failing.tables.bank_integrations[0]);
    const beforeAccount = JSON.stringify(failing.tables.company_financial_accounts[0]);
    const failed = await executeC6ConfigPut({
      admin: failing as never,
      userId: 'admin-ficticio',
      tenantId: 'empresa-ficticia',
      supabaseUrl: DEVELOP_URL,
      deps: sessionDeps(),
      body: buildC6ConfigPutBody({
        environment: 'SANDBOX',
        clientId: 'cliente-ficticio',
        password: 'senha-ficticia',
        boletoIntent: true,
        bolepixIntent: false,
        clientSecret: 'segredo-novo-ficticio',
        financialAccountId: 'conta-ficticia',
      }),
    });
    assert(failed.status === 500, 'falha de gravação volta erro');
    assert(!JSON.stringify(failed.body).includes('segredo-novo-ficticio'), 'o erro não contém o segredo');
    assert(JSON.stringify(failing.tables.bank_integrations[0]) === beforeIntegration, 'a falha não altera a integração');
    assert(failing.tables.bank_credentials[0]?.encrypted_payload === storedSecret, 'a falha restaura o ciphertext anterior');
    assert(JSON.stringify(failing.tables.company_financial_accounts[0]) === beforeAccount, 'a falha não vincula a conta');

    let emissionBlocked = false;
    try {
      throwIfC6EmissionAttempt('C6');
    } catch {
      emissionBlocked = true;
    }
    assert(emissionBlocked, 'a emissão C6 continua bloqueada');
    assert(isC6BoletoSandboxLiveAuthorized('SANDBOX') === false, 'sandbox live continua desligado');
    assert(logs.every((line) => !line.includes(SECRET) && !line.includes('BEGIN CERTIFICATE')), 'o log não recebe credencial');

    const root = path.resolve(__dirname, '..');
    const panel = fs.readFileSync(path.join(root, 'components/finance/C6BankConfigPanel.tsx'), 'utf8');
    const route = fs.readFileSync(path.join(root, 'app/api/banking/c6/config/route.ts'), 'utf8');
    assert(panel.includes('buildC6ConfigPutBody'), 'o painel usa o corpo que omite conta vazia');
    assert(panel.includes('<option value="">Sem vínculo</option>'), 'a conta começa sem vínculo');
    assert(!/export async function POST/.test(route), 'a rota não emite');
  } finally {
    console.error = originalError;
    if (previousKey === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  }

  console.log('C6_CONFIG_PUT_SIMULATION_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
