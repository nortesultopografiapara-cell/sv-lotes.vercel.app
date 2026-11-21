/**
 * Reconciliação da migration C6 com o índice já criado no Develop.
 * Simula a primeira execução e a reexecução sem banco e sem rede.
 * npx tsx scripts/mandatory-c6-migration-reconcile-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const DEVELOP_INDEX_DEF =
  "CREATE UNIQUE INDEX uq_bank_integrations_company_c6 ON public.bank_integrations USING btree (company_id) WHERE (provider = 'C6'::text)";

const PROVIDERS_BEFORE_C6 = [
  'SICOOB',
  'SICREDI',
  'BRADESCO',
  'BANCO_DO_BRASIL',
  'CAIXA',
  'MOCK',
  'ITAU',
  'SANTANDER',
  'ASAAS_COMPANY',
  'INTER',
] as const;

type Integration = { companyId: string; provider: string };
type CredentialPair = { integrationId: string; credentialType: string };

type Catalog = {
  providerCheck: string | null;
  bankProviderCheck: string | null;
  integrations: Integration[];
  credentials: CredentialPair[];
  indexDef: string | null;
  policies: string[];
  providerComment: string | null;
};

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20261121120000_bank_integrations_provider_c6.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

function unescapeSqlString(value: string): string {
  return value.replace(/''/g, "'");
}

function expectedIndexDefFromMigration(sql: string): string {
  const match = sql.match(/expected_index_def text := '((?:''|[^'])*)'/);
  assert(match, 'a migration declara a definição esperada do índice');
  return unescapeSqlString(match[1]);
}

function arrayCheck(column: string, providers: readonly string[]): string {
  const items = providers.map((provider) => `'${provider}'::text`).join(', ');
  return `CHECK ((${column} = ANY (ARRAY[${items}])))`;
}

function inCheck(column: string, providers: readonly string[], nullable: boolean): string {
  const items = providers.map((provider) => `'${provider}'`).join(', ');
  const expression = `${column} IN (${items})`;
  return nullable ? `CHECK ((${column} IS NULL OR ${expression}))` : `CHECK ((${expression}))`;
}

function acceptsC6(definition: string): boolean {
  return /'C6'/.test(definition);
}

function rewriteCheck(definition: string, label: string): string {
  if (acceptsC6(definition)) return definition;
  let expression = definition.replace(/^\s*CHECK\s*/, '');
  if (/ARRAY\[/.test(expression)) {
    expression = expression.replace(/ARRAY\[/, "ARRAY['C6'::text, ");
  } else if (/IN\s*\(/.test(expression)) {
    expression = expression.replace(/IN\s*\(/, "IN ('C6', ");
  } else {
    throw new Error(`Formato de ${label} não reconhecido. Nenhum constraint foi alterado.`);
  }
  return `CHECK ${expression}`;
}

function duplicateCompanies(integrations: Integration[]): number {
  const counts = new Map<string, number>();
  for (const integration of integrations) {
    if (integration.provider !== 'C6') continue;
    counts.set(integration.companyId, (counts.get(integration.companyId) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function duplicateCredentialPairs(credentials: CredentialPair[]): number {
  const counts = new Map<string, number>();
  for (const credential of credentials) {
    const key = `${credential.integrationId}\u0000${credential.credentialType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function applyInPlace(catalog: Catalog, notices: string[]): void {
  if (catalog.providerCheck === null || catalog.bankProviderCheck === null) {
    throw new Error('Check de provider ausente. Nenhum constraint foi alterado.');
  }

  const duplicates = duplicateCompanies(catalog.integrations);
  if (duplicates > 0) {
    throw new Error(
      `Há ${duplicates} empresa(s) com mais de uma integração C6. Nenhum registro foi apagado e o índice único não foi criado.`,
    );
  }

  if (acceptsC6(catalog.providerCheck)) {
    notices.push('bank_integrations_provider_check já aceita C6.');
  } else {
    catalog.providerCheck = rewriteCheck(catalog.providerCheck, 'bank_integrations_provider_check');
    catalog.providerComment =
      'Providers bancários já existentes, com C6 acrescentado. Emissão, webhook e liquidação permanecem desligados.';
  }

  if (acceptsC6(catalog.bankProviderCheck)) {
    notices.push('bank_integrations_bank_provider_check já aceita C6.');
  } else {
    catalog.bankProviderCheck = rewriteCheck(
      catalog.bankProviderCheck,
      'bank_integrations_bank_provider_check',
    );
  }

  if (catalog.indexDef === null) {
    catalog.indexDef = DEVELOP_INDEX_DEF;
  }

  if (catalog.indexDef !== DEVELOP_INDEX_DEF) {
    throw new Error(
      `O índice uq_bank_integrations_company_c6 não tem a definição aplicada no Develop. Nada foi mantido. Definição encontrada: ${catalog.indexDef}`,
    );
  }

  const credentialDuplicates = duplicateCredentialPairs(catalog.credentials);
  notices.push(
    `Pares duplicados de credencial por tipo: ${credentialDuplicates}. Nenhum registro foi apagado e nenhum índice global foi criado.`,
  );
}

function tryApply(catalog: Catalog): { catalog: Catalog; notices: string[] } {
  const copy = structuredClone(catalog);
  const notices: string[] = [];
  applyInPlace(copy, notices);
  return { catalog: copy, notices };
}

function snapshot(catalog: Catalog): string {
  return JSON.stringify(catalog);
}

function developCatalog(): Catalog {
  const providers = ['C6', ...PROVIDERS_BEFORE_C6];
  return {
    providerCheck: arrayCheck('provider', providers),
    bankProviderCheck: arrayCheck('bank_provider', providers).replace(
      'CHECK ((bank_provider',
      'CHECK ((bank_provider IS NULL OR bank_provider',
    ),
    integrations: [
      { companyId: 'empresa-sv', provider: 'C6' },
      { companyId: 'empresa-sv', provider: 'ASAAS_COMPANY' },
      { companyId: 'empresa-sv', provider: 'INTER' },
    ],
    credentials: [
      { integrationId: 'c6-sv', credentialType: 'oauth' },
      { integrationId: 'c6-sv', credentialType: 'certificate' },
      { integrationId: 'asaas-sv', credentialType: 'api_key' },
      { integrationId: 'inter-sv', credentialType: 'oauth' },
    ],
    indexDef: DEVELOP_INDEX_DEF,
    policies: ['bank_integrations_tenant', 'bank_credentials_tenant'],
    providerComment: 'Providers bancários; INTER adicionado na Fase A (config/credenciais, sem emissão).',
  };
}

function assertPreserved(before: Catalog, after: Catalog): void {
  assert(snapshot(before.integrations) === snapshot(after.integrations), 'integrações permanecem');
  assert(snapshot(before.credentials) === snapshot(after.credentials), 'credenciais permanecem');
  assert(snapshot(before.policies) === snapshot(after.policies), 'policies permanecem');
}

const expectedFromFile = expectedIndexDefFromMigration(migration);
assert(expectedFromFile === DEVELOP_INDEX_DEF, 'a definição do arquivo é a confirmada no Develop');
assert(
  migration.includes('O índice uq_bank_integrations_company_c6 foi aplicado manualmente'),
  'o arquivo documenta a aplicação manual no Develop',
);
assert(migration.includes('hoynysmynxncdlptuzub'), 'a documentação aponta o projeto Develop');
assert(migration.includes('Não cria tabela de histórico de migrations.'), 'não há tabela de histórico');
assert(
  migration.includes(
    "RAISE EXCEPTION 'Há % empresa(s) com mais de uma integração C6. Nenhum registro foi apagado e o índice único não foi criado.'",
  ),
  'C6 duplicado interrompe a execução',
);
assert(!migration.includes("RAISE NOTICE 'Há % empresa(s)"), 'duplicidade não termina só com aviso');
assert(migration.includes("ARRAY[''C6''::text,"), 'acrescenta C6 à lista que já existir');
assert(!migration.includes('SANTANDER'), 'não substitui a lista fechada de providers');
assert(!/CREATE\s+TABLE/i.test(migration), 'não cria tabela');
assert(!migration.includes('schema_migrations'), 'não cria versionamento de schema');
assert(!migration.includes('data_migration_history'), 'não usa o histórico de importação');
assert(!/CREATE\s+POLICY/i.test(migration), 'não cria policy');
assert(!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(migration), 'não altera RLS');
assert(!/DROP\s+INDEX/i.test(migration), 'não remove o índice existente');
assert(!/DELETE\s+FROM/i.test(migration), 'não apaga registros');
assert(!/\bUPDATE\s+/i.test(migration), 'não atualiza registros');
assert(!/\bINSERT\s+INTO/i.test(migration), 'não insere registros');
assert(!migration.includes('company_financial_accounts'), 'não altera contas financeiras');
assert(!migration.includes('finance_receipts'), 'não altera parcelas');
assert(!migration.includes('cash_movements'), 'não altera caixa');
assert(!migration.includes('encrypted_payload'), 'não lê credencial');
assert(!migration.includes('uq_bank_credentials_integration_type'), 'não cria índice global de credenciais');
assert(
  migration.indexOf("RAISE EXCEPTION 'Há % empresa(s) com mais de uma integração C6") <
    migration.lastIndexOf('CREATE UNIQUE INDEX uq_bank_integrations_company_c6'),
  'a duplicidade é recusada antes de criar o índice',
);

const recorded = developCatalog();
const rerun = tryApply(recorded);
assertPreserved(recorded, rerun.catalog);
assert(rerun.catalog.providerCheck === recorded.providerCheck, 'reexecução preserva o check de provider');
assert(
  rerun.catalog.bankProviderCheck === recorded.bankProviderCheck,
  'reexecução preserva o check de bank_provider',
);
assert(rerun.catalog.indexDef === DEVELOP_INDEX_DEF, 'reexecução mantém a definição confirmada');
assert(rerun.catalog.providerComment === recorded.providerComment, 'reexecução não troca o comentário já existente');
assert(
  rerun.notices.includes('bank_integrations_provider_check já aceita C6.'),
  'reexecução reconhece o check que já aceita C6',
);

const firstRunBase = developCatalog();
firstRunBase.indexDef = null;
const first = tryApply(firstRunBase);
assert(first.catalog.indexDef === DEVELOP_INDEX_DEF, 'primeira execução cria a definição confirmada');
assert(first.catalog.providerCheck === firstRunBase.providerCheck, 'primeira execução não reescreve check que já aceita C6');
assert(
  first.catalog.bankProviderCheck === firstRunBase.bankProviderCheck,
  'primeira execução não reescreve bank_provider que já aceita C6',
);
const second = tryApply(first.catalog);
assert(snapshot(second.catalog) === snapshot(first.catalog), 'a segunda execução repete o mesmo catálogo');

const withoutC6 = developCatalog();
withoutC6.indexDef = null;
withoutC6.providerCheck = arrayCheck('provider', PROVIDERS_BEFORE_C6);
withoutC6.bankProviderCheck = inCheck('bank_provider', PROVIDERS_BEFORE_C6, true);
withoutC6.providerComment = null;
const prepended = tryApply(withoutC6);
assert(prepended.catalog.providerCheck?.includes("'C6'::text"), 'a primeira execução em ARRAY acrescenta C6');
assert(prepended.catalog.providerCheck?.includes("'ASAAS_COMPANY'::text"), 'ASAAS_COMPANY permanece no check');
assert(prepended.catalog.providerCheck?.includes("'INTER'::text"), 'INTER permanece no check');
assert(prepended.catalog.providerCheck?.indexOf("'C6'") === prepended.catalog.providerCheck?.lastIndexOf("'C6'"), 'C6 entra uma vez');
assert(prepended.catalog.bankProviderCheck?.includes("IN ('C6',"), 'o check IN também recebe C6');
assert(prepended.catalog.bankProviderCheck?.includes("'INTER'"), 'INTER permanece no check IN');
assert(prepended.catalog.indexDef === DEVELOP_INDEX_DEF, 'o índice é criado depois de preservar os providers');
assert(
  prepended.catalog.providerComment?.includes('com C6 acrescentado'),
  'o comentário só muda quando o check é reescrito',
);
const prependedAgain = tryApply(prepended.catalog);
assert(prependedAgain.catalog.providerCheck === prepended.catalog.providerCheck, 'reexecução não acrescenta C6 de novo');
assert(prependedAgain.catalog.bankProviderCheck === prepended.catalog.bankProviderCheck, 'reexecução não reescreve o segundo check');

const duplicated = developCatalog();
duplicated.indexDef = null;
duplicated.integrations = [
  ...duplicated.integrations,
  { companyId: 'empresa-sv', provider: 'C6' },
];
const beforeDuplicate = snapshot(duplicated);
let duplicateError = '';
try {
  tryApply(duplicated);
} catch (error) {
  duplicateError = error instanceof Error ? error.message : String(error);
}
assert(duplicateError.includes('mais de uma integração C6'), 'duplicidade C6 interrompe');
assert(snapshot(duplicated) === beforeDuplicate, 'a falha por duplicidade não altera o catálogo');

const wrongIndex = developCatalog();
wrongIndex.indexDef =
  'CREATE INDEX uq_bank_integrations_company_c6 ON public.bank_integrations USING btree (company_id)';
const beforeWrongIndex = snapshot(wrongIndex);
let wrongIndexError = '';
try {
  tryApply(wrongIndex);
} catch (error) {
  wrongIndexError = error instanceof Error ? error.message : String(error);
}
assert(wrongIndexError.includes('não tem a definição aplicada no Develop'), 'índice divergente interrompe');
assert(snapshot(wrongIndex) === beforeWrongIndex, 'índice divergente não é substituído');

const missingCheck = developCatalog();
missingCheck.providerCheck = null;
const beforeMissing = snapshot(missingCheck);
let missingError = '';
try {
  tryApply(missingCheck);
} catch (error) {
  missingError = error instanceof Error ? error.message : String(error);
}
assert(missingError.includes('Check de provider ausente'), 'check ausente interrompe');
assert(snapshot(missingCheck) === beforeMissing, 'check ausente não altera o catálogo');

const unknownFormat = developCatalog();
unknownFormat.indexDef = null;
unknownFormat.providerCheck = 'CHECK ((length(provider) > 0))';
const beforeUnknown = snapshot(unknownFormat);
let unknownError = '';
try {
  tryApply(unknownFormat);
} catch (error) {
  unknownError = error instanceof Error ? error.message : String(error);
}
assert(unknownError.includes('não reconhecido'), 'formato desconhecido interrompe');
assert(snapshot(unknownFormat) === beforeUnknown, 'formato desconhecido não altera o catálogo');

const credentialDuplicates = developCatalog();
credentialDuplicates.credentials.push({ integrationId: 'asaas-sv', credentialType: 'api_key' });
const withCredentialNotice = tryApply(credentialDuplicates);
assert(
  withCredentialNotice.notices.some((notice) => notice.startsWith('Pares duplicados de credencial por tipo: 1.')),
  'credencial duplicada gera apenas aviso',
);
assert(withCredentialNotice.catalog.credentials.length === credentialDuplicates.credentials.length, 'credencial duplicada permanece');
assert(withCredentialNotice.catalog.indexDef === DEVELOP_INDEX_DEF, 'aviso de credencial não troca o índice C6');

console.log('C6_MIGRATION_RECONCILE_OK');
