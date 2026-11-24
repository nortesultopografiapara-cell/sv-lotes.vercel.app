/**
 * A conta C6 nasce sem provedor e não reaproveita Asaas ou Inter.
 * npx tsx scripts/mandatory-c6-financial-account-link-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  C6_FINANCIAL_ACCOUNT_NOTE,
  c6FinancialAccountIdForSave,
  createUnlinkedC6FinancialAccount,
  isPendingC6FinancialAccount,
} from '../lib/banking/c6/c6FinancialAccount';
import { applySaveCompanyC6BankConfig } from '../lib/banking/c6/c6ConfigAtomic';
import { redactC6ErrorMessage } from '../lib/banking/c6/c6ConfigRepository';
import {
  captureC6BankDiagnostic,
  describeC6BolepixV2Outcome,
  readSanitizedC6BankError,
} from '../lib/banking/c6/c6BolepixV2Issue';
import { c6BankDiagnosticLines } from '../lib/charges/c6ChargeActions';
import { buildC6BolepixV2CreateBody } from '../lib/banking/c6/c6BolepixV2Validation';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

type Row = Record<string, unknown>;

function mockAdmin(rows: Row[], integrations: Row[] = []) {
  return {
    from(table: string) {
      const source = table === 'company_financial_accounts' ? rows : table === 'bank_integrations' ? integrations : null;
      if (!source) throw new Error(`tabela inesperada: ${table}`);
      const filters: Array<{ key: string; value: unknown; op: 'eq' | 'is' }> = [];
      let insertRow: Row | null = null;
      const chain = {
        select() {
          return chain;
        },
        eq(key: string, value: unknown) {
          filters.push({ key, value, op: 'eq' });
          return chain;
        },
        is(key: string, value: unknown) {
          filters.push({ key, value, op: 'is' });
          return chain;
        },
        insert(row: Row) {
          insertRow = row;
          return chain;
        },
        single() {
          if (table !== 'company_financial_accounts') throw new Error('insert inesperado');
          const row = { id: `fa-${rows.length + 1}`, ...insertRow };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          const data = source.filter((row) =>
            filters.every((filter) =>
              filter.op === 'is' ? row[filter.key] == null : row[filter.key] === filter.value,
            ),
          );
          resolve({ data, error: null });
        },
      };
      return chain;
    },
  };
}

async function main() {
  const rows: Row[] = [
    {
      id: 'asaas-1',
      company_id: 'company-a',
      name: 'Conta Asaas',
      bank_integration_id: 'int-asaas',
      active: true,
      notes: 'Asaas',
    },
    {
      id: 'inter-1',
      company_id: 'company-a',
      name: 'Conta Inter',
      bank_integration_id: 'int-inter',
      active: true,
      notes: 'Inter',
    },
    {
      id: 'other-company',
      company_id: 'company-b',
      name: 'Conta C6',
      bank_integration_id: null,
      active: true,
      notes: C6_FINANCIAL_ACCOUNT_NOTE,
    },
  ];
  const admin = mockAdmin(rows) as never;
  const created = await createUnlinkedC6FinancialAccount(admin, 'company-a', 'PRODUCTION');
  assert(created.created, 'cria uma conta nova quando não há conta C6 livre');
  assert(created.id !== 'asaas-1' && created.id !== 'inter-1' && created.id !== 'other-company', 'não reutiliza outra conta');
  const inserted = rows.find((row) => row.id === created.id);
  assert(inserted?.company_id === 'company-a', 'a conta fica na empresa da sessão');
  assert(inserted?.bank_integration_id == null, 'a conta nasce sem vínculo');
  assert(inserted?.is_default === false, 'a conta não vira padrão');
  assert(rows.filter((row) => row.bank_integration_id === 'int-asaas').length === 1, 'a conta Asaas permanece');
  assert(rows.filter((row) => row.bank_integration_id === 'int-inter').length === 1, 'a conta Inter permanece');

  const reused = await createUnlinkedC6FinancialAccount(admin, 'company-a', 'PRODUCTION');
  assert(!reused.created && reused.id === created.id, 'reutiliza somente a conta C6 ainda sem vínculo');
  assert(rows.filter((row) => row.company_id === 'company-a' && row.bank_integration_id == null).length === 1, 'não duplica a conta');

  assert(!isPendingC6FinancialAccount({ provider: 'ASAAS_COMPANY', notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'Asaas não é tratado como C6');
  assert(!isPendingC6FinancialAccount({ provider: 'INTER', notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'Inter não é tratado como C6');
  assert(isPendingC6FinancialAccount({ provider: null, notes: C6_FINANCIAL_ACCOUNT_NOTE }), 'conta sem provedor pode ser selecionada');

  const linkedRows: Row[] = [
    {
      id: 'c6-owned',
      company_id: 'company-a',
      name: 'Conta C6',
      bank_integration_id: 'int-c6',
      active: true,
      notes: C6_FINANCIAL_ACCOUNT_NOTE,
    },
    {
      id: 'c6-orphan',
      company_id: 'company-a',
      name: 'Conta C6',
      bank_integration_id: null,
      active: true,
      notes: C6_FINANCIAL_ACCOUNT_NOTE,
    },
    {
      id: 'asaas-keep',
      company_id: 'company-a',
      name: 'Conta Asaas',
      bank_integration_id: 'int-asaas',
      active: true,
      notes: 'Asaas',
    },
  ];
  const before = linkedRows.length;
  const kept = await createUnlinkedC6FinancialAccount(
    mockAdmin(linkedRows, [
      { id: 'int-c6', company_id: 'company-a', provider: 'C6' },
      { id: 'int-asaas', company_id: 'company-a', provider: 'ASAAS' },
      { id: 'int-other', company_id: 'company-b', provider: 'C6' },
    ]) as never,
    'company-a',
    'PRODUCTION',
  );
  assert(!kept.created && kept.id === 'c6-owned', 'reutiliza a conta C6 já vinculada');
  assert(linkedRows.length === before, 'não cria outra conta financeira');
  assert(linkedRows.find((row) => row.id === 'c6-orphan')?.bank_integration_id == null, 'não vincula a conta solta');
  assert(linkedRows.find((row) => row.id === 'asaas-keep')?.bank_integration_id === 'int-asaas', 'não mexe na conta Asaas');
  assert(
    c6FinancialAccountIdForSave('c6-orphan', 'c6-owned') === 'c6-owned',
    'salvar duas vezes mantém a conta já vinculada',
  );

  const tables = {
    bank_integrations: [
      {
        id: 'int-c6',
        company_id: 'company-a',
        provider: 'C6',
        environment: 'PRODUCTION',
        status: 'DRAFT',
        active: false,
        is_default: false,
        client_id: 'client',
        certificate_name: null,
        metadata: {
          c6: {
            boleto: false,
            bolepix: true,
            emission_enabled: false,
            bolepix_activation_requested: true,
          },
        },
      },
    ],
    bank_credentials: [
      {
        id: 'oauth-1',
        integration_id: 'int-c6',
        company_id: 'company-a',
        credential_type: 'oauth',
        encrypted_payload: 'v1:old:old:old',
      },
    ],
    company_financial_accounts: [
      { id: 'c6-owned', company_id: 'company-a', bank_integration_id: 'int-c6' },
      { id: 'c6-orphan', company_id: 'company-a', bank_integration_id: null },
      { id: 'asaas-keep', company_id: 'company-a', bank_integration_id: 'int-asaas' },
    ],
  };
  applySaveCompanyC6BankConfig(tables, {
    p_company_id: 'company-a',
    p_environment: 'PRODUCTION',
    p_client_id: 'client',
    p_certificate_name: null,
    p_boleto: false,
    p_bolepix: true,
    p_oauth_payload: 'v1:new:new:new',
    p_certificate_payload: null,
    p_financial_account_id: 'c6-orphan',
  });
  assert(
    tables.company_financial_accounts.find((row) => row.id === 'c6-owned')?.bank_integration_id === 'int-c6',
    'a conta vinculada permanece',
  );
  assert(
    tables.company_financial_accounts.find((row) => row.id === 'c6-orphan')?.bank_integration_id == null,
    'a segunda conta não recebe a integração',
  );
  assert(
    tables.company_financial_accounts.find((row) => row.id === 'asaas-keep')?.bank_integration_id === 'int-asaas',
    'Asaas permanece isolado',
  );
  const savedMeta = tables.bank_integrations[0].metadata as { c6?: { bolepix_activation_requested?: boolean } };
  assert(savedMeta.c6?.bolepix_activation_requested === true, 'a autorização administrativa permanece');
  assert(
    tables.bank_credentials.find((row) => row.credential_type === 'oauth')?.encrypted_payload === 'v1:new:new:new',
    'a credencial existente é atualizada',
  );
  applySaveCompanyC6BankConfig(tables, {
    p_company_id: 'company-a',
    p_environment: 'PRODUCTION',
    p_client_id: 'client',
    p_certificate_name: null,
    p_boleto: false,
    p_bolepix: true,
    p_oauth_payload: null,
    p_certificate_payload: null,
    p_financial_account_id: 'c6-owned',
  });
  assert(tables.company_financial_accounts.length === 3, 'salvar de novo não cria conta');
  assert(
    redactC6ErrorMessage(
      { message: 'duplicate key value violates unique constraint "uq_company_financial_accounts_bank_integration"' },
      'Erro ao salvar configuração C6.',
    ).includes('já possui conta financeira'),
    'a constraint duplicada não vaza como erro cru',
  );

  const rejected = describeC6BolepixV2Outcome({ status: 'FAILED', httpStatus: 400, chargeId: null });
  const denied = describeC6BolepixV2Outcome({ status: 'FAILED', httpStatus: 401, chargeId: null });
  const forbidden = describeC6BolepixV2Outcome({ status: 'FAILED', httpStatus: 403, chargeId: null });
  const invalid = describeC6BolepixV2Outcome({
    status: 'FAILED',
    httpStatus: 422,
    chargeId: null,
    bankCode: 'INVALID_FIELD',
    bankMessage: 'Campo amount',
  });
  const timedOut = describeC6BolepixV2Outcome({ status: 'UNKNOWN', transportCode: 'TIMEOUT' });
  const uncertain = describeC6BolepixV2Outcome({ status: 'UNKNOWN', chargeId: 'bank-1' });
  const waiting = describeC6BolepixV2Outcome({ status: 'WAITING_CONFIRMATION' });
  const secret = readSanitizedC6BankError({
    code: 'INVALID_PAYER',
    message: 'CPF 52998224725 chave 123e4567-e89b-12d3-a456-426614174000',
    trace_id: 'trace-123',
  });
  assert(rejected.kind === 'rejected' && rejected.message.includes('HTTP 400'), 'HTTP 400 é recusa');
  assert(rejected.message.includes('não foi gravada'), 'recusa sem corpo não inventa o motivo');
  assert(denied.kind === 'authentication' && !denied.message.includes('recusou a cobrança'), 'HTTP 401 não é recusa de boleto');
  assert(forbidden.kind === 'authentication', 'HTTP 403 é falha de autorização');
  assert(invalid.kind === 'rejected' && invalid.message.includes('Campo amount'), 'HTTP 422 mostra o motivo sanitizado');
  assert(timedOut.kind === 'timeout' && timedOut.message.includes('não respondeu a tempo'), 'timeout fica incerto');
  assert(uncertain.kind === 'uncertain', 'identificador sem conclusão bloqueia nova emissão');
  assert(
    describeC6BolepixV2Outcome({ status: 'FAILED', httpStatus: 400, chargeId: 'bank-1' }).kind === 'uncertain',
    'recusa com identificador bancário não libera outra emissão',
  );
  assert(waiting.kind === 'waiting', 'confirmação pendente não é pagamento');
  assert(secret.code === 'INVALID_PAYER' && secret.traceId === 'trace-123', 'código e rastreio permanecem');
  assert(!secret.message?.includes('52998224725') && !secret.message?.includes('123e4567'), 'a mensagem não guarda CPF nem EVP');

  const detailed = captureC6BankDiagnostic({
    httpStatus: 400,
    contentType: 'application/json; charset=utf-8',
    bodyText: JSON.stringify({
      code: 'INVALID_ADDRESS',
      message: 'Endereço recusado',
      errors: [{ field: 'payer.address.zip_code', message: 'CEP do pagador 52998224725 inválido' }],
      trace_id: 'trace-400',
      access_token: 'segredo-nao-pode-aparecer',
    }),
    stage: 'bank_slip_post',
    externalReference: '979ED9478CCAFCE5B66C4B3FAD',
    recordedAt: '2026-11-24T18:00:00.000Z',
  });
  const plain = captureC6BankDiagnostic({
    httpStatus: 400,
    contentType: 'text/plain',
    bodyText: 'Bearer abc.def.ghi falha de validação CPF 52998224725',
    stage: 'bank_slip_post',
    externalReference: '979ED9478CCAFCE5B66C4B3FAD',
  });
  const conflict = describeC6BolepixV2Outcome({ status: 'FAILED', httpStatus: 409, chargeId: null, bankMessage: 'Referência já usada' });
  const server = describeC6BolepixV2Outcome({ status: 'UNKNOWN', httpStatus: 500 });
  const createdDiagnostic = captureC6BankDiagnostic({
    httpStatus: 201,
    contentType: 'application/json',
    bodyText: JSON.stringify({ id: '01HVSBSTN8CCTCTEQT6MC7TD4B', amount: 10 }),
    stage: 'bank_slip_post',
    externalReference: '979ED9478CCAFCE5B66C4B3FAD',
  });
  const lines = c6BankDiagnosticLines({
    httpStatus: detailed.httpStatus,
    code: detailed.code,
    message: detailed.message,
    field: detailed.fields.join(', '),
  });
  assert(detailed.code === 'INVALID_ADDRESS' && detailed.fields.join() === 'payer.address.zip_code', 'JSON detalhado guarda código e campo');
  assert(detailed.traceId === 'trace-400' && detailed.recordedAt === '2026-11-24T18:00:00.000Z', 'rastreio e horário ficam no diagnóstico');
  assert(detailed.contentType?.includes('json') && detailed.externalReference === '979ED9478CCAFCE5B66C4B3FAD', 'content-type e referência ficam no diagnóstico');
  assert(!JSON.stringify(detailed).includes('segredo-nao-pode-aparecer'), 'token fora dos campos previstos não entra no diagnóstico');
  assert(!JSON.stringify(detailed).includes('52998224725'), 'o diagnóstico não guarda CPF');
  assert(plain.message && !plain.message.includes('52998224725') && !/bearer/i.test(plain.message), 'texto simples é sanitizado');
  assert(conflict.kind === 'rejected' && conflict.message.includes('HTTP 409'), 'HTTP 409 é conflito da referência');
  assert(denied.kind === 'authentication' && forbidden.kind === 'authentication', 'HTTP 401 e 403 seguem como autorização');
  assert(server.kind === 'uncertain' && server.message.includes('HTTP 500'), 'HTTP 500 fica incerto');
  assert(createdDiagnostic.httpStatus === 201 && !createdDiagnostic.message, 'HTTP 201 sem mensagem de erro não inventa motivo');
  assert(lines[0] === 'C6 Bank — HTTP 400' && lines.some((line) => line.startsWith('Código:')) && lines.some((line) => line.startsWith('Campo:')), 'a interface recebe as linhas do banco');
  const payload = buildC6BolepixV2CreateBody({
    environment: 'PRODUCTION',
    externalReferenceId: '979ED9478CCAFCE5B66C4B3FAD',
    amount: 10,
    dueDate: '2026-11-26',
    description: 'Parcela 0',
    payer: {
      name: 'Pagador Teste',
      taxId: '52998224725',
      address: 'Rua A, 10',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01310100',
    },
    pixKey: '123e4567-e89b-12d3-a456-426614174000',
  }, new Date('2026-11-24T12:00:00-03:00'));
  const payment = payload.payment_method as { bank_slip: { billing_scheme: string }; pix: { type: string; key: string } };
  assert(payload.amount === 10 && payload.due_date === '2026-11-26', 'valor em reais e vencimento AAAA-MM-DD');
  assert(payment.bank_slip.billing_scheme === '15' && payment.pix.type === 'EVP', 'carteira 15 e Pix EVP');
  assert(!Object.prototype.hasOwnProperty.call(payload, 'origin'), 'o payload não inventa origin');

  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(path.join(root, 'lib/finance/companyFinancialAccountRepository.ts'), 'utf8');
  const resolver = fs.readFileSync(path.join(root, 'lib/banking/c6/c6ConfigRepository.ts'), 'utf8');
  assert(repository.includes("String(existing.provider || '').toUpperCase() === 'C6'"), 'salvar a conta não cria integração Asaas para o C6');
  assert(resolver.includes(".eq('bank_integration_id', integrationId)"), 'a leitura encontra a conta já vinculada');
  assert(!resolver.includes('emission_enabled\': true') && !repository.includes('emission_enabled'), 'o cadastro não ativa emissão');

  console.log('C6_FINANCIAL_ACCOUNT_LINK_OK');
}

void main();
