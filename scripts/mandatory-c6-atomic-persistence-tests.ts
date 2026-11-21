/**
 * Persistência atômica C6 simulada em memória.
 * Não abre banco, não executa a migration e não grava credencial real.
 * npx tsx scripts/mandatory-c6-atomic-persistence-tests.ts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applySaveCompanyC6BankConfig,
  bindC6AtomicRpc,
  type C6AtomicFault,
  type C6AtomicTables,
} from '../lib/banking/c6/c6ConfigAtomic';
import { decryptBankingSecret } from '../lib/banking/credentialsCrypto';
import { saveCompanyC6BankConfig } from '../lib/banking/c6/c6ConfigRepository';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ROOT = path.join(__dirname, '..');
const DEVELOP_URL = 'https://hoynysmynxncdlptuzub.supabase.co';
const COMPANY = 'empresa-atomica';
const SECRET_A = 'segredo-atomico-a';
const SECRET_B = 'segredo-atomico-b';

type Row = Record<string, unknown> & { id?: string };

function memoryAdmin(options?: { fault?: C6AtomicFault; missing?: boolean; integrityFault?: boolean }) {
  const tables: C6AtomicTables & Record<string, Row[]> = {
    bank_integrations: [],
    bank_credentials: [],
    company_financial_accounts: [],
  };
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Array<[string, unknown]> = [];
    let action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    const matches = (row: Row) => filters.every(([key, value]) => row[key] === value);
    const run = () => {
      if (action === 'insert' || action === 'update' || action === 'delete') {
        throw new Error('gravação direta não é permitida');
      }
      return { data: tables[table].filter(matches), error: null };
    };
    const api = {
      select() {
        return api;
      },
      insert() {
        action = 'insert';
        return api;
      },
      update() {
        action = 'update';
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
          if (
            options?.integrityFault &&
            table === 'bank_credentials' &&
            filters.some(([key]) => key === 'company_id')
          ) {
            resolve({ data: null, error: { message: 'falha simulada de integridade' } });
            return;
          }
          resolve(run());
        } catch (error) {
          if (reject) reject(error);
          else throw error;
        }
      },
    };
    return api;
  }
  return bindC6AtomicRpc({ from, tables }, options);
}

function opensslPair(): { cert: string; key: string } {
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
  ].filter(Boolean) as string[];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c6-atomic-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  for (const bin of candidates) {
    try {
      execSync(
        `"${bin}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=c6-atomic-test"`,
        { stdio: 'ignore' },
      );
      return { cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
    } catch {
      /* tenta o próximo binário */
    }
  }
  throw new Error('openssl indisponível para o certificado fictício');
}

function snapshot(tables: C6AtomicTables): string {
  return JSON.stringify({
    bank_integrations: tables.bank_integrations,
    bank_credentials: tables.bank_credentials,
    company_financial_accounts: tables.company_financial_accounts,
  });
}

async function capture(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main() {
  const previousKey = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
  process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
  const pair = opensslPair();
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '20261121140000_save_company_c6_bank_config.sql'),
    'utf8',
  );
  const repository = fs.readFileSync(
    path.join(ROOT, 'lib', 'banking', 'c6', 'c6ConfigRepository.ts'),
    'utf8',
  );

  try {
    assert(sql.includes('SECURITY DEFINER'), 'a função é security definer');
    assert(sql.includes('CREATE FUNCTION public.save_company_c6_bank_config'), 'a função é criada sem substituição');
    assert(!sql.includes('CREATE OR REPLACE'), 'não há substituição acidental da função');
    assert(sql.includes('SET search_path = pg_catalog, pg_temp'), 'search_path fica restrito ao catálogo');
    assert(!sql.includes('SET search_path = public'), 'search_path público foi removido');
    const normalizedSql = sql.replace(/\r\n/g, '\n');
    const beginAt = normalizedSql.indexOf('\nBEGIN;\n');
    const createAt = normalizedSql.indexOf('CREATE FUNCTION');
    const grantAt = normalizedSql.indexOf('GRANT EXECUTE');
    const notifyAt = normalizedSql.indexOf("NOTIFY pgrst, 'reload schema';");
    const commitAt = normalizedSql.lastIndexOf('\nCOMMIT;');
    assert(beginAt >= 0 && beginAt < createAt && grantAt < notifyAt && notifyAt < commitAt, 'instalação, grants e comentário ficam na mesma transação');
    assert(sql.includes('Credencial OAuth duplicada nesta integração C6.'), 'oauth duplicado é recusado antes da gravação');
    assert(sql.includes('Credencial de certificado duplicada nesta integração C6.'), 'certificado duplicado é recusado antes da gravação');
    assert(sql.includes('FROM anon, authenticated'), 'anon e authenticated perdem execução');
    assert(sql.includes('TO service_role'), 'somente service_role executa');
    assert(!sql.includes('TO anon') && !sql.includes('TO authenticated'), 'não há grant para papéis de usuário');
    assert(!sql.includes('active = true'), 'a função não ativa a integração');
    const rpcSignature = [
      'p_company_id',
      'p_environment',
      'p_client_id',
      'p_certificate_name',
      'p_boleto',
      'p_bolepix',
      'p_oauth_payload',
      'p_certificate_payload',
      'p_financial_account_id',
    ];
    assert(rpcSignature.every((name) => sql.includes(name)), 'a RPC mantém os nove parâmetros');
    assert(rpcSignature.every((name) => repository.includes(`${name}:`)), 'o repositório envia a mesma assinatura');
    assert(sql.includes("pg_advisory_xact_lock"), 'há trava por empresa');
    assert(sql.includes("^v1:"), 'ciphertext fora do formato é recusado');
    assert(sql.includes('company_id = p_company_id'), 'as escritas filtram a empresa');
    assert(sql.includes("provider = 'C6'"), 'somente a linha C6 é atualizada');
    assert(sql.includes('GET DIAGNOSTICS v_count = ROW_COUNT'), 'cada escrita confere a quantidade de linhas');
    assert(sql.includes("'emission_enabled', false"), 'emissão permanece desligada');
    assert(sql.includes("'webhook_enabled', false"), 'webhook permanece desligado');
    assert(sql.includes("'settlement_enabled', false"), 'liquidação permanece desligada');
    assert(!sql.includes('finance_receipts') && !sql.includes('public.sales') && !sql.includes('contracts'), 'a função não alcança financeiro, venda ou contrato');
    assert(repository.includes('admin.rpc(SAVE_COMPANY_C6_BANK_CONFIG_RPC'), 'a API chama a RPC');
    assert(repository.includes('ainda não está instalada neste ambiente'), 'RPC ausente falha fechada');
    const integrityStart = repository.indexOf('async function assertNoDuplicateC6Credentials');
    const integrityEnd = repository.indexOf('async function inspectC6FinancialAccountLink');
    const integrityFn = repository.slice(integrityStart, integrityEnd);
    assert(integrityFn.includes(".select('credential_type')"), 'a checagem lê só o tipo da credencial');
    assert(integrityFn.includes(".eq('integration_id', integrationId)"), 'a checagem filtra a integração');
    assert(integrityFn.includes(".eq('company_id', companyId)"), 'a checagem filtra a empresa');
    assert(!integrityFn.includes('encrypted_payload'), 'a checagem não consulta o ciphertext');
    assert(!repository.includes('writeC6Secrets') && !repository.includes('upsertCredential'), 'não há fallback de gravação separada');
    assert(!/\.from\('bank_(integrations|credentials)'\)[\s\S]{0,120}\.(insert|update|delete)/.test(repository), 'a API não grava integração nem credencial direto');

    const first = memoryAdmin();
    const created = await saveCompanyC6BankConfig(
      first as never,
      COMPANY,
      {
        environment: 'SANDBOX',
        clientId: 'cliente-atomico',
        clientSecret: SECRET_A,
        certificatePem: pair.cert,
        privateKeyPem: pair.key,
        boletoIntent: false,
        bolepixIntent: false,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    const createdRow = first.tables.bank_integrations.find((row) => row.provider === 'C6');
    assert(first.tables.bank_integrations.filter((row) => row.provider === 'C6').length === 1, 'primeira configuração cria uma linha C6');
    assert(createdRow?.active === false && createdRow.status === 'DRAFT', 'a primeira linha nasce inativa e em rascunho');
    assert(created.active === false && created.emissionEnabled === false, 'a resposta pública não ativa emissão');
    const createdSecret = String(
      first.tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload || '',
    );
    assert(createdSecret.startsWith('v1:') && !createdSecret.includes(SECRET_A), 'o segredo inicial fica criptografado');
    assert(decryptBankingSecret(createdSecret) === SECRET_A, 'o servidor ainda consegue ler o segredo');
    assert(!JSON.stringify(created).includes(SECRET_A) && !JSON.stringify(created).includes('BEGIN CERTIFICATE'), 'a resposta inicial não revela segredo nem certificado');

    const current = memoryAdmin();
    current.tables.bank_integrations.push({
      ...createdRow,
      active: true,
      status: 'DRAFT',
      metadata: { legado: 'manter', c6: { boleto: false, bolepix: false, emission_enabled: true } },
    });
    current.tables.bank_credentials.push(
      ...first.tables.bank_credentials.filter((row) => row.integration_id === createdRow?.id),
    );
    const updated = await saveCompanyC6BankConfig(
      current as never,
      COMPANY,
      {
        environment: 'SANDBOX',
        clientId: 'cliente-atomico-2',
        clientSecret: SECRET_B,
        boletoIntent: true,
        bolepixIntent: false,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    const updatedRow = current.tables.bank_integrations.find((row) => row.id === createdRow?.id);
    const updatedMeta = updatedRow?.metadata as { legado?: string; c6?: Record<string, unknown> };
    const updatedSecret = String(
      current.tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload || '',
    );
    assert(updatedRow?.active === true && updatedRow.status === 'DRAFT', 'atualização preserva active e status');
    assert(updatedRow?.client_id === 'cliente-atomico-2', 'atualização grava o novo client id');
    assert(updatedMeta.legado === 'manter' && updatedMeta.c6?.boleto === true, 'metadado anterior permanece e a intenção muda');
    assert(updatedMeta.c6?.emission_enabled === false, 'a atualização desliga a emissão no metadado');
    assert(
      updatedMeta.c6?.webhook_enabled === false && updatedMeta.c6?.settlement_enabled === false,
      'webhook e liquidação permanecem desligados',
    );
    assert(decryptBankingSecret(updatedSecret) === SECRET_B, 'a credencial existente é substituída por completo');
    assert(updated.active === false && !JSON.stringify(updated).includes(SECRET_B), 'a resposta da atualização não revela o segredo');

    const preserved = memoryAdmin();
    preserved.tables.bank_integrations.push({ ...updatedRow });
    preserved.tables.bank_credentials.push(
      ...current.tables.bank_credentials.filter((row) => row.integration_id === updatedRow?.id),
    );
    const beforeEmpty = snapshot(preserved.tables);
    await saveCompanyC6BankConfig(
      preserved as never,
      COMPANY,
      {
        environment: 'SANDBOX',
        clientId: 'cliente-atomico-2',
        clientSecret: '',
        certificatePem: '',
        privateKeyPem: '',
        boletoIntent: false,
        bolepixIntent: true,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    const preservedSecret = preserved.tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload;
    const preservedCert = preserved.tables.bank_credentials.find((row) => row.credential_type === 'certificate')?.encrypted_payload;
    assert(preservedSecret === updatedSecret, 'segredo vazio preserva o ciphertext');
    assert(
      preservedCert === current.tables.bank_credentials.find((row) => row.credential_type === 'certificate')?.encrypted_payload,
      'certificado vazio preserva o ciphertext',
    );
    assert(beforeEmpty !== snapshot(preserved.tables), 'intenção alterada ainda grava a integração');
    assert(preserved.rpcCalls === 1, 'PUT com alteração chama a RPC');

    const identical = memoryAdmin();
    identical.tables.bank_integrations.push({ ...preserved.tables.bank_integrations[0] });
    identical.tables.bank_credentials.push(...preserved.tables.bank_credentials);
    const beforeIdentical = snapshot(identical.tables);
    const identicalResult = await saveCompanyC6BankConfig(
      identical as never,
      COMPANY,
      {
        environment: 'SANDBOX',
        clientId: 'cliente-atomico-2',
        clientSecret: '',
        boletoIntent: false,
        bolepixIntent: true,
      },
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    assert(identical.rpcCalls === 0, 'PUT idêntico não chama a RPC');
    assert(snapshot(identical.tables) === beforeIdentical, 'PUT idêntico não altera banco');
    assert(identicalResult.active === false, 'PUT idêntico continua sem ativar emissão');

    const foreignAccount = memoryAdmin();
    foreignAccount.tables.company_financial_accounts.push({
      id: 'conta-vizinha',
      company_id: 'empresa-vizinha',
      bank_integration_id: null,
    });
    const beforeForeign = snapshot(foreignAccount.tables);
    const foreignError = await capture(() =>
      saveCompanyC6BankConfig(
        foreignAccount as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-atomico',
          clientSecret: SECRET_A,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
          financialAccountId: 'conta-vizinha',
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(foreignError.includes('Conta financeira não encontrada'), 'conta de outra empresa é recusada');
    assert(snapshot(foreignAccount.tables) === beforeForeign, 'conta de outra empresa não é alterada');

    const asaas = memoryAdmin();
    asaas.tables.bank_integrations.push({
      id: 'asaas-1',
      company_id: COMPANY,
      provider: 'ASAAS_COMPANY',
      active: true,
      client_id: 'cliente-asaas',
    });
    asaas.tables.bank_credentials.push({
      id: 'asaas-secret',
      integration_id: 'asaas-1',
      company_id: COMPANY,
      credential_type: 'oauth',
      encrypted_payload: 'v1:asaas-inalterado',
    });
    asaas.tables.company_financial_accounts.push({
      id: 'conta-asaas',
      company_id: COMPANY,
      bank_integration_id: 'asaas-1',
    });
    const beforeAsaas = snapshot(asaas.tables);
    const asaasError = await capture(() =>
      saveCompanyC6BankConfig(
        asaas as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-atomico',
          clientSecret: SECRET_A,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
          financialAccountId: 'conta-asaas',
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(asaasError.includes('Asaas'), 'conta do Asaas é recusada');
    assert(snapshot(asaas.tables) === beforeAsaas, 'Asaas e a credencial Asaas permanecem');
    const asaasDirect = structuredClone(asaas.tables);
    const asaasDirectError = await capture(async () =>
      applySaveCompanyC6BankConfig(asaasDirect, {
        p_company_id: COMPANY,
        p_environment: 'SANDBOX',
        p_client_id: 'cliente-atomico',
        p_oauth_payload: 'v1:nao-gravar',
        p_certificate_payload: 'v1:nao-gravar',
        p_financial_account_id: 'conta-asaas',
      }),
    );
    assert(asaasDirectError.includes('Asaas'), 'a RPC também recusa conta do Asaas');
    assert(snapshot(asaasDirect) === beforeAsaas, 'a recusa da RPC não grava o Asaas');

    const inter = memoryAdmin();
    inter.tables.bank_integrations.push({
      id: 'inter-1',
      company_id: COMPANY,
      provider: 'INTER',
      active: true,
    });
    inter.tables.company_financial_accounts.push({
      id: 'conta-inter',
      company_id: COMPANY,
      bank_integration_id: 'inter-1',
    });
    const beforeInter = snapshot(inter.tables);
    const interDirectError = await capture(async () =>
      applySaveCompanyC6BankConfig(inter.tables, {
        p_company_id: COMPANY,
        p_environment: 'SANDBOX',
        p_client_id: 'cliente-atomico',
        p_oauth_payload: 'v1:nao-gravar',
        p_certificate_payload: 'v1:nao-gravar',
        p_financial_account_id: 'conta-inter',
      }),
    );
    assert(interDirectError.includes('Banco Inter'), 'conta do Inter é recusada');
    assert(snapshot(inter.tables) === beforeInter, 'a recusa não altera o Inter');

    const credentialFault = memoryAdmin({ fault: 'credential' });
    credentialFault.tables.bank_integrations.push({
      id: 'c6-falha',
      company_id: COMPANY,
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-atomico',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: { c6: { boleto: false, bolepix: false } },
    });
    credentialFault.tables.bank_credentials.push({
      id: 'oauth-falha',
      integration_id: 'c6-falha',
      company_id: COMPANY,
      credential_type: 'oauth',
      encrypted_payload: createdSecret,
    });
    const beforeCredential = snapshot(credentialFault.tables);
    const credentialError = await capture(() =>
      saveCompanyC6BankConfig(
        credentialFault as never,
        COMPANY,
        { environment: 'SANDBOX', clientId: 'cliente-atomico', clientSecret: SECRET_B },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(credentialError === 'falha simulada de gravacao', 'falha de credencial interrompe a gravação');
    assert(!credentialError.includes(SECRET_B), 'a falha de credencial não revela o segredo');
    assert(snapshot(credentialFault.tables) === beforeCredential, 'falha de credencial preserva o estado anterior');

    const linkFault = memoryAdmin({ fault: 'link' });
    linkFault.tables.bank_integrations.push({
      id: 'c6-vinculo',
      company_id: COMPANY,
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-atomico',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: { c6: { boleto: false, bolepix: false } },
    });
    linkFault.tables.bank_credentials.push({
      id: 'oauth-vinculo',
      integration_id: 'c6-vinculo',
      company_id: COMPANY,
      credential_type: 'oauth',
      encrypted_payload: createdSecret,
    });
    linkFault.tables.company_financial_accounts.push({
      id: 'conta-c6',
      company_id: COMPANY,
      bank_integration_id: null,
    });
    const beforeLink = snapshot(linkFault.tables);
    const linkError = await capture(() =>
      saveCompanyC6BankConfig(
        linkFault as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-atomico',
          clientSecret: SECRET_B,
          financialAccountId: 'conta-c6',
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(linkError === 'falha simulada de gravacao', 'falha de vínculo interrompe a gravação');
    assert(snapshot(linkFault.tables) === beforeLink, 'falha de vínculo preserva integração, credencial e conta');

    const concurrent = memoryAdmin();
    await Promise.all([
      saveCompanyC6BankConfig(
        concurrent as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-concorrente-a',
          clientSecret: SECRET_A,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
      saveCompanyC6BankConfig(
        concurrent as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-concorrente-b',
          clientSecret: SECRET_B,
          certificatePem: pair.cert,
          privateKeyPem: pair.key,
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    ]);
    const concurrentRows = concurrent.tables.bank_integrations.filter((row) => row.provider === 'C6');
    assert(concurrentRows.length === 1, 'chamadas simultâneas deixam uma única integração C6');
    const winnerId = String(concurrentRows[0]?.client_id || '');
    const winnerSecret = decryptBankingSecret(
      String(
        concurrent.tables.bank_credentials.find(
          (row) => row.integration_id === concurrentRows[0]?.id && row.credential_type === 'oauth',
        )?.encrypted_payload || '',
      ),
    );
    const consistent =
      (winnerId === 'cliente-concorrente-a' && winnerSecret === SECRET_A) ||
      (winnerId === 'cliente-concorrente-b' && winnerSecret === SECRET_B);
    assert(consistent, 'a tentativa simultânea vencedora fica completa, sem misturar segredos');

    const missing = memoryAdmin({ missing: true });
    missing.tables.bank_integrations.push({
      id: 'c6-ausente',
      company_id: COMPANY,
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-atomico',
      metadata: { c6: { boleto: false, bolepix: false } },
    });
    const beforeMissing = snapshot(missing.tables);
    const missingError = await capture(() =>
      saveCompanyC6BankConfig(
        missing as never,
        COMPANY,
        { environment: 'SANDBOX', clientId: 'cliente-novo', clientSecret: SECRET_A },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(missingError.includes('não está instalada neste ambiente'), 'RPC ausente é recusada');
    assert(snapshot(missing.tables) === beforeMissing, 'RPC ausente não grava pelo método antigo');

    const invalid = structuredClone(first.tables);
    const beforeInvalid = snapshot(invalid);
    const invalidError = await capture(async () =>
      applySaveCompanyC6BankConfig(invalid, {
        p_company_id: COMPANY,
        p_environment: 'SANDBOX',
        p_client_id: 'cliente-atomico',
        p_oauth_payload: 'segredo-em-claro',
      }),
    );
    assert(invalidError.includes('Credencial OAuth recusada'), 'ciphertext inválido é recusado');
    assert(snapshot(invalid) === beforeInvalid, 'ciphertext inválido não altera o estado');

    const duplicateOauth = memoryAdmin();
    duplicateOauth.tables.bank_integrations.push({
      id: 'c6-oauth-dup',
      company_id: COMPANY,
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-atomico',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: {
        c6: {
          boleto: false,
          bolepix: false,
          emission_enabled: false,
          webhook_enabled: false,
          settlement_enabled: false,
        },
      },
    });
    duplicateOauth.tables.bank_credentials.push(
      {
        id: 'oauth-dup-1',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-preservado-1',
      },
      {
        id: 'oauth-dup-2',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-preservado-2',
      },
      {
        id: 'cert-unico',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-preservado',
      },
    );
    const beforeDuplicateOauth = snapshot(duplicateOauth.tables);
    const duplicateOauthError = await capture(() =>
      saveCompanyC6BankConfig(
        duplicateOauth as never,
        COMPANY,
        {
          environment: 'SANDBOX',
          clientId: 'cliente-atomico',
          clientSecret: '',
          boletoIntent: true,
          bolepixIntent: false,
        },
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(
      duplicateOauthError.includes('Credencial OAuth duplicada nesta integração C6.'),
      'oauth duplicado sem segredo novo é recusado',
    );
    assert(snapshot(duplicateOauth.tables) === beforeDuplicateOauth, 'oauth duplicado não altera integração nem ciphertext');
    assert(duplicateOauth.tables.bank_integrations[0]?.active === true, 'oauth duplicado preserva active');

    const duplicateUnchanged = structuredClone(duplicateOauth.tables);
    const beforeDuplicateUnchanged = snapshot(duplicateUnchanged);
    const duplicateUnchangedError = await capture(async () =>
      applySaveCompanyC6BankConfig(duplicateUnchanged, {
        p_company_id: COMPANY,
        p_environment: 'SANDBOX',
        p_client_id: 'cliente-atomico',
        p_certificate_name: 'certificado.pem||chave.pem',
        p_boleto: false,
        p_bolepix: false,
        p_oauth_payload: null,
        p_certificate_payload: null,
      }),
    );
    assert(
      duplicateUnchangedError.includes('Credencial OAuth duplicada nesta integração C6.'),
      'oauth duplicado também é recusado no retorno sem alteração',
    );
    assert(snapshot(duplicateUnchanged) === beforeDuplicateUnchanged, 'retorno sem alteração não grava oauth duplicado');

    const duplicateCertificate = structuredClone(duplicateOauth.tables);
    duplicateCertificate.bank_credentials = duplicateCertificate.bank_credentials.filter(
      (row) => row.credential_type !== 'oauth',
    );
    duplicateCertificate.bank_credentials.push(
      {
        id: 'oauth-unico',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-unico',
      },
      {
        id: 'cert-dup-2',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-preservado-2',
      },
    );
    const beforeDuplicateCertificate = snapshot(duplicateCertificate);
    const duplicateCertificateError = await capture(async () =>
      applySaveCompanyC6BankConfig(duplicateCertificate, {
        p_company_id: COMPANY,
        p_environment: 'SANDBOX',
        p_client_id: 'cliente-atomico',
        p_certificate_name: 'certificado.pem||chave.pem',
        p_boleto: false,
        p_bolepix: false,
        p_oauth_payload: null,
        p_certificate_payload: null,
      }),
    );
    assert(
      duplicateCertificateError.includes('Credencial de certificado duplicada nesta integração C6.'),
      'certificado duplicado sem segredo novo é recusado',
    );
    assert(snapshot(duplicateCertificate) === beforeDuplicateCertificate, 'certificado duplicado não altera o estado');

    const isolated = structuredClone(duplicateOauth.tables);
    isolated.bank_credentials = isolated.bank_credentials.filter((row) => row.company_id === COMPANY && row.credential_type === 'certificate');
    isolated.bank_credentials.push(
      {
        id: 'oauth-nossa',
        integration_id: 'c6-oauth-dup',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-nossa',
      },
      {
        id: 'oauth-vizinha-1',
        integration_id: 'c6-oauth-dup',
        company_id: 'empresa-vizinha',
        credential_type: 'oauth',
        encrypted_payload: 'v1:vizinha-1',
      },
      {
        id: 'oauth-vizinha-2',
        integration_id: 'c6-oauth-dup',
        company_id: 'empresa-vizinha',
        credential_type: 'oauth',
        encrypted_payload: 'v1:vizinha-2',
      },
    );
    const beforeIsolated = snapshot(isolated);
    const isolatedResult = applySaveCompanyC6BankConfig(isolated, {
      p_company_id: COMPANY,
      p_environment: 'SANDBOX',
      p_client_id: 'cliente-atomico',
      p_certificate_name: 'certificado.pem||chave.pem',
      p_boleto: false,
      p_bolepix: false,
      p_oauth_payload: null,
      p_certificate_payload: null,
    });
    assert(isolatedResult.unchanged === true, 'duplicata de outra empresa não bloqueia esta integração');
    assert(snapshot(isolated) === beforeIsolated, 'a checagem isolada não altera credenciais da empresa vizinha');

    const identicalBase = {
      id: 'c6-identica',
      company_id: COMPANY,
      provider: 'C6',
      environment: 'SANDBOX',
      status: 'DRAFT',
      active: true,
      client_id: 'cliente-atomico',
      certificate_name: 'certificado.pem||chave.pem',
      metadata: {
        c6: {
          boleto: false,
          bolepix: false,
          emission_enabled: false,
          webhook_enabled: false,
          settlement_enabled: false,
        },
      },
    };
    const identicalInput = {
      environment: 'SANDBOX' as const,
      clientId: 'cliente-atomico',
      clientSecret: '',
      boletoIntent: false,
      bolepixIntent: false,
    };
    const uniqueIdentical = memoryAdmin();
    uniqueIdentical.tables.bank_integrations.push({ ...identicalBase });
    uniqueIdentical.tables.bank_credentials.push(
      {
        id: 'oauth-unico-identico',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-identico',
      },
      {
        id: 'cert-unico-identico',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-identico',
      },
    );
    const beforeUniqueIdentical = snapshot(uniqueIdentical.tables);
    const uniqueIdenticalResult = await saveCompanyC6BankConfig(
      uniqueIdentical as never,
      COMPANY,
      identicalInput,
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    assert(uniqueIdentical.rpcCalls === 0, 'PUT idêntico sem duplicidade não chama a RPC');
    assert(snapshot(uniqueIdentical.tables) === beforeUniqueIdentical, 'PUT idêntico sem duplicidade não grava');
    assert(uniqueIdenticalResult.active === false, 'PUT idêntico sem duplicidade não ativa emissão');
    assert(
      uniqueIdentical.tables.bank_credentials.find((row) => row.id === 'oauth-unico-identico')?.encrypted_payload ===
        'v1:oauth-identico',
      'PUT idêntico preserva o ciphertext OAuth',
    );

    const identicalOauth = memoryAdmin();
    identicalOauth.tables.bank_integrations.push({ ...identicalBase });
    identicalOauth.tables.bank_credentials.push(
      {
        id: 'oauth-identico-1',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-identico-1',
      },
      {
        id: 'oauth-identico-2',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-identico-2',
      },
      {
        id: 'cert-identico-unico',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-identico-unico',
      },
    );
    const beforeIdenticalOauth = snapshot(identicalOauth.tables);
    const identicalOauthError = await capture(() =>
      saveCompanyC6BankConfig(identicalOauth as never, COMPANY, identicalInput, undefined, { supabaseUrl: DEVELOP_URL }),
    );
    assert(
      identicalOauthError.includes('Credencial OAuth duplicada nesta integração C6.'),
      'PUT idêntico com dois OAuth é recusado',
    );
    assert(identicalOauth.rpcCalls === 0, 'PUT idêntico com OAuth duplicado não chama a RPC');
    assert(snapshot(identicalOauth.tables) === beforeIdenticalOauth, 'PUT idêntico com OAuth duplicado preserva os ciphertexts');

    const identicalCertificate = memoryAdmin();
    identicalCertificate.tables.bank_integrations.push({ ...identicalBase });
    identicalCertificate.tables.bank_credentials.push(
      {
        id: 'oauth-identico-cert',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-para-certificado',
      },
      {
        id: 'cert-identico-1',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-identico-1',
      },
      {
        id: 'cert-identico-2',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-identico-2',
      },
    );
    const beforeIdenticalCertificate = snapshot(identicalCertificate.tables);
    const identicalCertificateError = await capture(() =>
      saveCompanyC6BankConfig(
        identicalCertificate as never,
        COMPANY,
        identicalInput,
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(
      identicalCertificateError.includes('Credencial de certificado duplicada nesta integração C6.'),
      'PUT idêntico com dois certificados é recusado',
    );
    assert(identicalCertificate.rpcCalls === 0, 'PUT idêntico com certificado duplicado não chama a RPC');
    assert(
      snapshot(identicalCertificate.tables) === beforeIdenticalCertificate,
      'PUT idêntico com certificado duplicado preserva os ciphertexts',
    );

    const identicalNeighbor = memoryAdmin();
    identicalNeighbor.tables.bank_integrations.push({ ...identicalBase });
    identicalNeighbor.tables.bank_credentials.push(
      {
        id: 'oauth-empresa',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-empresa',
      },
      {
        id: 'cert-empresa',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-empresa',
      },
      {
        id: 'oauth-vizinha-a',
        integration_id: 'c6-identica',
        company_id: 'empresa-vizinha',
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-vizinha-a',
      },
      {
        id: 'oauth-vizinha-b',
        integration_id: 'c6-identica',
        company_id: 'empresa-vizinha',
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-vizinha-b',
      },
    );
    const beforeIdenticalNeighbor = snapshot(identicalNeighbor.tables);
    const identicalNeighborResult = await saveCompanyC6BankConfig(
      identicalNeighbor as never,
      COMPANY,
      identicalInput,
      undefined,
      { supabaseUrl: DEVELOP_URL },
    );
    assert(identicalNeighbor.rpcCalls === 0, 'duplicidade de outra empresa não chama a RPC');
    assert(snapshot(identicalNeighbor.tables) === beforeIdenticalNeighbor, 'duplicidade de outra empresa não altera credenciais');
    assert(identicalNeighborResult.active === false, 'duplicidade de outra empresa não ativa a emissão');

    const integrityFailure = memoryAdmin({ integrityFault: true });
    integrityFailure.tables.bank_integrations.push({ ...identicalBase });
    integrityFailure.tables.bank_credentials.push(
      {
        id: 'oauth-falha-leitura',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'oauth',
        encrypted_payload: 'v1:oauth-falha-leitura',
      },
      {
        id: 'cert-falha-leitura',
        integration_id: 'c6-identica',
        company_id: COMPANY,
        credential_type: 'certificate',
        encrypted_payload: 'v1:cert-falha-leitura',
      },
    );
    const beforeIntegrityFailure = snapshot(integrityFailure.tables);
    const integrityFailureError = await capture(() =>
      saveCompanyC6BankConfig(
        integrityFailure as never,
        COMPANY,
        identicalInput,
        undefined,
        { supabaseUrl: DEVELOP_URL },
      ),
    );
    assert(integrityFailureError.includes('falha simulada de integridade'), 'falha de leitura recusa o PUT idêntico');
    assert(integrityFailure.rpcCalls === 0, 'falha de leitura não chama a RPC');
    assert(snapshot(integrityFailure.tables) === beforeIntegrityFailure, 'falha de leitura não grava nem apaga ciphertext');

    console.log('C6_ATOMIC_PERSISTENCE_OK');
  } finally {
    if (previousKey === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
