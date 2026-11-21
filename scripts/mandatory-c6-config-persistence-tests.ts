/**
 * Persistência da configuração C6 com mocks. Sem banco, sem rede e sem credencial real.
 * npx tsx scripts/mandatory-c6-config-persistence-tests.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindC6AtomicRpc, type C6AtomicFault } from '../lib/banking/c6/c6ConfigAtomic';
import { decryptBankingSecret, encryptBankingSecret } from '../lib/banking/credentialsCrypto';
import { redactC6ErrorMessage, saveCompanyC6BankConfig } from '../lib/banking/c6/c6ConfigRepository';
import { isC6BoletoSandboxLiveAuthorized } from '../lib/banking/c6/c6EmitGuard';
import {
  buildPrimaryAdminVerifyAuditEvent,
  verifyPrimaryAdminPassword,
  type PrimaryAdminReauthDeps,
} from '../lib/primaryAdminReauth';
import { isTenantEnterpriseAdminRole } from '../lib/rolePermissions';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const DEVELOP_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
const SECRET = 'segredo-c6-teste-local-3m';
const OTHER_SECRET = 'segredo-c6-outra-empresa';

type Row = Record<string, unknown> & { id?: string };
function memoryAdmin(options?: { fault?: C6AtomicFault }) {
  const tables: Record<string, Row[]> = {
    bank_integrations: [],
    bank_credentials: [],
    company_financial_accounts: [],
  };
  const writes: Array<{ table: string; action: string; keys: string[] }> = [];
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
        writes.push({ table, action, keys: Object.keys(payload || {}) });
        return { data: [row], error: null };
      }
      const rows = tables[table].filter(matches);
      if (action === 'update' && payload) {
        for (const row of rows) Object.assign(row, payload);
        writes.push({ table, action, keys: Object.keys(payload) });
      }
      if (action === 'delete') {
        tables[table] = tables[table].filter((row) => !matches(row));
        writes.push({ table, action, keys: [] });
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
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  ].filter(Boolean) as string[];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-persist-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  for (const bin of candidates) {
    try {
      execSync(
        `"${bin}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=c6-persist-test"`,
        { stdio: 'ignore' },
      );
      return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    } catch {
      /* tenta o próximo binário */
    }
  }
  throw new Error('openssl local indisponível para o par de teste');
}

function reauthDeps(): PrimaryAdminReauthDeps {
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
    verifyPassword: async ({ password }) =>
      password === 'senha-correta' ? { userId: 'principal-a' } : { userId: null },
    countRecentFailures: async () => 0,
    now: () => Date.parse('2026-11-21T12:00:00Z'),
  };
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
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
    const empty = memoryAdmin();
    let firstError = '';
    try {
      await saveCompanyC6BankConfig(
        empty as never,
        'empresa-a',
        { environment: 'SANDBOX' },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      );
    } catch (error) {
      firstError = error instanceof Error ? error.message : String(error);
    }
    assert(firstError.includes('Client ID obrigatório'), 'primeira configuração sem credenciais é recusada');
    assert(empty.tables.bank_integrations.length === 0, 'recusa inicial não cria integração');
    assert(empty.tables.bank_credentials.length === 0, 'recusa inicial não cria credencial');
    assert(empty.writes.length === 0, 'recusa inicial não grava');

    const created = memoryAdmin();
    created.tables.bank_integrations.push({
      id: 'int-asaas',
      company_id: 'empresa-a',
      provider: 'ASAAS_COMPANY',
      client_id: 'asaas-cliente',
      active: true,
      status: 'ACTIVE',
    });
    created.tables.bank_integrations.push({
      id: 'int-inter',
      company_id: 'empresa-a',
      provider: 'INTER',
      client_id: 'inter-cliente',
      active: true,
      status: 'ACTIVE',
    });
    created.tables.bank_credentials.push({
      id: 'cred-inter',
      integration_id: 'int-inter',
      company_id: 'empresa-a',
      credential_type: 'oauth',
      encrypted_payload: encryptBankingSecret(OTHER_SECRET),
    });
    created.tables.company_financial_accounts.push({
      id: 'conta-asaas',
      company_id: 'empresa-a',
      bank_integration_id: 'int-asaas',
      name: 'Conta Asaas',
    });
    created.tables.company_financial_accounts.push({
      id: 'conta-livre',
      company_id: 'empresa-a',
      bank_integration_id: null,
      name: 'Conta sem vínculo',
    });
    const beforeProviders = snapshot(created.tables.bank_integrations.filter((row) => row.provider !== 'C6'));
    const beforeInterCredential = snapshot(created.tables.bank_credentials);
    let asaasError = '';
    try {
      await saveCompanyC6BankConfig(
        created as never,
        'empresa-a',
        {
          environment: 'SANDBOX',
          clientId: 'cliente-c6',
          clientSecret: SECRET,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
          financialAccountId: 'conta-asaas',
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      );
    } catch (error) {
      asaasError = error instanceof Error ? error.message : String(error);
    }
    assert(asaasError.includes('Asaas'), 'conta Asaas é recusada');
    assert(!created.tables.bank_integrations.some((row) => row.provider === 'C6'), 'recusa do Asaas não cria integração C6');
    assert(created.writes.length === 0, 'recusa do Asaas não grava');
    assert(
      snapshot(created.tables.bank_integrations.filter((row) => row.provider !== 'C6')) === beforeProviders,
      'Asaas e Inter permanecem',
    );

    const saved = await saveCompanyC6BankConfig(
      created as never,
      'empresa-a',
      {
        environment: 'SANDBOX',
        clientId: 'cliente-c6',
        clientSecret: SECRET,
        certificatePem: pair.cert,
        privateKeyPem: pair.key,
        certificateFileName: 'certificado.pem',
        privateKeyFileName: 'chave.pem',
        boletoIntent: false,
        bolepixIntent: false,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    const c6 = created.tables.bank_integrations.find((row) => row.provider === 'C6');
    assert(c6?.active === false && c6.status === 'DRAFT', 'a primeira linha fica inativa e em rascunho');
    assert(saved.active === false && saved.emissionEnabled === false, 'a resposta não ativa a emissão');
    assert(!JSON.stringify(saved).includes(SECRET), 'a resposta da primeira gravação não contém o segredo');
    assert(!JSON.stringify(saved).includes('BEGIN CERTIFICATE'), 'a resposta da primeira gravação não contém certificado');
    const integrationId = String(c6?.id);
    const storedSecret = String(
      created.tables.bank_credentials.find(
        (row) => row.integration_id === integrationId && row.credential_type === 'oauth',
      )?.encrypted_payload || '',
    );
    const storedCert = String(
      created.tables.bank_credentials.find(
        (row) => row.integration_id === integrationId && row.credential_type === 'certificate',
      )?.encrypted_payload || '',
    );
    assert(storedSecret.startsWith('v1:') && !storedSecret.includes(SECRET), 'o segredo é criptografado');
    assert(decryptBankingSecret(storedSecret) === SECRET, 'o segredo criptografado pode ser lido no servidor');
    assert(!storedCert.includes('BEGIN CERTIFICATE'), 'o certificado é criptografado');
    assert(snapshot(created.tables.bank_credentials.filter((row) => row.integration_id === 'int-inter')) === beforeInterCredential, 'credencial Inter permanece');
    assert(
      created.tables.company_financial_accounts.every((row) => row.id !== 'conta-livre' || row.bank_integration_id === null),
      'sem conta selecionada nenhum vínculo é criado',
    );

    const admin = memoryAdmin();
    admin.tables.bank_integrations.push({
      ...c6,
      active: true,
      status: 'DRAFT',
      environment: 'SANDBOX',
      metadata: { legado: 'manter', c6: { boleto: false, emission_enabled: true } },
    });
    admin.tables.bank_credentials.push(
      { id: 'oauth-1', integration_id: integrationId, company_id: 'empresa-a', credential_type: 'oauth', encrypted_payload: storedSecret },
      { id: 'cert-1', integration_id: integrationId, company_id: 'empresa-a', credential_type: 'certificate', encrypted_payload: storedCert },
    );
    admin.tables.bank_integrations.push({
      id: 'int-inter',
      company_id: 'empresa-a',
      provider: 'INTER',
      client_id: 'inter-cliente',
      active: true,
    });
    admin.tables.company_financial_accounts.push({
      id: 'conta-livre',
      company_id: 'empresa-a',
      bank_integration_id: null,
    });
    const beforeUpdate = snapshot(admin.tables);
    const updated = await saveCompanyC6BankConfig(
      admin as never,
      'empresa-a',
      {
        environment: 'SANDBOX',
        clientId: 'cliente-c6',
        clientSecret: '',
        certificatePem: '',
        privateKeyPem: '',
        boletoIntent: true,
        bolepixIntent: false,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    const updatedRow = admin.tables.bank_integrations.find((row) => row.id === integrationId);
    const metadata = updatedRow?.metadata as { legado?: string; c6?: Record<string, unknown> };
    assert(updatedRow?.active === true, 'atualização preserva active');
    assert(updatedRow?.status === 'DRAFT', 'atualização preserva status');
    assert(updatedRow?.environment === 'SANDBOX', 'ambiente enviado igual permanece SANDBOX');
    assert(metadata.legado === 'manter', 'metadado existente permanece');
    assert(metadata.c6?.boleto === true, 'a intenção de boleto é gravada');
    assert(metadata.c6?.emission_enabled === false, 'a emissão permanece desligada no metadado');
    assert(metadata.c6?.webhook_enabled === false && metadata.c6?.settlement_enabled === false, 'webhook e liquidação permanecem desligados');
    assert(
      admin.tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload === storedSecret,
      'segredo vazio preserva a credencial',
    );
    assert(
      admin.tables.bank_credentials.find((row) => row.credential_type === 'certificate')?.encrypted_payload === storedCert,
      'certificado vazio preserva a credencial',
    );
    assert(!admin.writes.some((write) => write.table === 'bank_credentials'), 'segredo vazio não regrava credencial');
    assert(!admin.writes.some((write) => write.table === 'company_financial_accounts'), 'sem conta selecionada a conta financeira não muda');
    assert(admin.rpcCalls === 1, 'a integração existente é atualizada numa única chamada');
    assert(updated.active === false && updated.hasClientSecret && updated.hasCertificate, 'a resposta pública continua sem ativar e sem revelar segredo');
    assert(!JSON.stringify(updated).includes(SECRET), 'a atualização não devolve o segredo');
    assert(snapshot(admin.tables.bank_integrations.find((row) => row.provider === 'INTER')) === snapshot(JSON.parse(beforeUpdate).bank_integrations.find((row: Row) => row.provider === 'INTER')), 'Inter não é alterado');

    const foreign = memoryAdmin();
    foreign.tables.bank_integrations.push({
      id: 'c6-b',
      company_id: 'empresa-b',
      provider: 'C6',
      client_id: 'cliente-b',
      active: true,
      status: 'DRAFT',
      environment: 'SANDBOX',
    });
    foreign.tables.bank_credentials.push({
      id: 'oauth-b',
      integration_id: 'c6-b',
      company_id: 'empresa-b',
      credential_type: 'oauth',
      encrypted_payload: encryptBankingSecret(OTHER_SECRET),
    });
    const foreignBefore = snapshot(foreign.tables);
    let foreignError = '';
    try {
      await saveCompanyC6BankConfig(
        foreign as never,
        'empresa-a',
        {
          environment: 'SANDBOX',
          clientId: 'cliente-invasor',
          clientSecret: SECRET,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
        },
        { integrationId: 'c6-b' },
        { supabaseUrl: DEVELOP_URL },
      );
    } catch (error) {
      foreignError = error instanceof Error ? error.message : String(error);
    }
    assert(foreignError.includes('não encontrada nesta empresa'), 'integração de outra empresa é recusada');
    assert(snapshot(foreign.tables) === foreignBefore, 'a empresa errada não é gravada');

    const deniedPassword = 'senha-incorreta';
    const denied = await verifyPrimaryAdminPassword(reauthDeps(), {
      operatorUserId: 'operador-a',
      password: deniedPassword,
      companyId: 'empresa-a',
    });
    assert(denied.ok === false && denied.reason === 'password_rejected', 'senha administrativa incorreta é recusada');
    const deniedAudit = buildPrimaryAdminVerifyAuditEvent(denied);
    assert(!JSON.stringify(denied).includes(deniedPassword), 'a recusa não devolve a senha');
    assert(!JSON.stringify(deniedAudit).includes(deniedPassword), 'a auditoria não grava a senha');
    assert(isTenantEnterpriseAdminRole('CORRETOR') === false, 'corretor não administra a empresa');
    assert(isTenantEnterpriseAdminRole('ADMIN') === true, 'administrador da empresa continua autorizado');

    const failing = memoryAdmin({ fault: 'credential' });
    failing.tables.bank_integrations.push({
      id: integrationId,
      company_id: 'empresa-a',
      provider: 'C6',
      bank_provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-c6',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: { legado: 'manter' },
      configured_at: '2026-11-20T00:00:00.000Z',
    });
    failing.tables.bank_credentials.push({
      id: 'oauth-1',
      integration_id: integrationId,
      company_id: 'empresa-a',
      credential_type: 'oauth',
      encrypted_payload: storedSecret,
    });
    const beforeFailure = snapshot(failing.tables.bank_integrations);
    let failure = '';
    try {
      await saveCompanyC6BankConfig(
        failing as never,
        'empresa-a',
        { environment: 'SANDBOX', clientId: 'cliente-c6', clientSecret: SECRET },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    assert(failure === 'falha simulada de gravacao', 'falha de credencial interrompe o salvamento');
    assert(!failure.includes(SECRET), 'o erro da falha não contém o segredo');
    assert(snapshot(failing.tables.bank_integrations) === beforeFailure, 'falha de credencial não altera a integração');
    assert(
      failing.tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload === storedSecret,
      'falha de credencial preserva o ciphertext anterior',
    );

    const failedInsert = memoryAdmin({ fault: 'credential' });
    let insertFailure = '';
    try {
      await saveCompanyC6BankConfig(
        failedInsert as never,
        'empresa-a',
        {
          environment: 'SANDBOX',
          clientId: 'cliente-novo',
          clientSecret: SECRET,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      );
    } catch (error) {
      insertFailure = error instanceof Error ? error.message : String(error);
    }
    assert(insertFailure === 'falha simulada de gravacao', 'falha na primeira credencial interrompe');
    assert(failedInsert.tables.bank_integrations.length === 0, 'a integração criada na tentativa é descartada');
    assert(failedInsert.tables.bank_credentials.length === 0, 'credencial parcial da tentativa é descartada');

    assert(
      redactC6ErrorMessage(new Error(`falha ${SECRET} BEGIN CERTIFICATE`), 'Erro ao salvar configuração C6.') ===
        'Erro ao salvar configuração C6.',
      'mensagem com segredo ou certificado é substituída',
    );
    assert(isC6BoletoSandboxLiveAuthorized('SANDBOX') === false, 'o salvamento não autoriza emissão');
    assert(logs.every((line) => !line.includes(SECRET) && !line.includes('BEGIN CERTIFICATE')), 'logs do teste não receberam credencial');

    const root = path.resolve(__dirname, '..');
    const route = fs.readFileSync(path.join(root, 'app/api/banking/c6/config/route.ts'), 'utf8');
    const repository = fs.readFileSync(path.join(root, 'lib/banking/c6/c6ConfigRepository.ts'), 'utf8');
    const putFlow = fs.readFileSync(path.join(root, 'lib/banking/c6/c6ConfigPut.ts'), 'utf8');
    assert(route.includes('tenantId: auth.tenantId'), 'a empresa vem da sessão');
    assert(putFlow.includes('companyId: input.tenantId'), 'a reautenticação usa a empresa da sessão');
    assert(!route.includes('record.companyId') && !putFlow.includes('record.companyId'), 'o corpo não escolhe a empresa');
    assert(!route.includes('encrypted_payload') && !putFlow.includes('encrypted_payload'), 'a rota não lê ciphertext');
    assert(!route.includes('loadC6SecretsForServer') && !putFlow.includes('loadC6SecretsForServer'), 'a rota não decifra credencial');
    assert(putFlow.includes('redactC6ErrorMessage'), 'log e resposta passam pela redação');
    assert(route.includes('status: 403') || putFlow.includes('status: 403'), 'a rota tem recusa de autorização');
    assert(
      putFlow.indexOf('await verifyPrimaryAdminPassword') < putFlow.indexOf('await saveCompanyC6BankConfig'),
      'a senha é conferida antes de gravar',
    );
    assert(!/finance_receipts|cash_movements|\bcontracts\b|\bsales\b/.test(repository + route), 'o salvamento não opera parcela, caixa, contrato ou venda');
  } finally {
    console.error = originalError;
    if (previousKey === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  }

  console.log('C6_CONFIG_PERSISTENCE_OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
