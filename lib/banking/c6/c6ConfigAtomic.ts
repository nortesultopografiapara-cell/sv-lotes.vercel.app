/**
 * Simulação local da RPC save_company_c6_bank_config.
 * O servidor real chama somente a função no Postgres.
 * Este módulo existe para os testes, porque a migration não é executada aqui.
 */

export const SAVE_COMPANY_C6_BANK_CONFIG_RPC = 'save_company_c6_bank_config';

export type C6AtomicFault = 'integration' | 'credential' | 'link';

export type C6AtomicTables = {
  bank_integrations: Array<Record<string, unknown>>;
  bank_credentials: Array<Record<string, unknown>>;
  company_financial_accounts: Array<Record<string, unknown>>;
};

export type C6AtomicArgs = {
  p_company_id?: string | null;
  p_environment?: string | null;
  p_client_id?: string | null;
  p_certificate_name?: string | null;
  p_boleto?: boolean | null;
  p_bolepix?: boolean | null;
  p_oauth_payload?: string | null;
  p_certificate_payload?: string | null;
  p_financial_account_id?: string | null;
};

const tails = new Map<string, Promise<void>>();

export function withC6CompanyLock<T>(companyId: string, fn: () => T): Promise<T> {
  const previous = tails.get(companyId) ?? Promise.resolve();
  const run = previous.then(() => fn());
  tails.set(
    companyId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function isProvenSafeC6State(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || row.status !== 'DRAFT' || row.active !== false || row.is_default !== false) return false;
  const metadata = row.metadata;
  if (metadata == null) return true;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const box = (metadata as { c6?: unknown }).c6;
  if (box == null) return true;
  if (typeof box !== 'object' || Array.isArray(box)) return false;
  const flags = box as Record<string, unknown>;
  return ['emission_enabled', 'webhook_enabled', 'settlement_enabled'].every(
    (key) => flags[key] == null || flags[key] === false,
  );
}

function readIntent(metadata: unknown, key: 'boleto' | 'bolepix'): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const box = (metadata as { c6?: unknown }).c6;
  if (!box || typeof box !== 'object' || Array.isArray(box)) return false;
  return (box as Record<string, unknown>)[key] === true;
}

function nextMetadata(existing: unknown, boleto: boolean, bolepix: boolean): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const previous =
    base.c6 && typeof base.c6 === 'object' && !Array.isArray(base.c6)
      ? { ...(base.c6 as Record<string, unknown>) }
      : {};
  return {
    ...base,
    c6: {
      ...previous,
      boleto,
      bolepix,
      emission_enabled: false,
      webhook_enabled: false,
      settlement_enabled: false,
    },
  };
}

export function applySaveCompanyC6BankConfig(
  tables: C6AtomicTables,
  args: C6AtomicArgs,
  fault?: C6AtomicFault,
): { unchanged: boolean; id: string } {
  const draft = structuredClone(tables);
  const companyId = String(args.p_company_id || '');
  if (!companyId) throw new Error('Empresa não identificada.');
  const environment = String(args.p_environment || '');
  if (environment !== 'SANDBOX' && environment !== 'PRODUCTION') {
    throw new Error('Ambiente inválido.');
  }
  const oauth = args.p_oauth_payload ? String(args.p_oauth_payload) : null;
  const certificate = args.p_certificate_payload ? String(args.p_certificate_payload) : null;
  if (oauth && !oauth.startsWith('v1:')) throw new Error('Credencial OAuth recusada.');
  if (certificate && !certificate.startsWith('v1:')) throw new Error('Credencial de certificado recusada.');

  const matches = draft.bank_integrations.filter(
    (row) => row.company_id === companyId && row.provider === 'C6',
  );
  let integration = matches[0] ? { ...matches[0] } : null;
  if (integration?.id) {
    const integrationId = String(integration.id);
    for (const credentialType of ['oauth', 'certificate'] as const) {
      const count = draft.bank_credentials.filter(
        (row) =>
          row.integration_id === integrationId &&
          row.company_id === companyId &&
          row.credential_type === credentialType,
      ).length;
      if (count > 1) {
        throw new Error(
          credentialType === 'oauth'
            ? 'Credencial OAuth duplicada nesta integração C6.'
            : 'Credencial de certificado duplicada nesta integração C6.',
        );
      }
    }
  }
  const financialAccountId = args.p_financial_account_id ? String(args.p_financial_account_id) : null;
  let account: Record<string, unknown> | null = null;
  if (financialAccountId) {
    account =
      draft.company_financial_accounts.find(
        (row) => row.id === financialAccountId && row.company_id === companyId,
      ) || null;
    if (!account) throw new Error('Conta financeira não encontrada nesta empresa.');
    const linked = account.bank_integration_id ? String(account.bank_integration_id) : '';
    if (linked && (!integration || linked !== String(integration.id))) {
      const provider = String(
        draft.bank_integrations.find((row) => row.id === linked && row.company_id === companyId)?.provider || '',
      ).toUpperCase();
      if (provider === 'ASAAS_COMPANY' || provider === 'ASAAS') {
        throw new Error('Esta conta já está vinculada ao Asaas.');
      }
      if (provider === 'INTER') throw new Error('Esta conta já está vinculada ao Banco Inter.');
      if (provider && provider !== 'C6') throw new Error('Esta conta já está vinculada a outro provedor.');
      if (provider === 'C6') throw new Error('Esta conta já está vinculada a outra integração C6.');
      throw new Error('Conta financeira não encontrada nesta empresa.');
    }
  }

  const boleto = readIntent(integration?.metadata, 'boleto');
  const bolepix = readIntent(integration?.metadata, 'bolepix');
  const clientId = args.p_client_id == null ? '' : String(args.p_client_id);
  const certificateName = args.p_certificate_name == null ? '' : String(args.p_certificate_name);
  const sameLink =
    !financialAccountId ||
    String(account?.bank_integration_id || '') === String(integration?.id || '');
  if (
    integration &&
    !oauth &&
    !certificate &&
    environment === String(integration.environment || '') &&
    clientId === String(integration.client_id || '') &&
    certificateName === String(integration.certificate_name || '') &&
    (args.p_boleto === true) === boleto &&
    (args.p_bolepix === true) === bolepix &&
    sameLink &&
    isProvenSafeC6State(integration)
  ) {
    return { unchanged: true, id: String(integration.id) };
  }

  if (fault === 'integration') throw new Error('falha simulada de gravacao');

  const metadata = nextMetadata(integration?.metadata, args.p_boleto === true, args.p_bolepix === true);
  if (!integration) {
    if (!clientId || !oauth || !certificate) {
      throw new Error('A primeira configuração C6 exige Client ID, segredo e certificado.');
    }
    integration = {
      id: `c6-${draft.bank_integrations.length + 1}`,
      company_id: companyId,
      provider: 'C6',
      bank_provider: 'C6',
      environment,
      status: 'DRAFT',
      client_id: clientId,
      certificate_name: certificateName || null,
      is_default: false,
      active: false,
      metadata,
      configured_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    draft.bank_integrations.push(integration);
  } else {
    const index = draft.bank_integrations.findIndex(
      (row) => row.id === integration?.id && row.company_id === companyId && row.provider === 'C6',
    );
    if (index < 0) throw new Error('Integração C6 não encontrada nesta empresa.');
    const current = draft.bank_integrations[index];
    draft.bank_integrations[index] = {
      ...current,
      environment,
      status: 'DRAFT',
      active: false,
      is_default: false,
      client_id: clientId || current.client_id,
      certificate_name: certificateName || null,
      metadata,
      configured_at: current.configured_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    integration = draft.bank_integrations[index];
  }

  if (fault === 'credential') throw new Error('falha simulada de gravacao');

  const upsert = (credentialType: 'oauth' | 'certificate', payload: string) => {
    const rows = draft.bank_credentials.filter(
      (row) =>
        row.integration_id === integration?.id &&
        row.company_id === companyId &&
        row.credential_type === credentialType,
    );
    if (rows.length > 1) {
      throw new Error(
        credentialType === 'oauth'
          ? 'Não foi possível gravar a credencial OAuth.'
          : 'Não foi possível gravar a credencial de certificado.',
      );
    }
    if (rows.length === 1) {
      rows[0].encrypted_payload = payload;
      rows[0].updated_at = new Date().toISOString();
      return;
    }
    draft.bank_credentials.push({
      id: `cred-${draft.bank_credentials.length + 1}`,
      integration_id: integration?.id,
      company_id: companyId,
      credential_type: credentialType,
      encrypted_payload: payload,
      updated_at: new Date().toISOString(),
    });
  };
  if (oauth) upsert('oauth', oauth);
  if (certificate) upsert('certificate', certificate);

  if (fault === 'link') throw new Error('falha simulada de gravacao');

  const owned = draft.company_financial_accounts.find(
    (row) =>
      row.company_id === companyId &&
      integration?.id &&
      String(row.bank_integration_id || '') === String(integration.id),
  );
  if (!owned && financialAccountId && account && !account.bank_integration_id) {
    const target = draft.company_financial_accounts.find(
      (row) => row.id === financialAccountId && row.company_id === companyId && !row.bank_integration_id,
    );
    if (!target) throw new Error('Não foi possível vincular a conta financeira.');
    target.bank_integration_id = integration?.id;
    target.updated_at = new Date().toISOString();
  }

  tables.bank_integrations = draft.bank_integrations;
  tables.bank_credentials = draft.bank_credentials;
  tables.company_financial_accounts = draft.company_financial_accounts;
  return { unchanged: false, id: String(integration?.id || '') };
}

export function bindC6AtomicRpc<T extends { tables: C6AtomicTables }>(
  target: T,
  options?: { fault?: C6AtomicFault; missing?: boolean },
): T & { rpc: (name: string, args: C6AtomicArgs) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>; rpcCalls: number } {
  const state = { rpcCalls: 0 };
  const rpc = async (name: string, args: C6AtomicArgs) => {
    state.rpcCalls += 1;
    (target as unknown as { rpcCalls: number }).rpcCalls = state.rpcCalls;
    if (options?.missing || name !== SAVE_COMPANY_C6_BANK_CONFIG_RPC) {
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.save_company_c6_bank_config in the schema cache',
        },
      };
    }
    try {
      const data = await withC6CompanyLock(String(args.p_company_id || ''), () =>
        applySaveCompanyC6BankConfig(target.tables, args, options?.fault),
      );
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: { code: 'P0001', message: error instanceof Error ? error.message : 'erro' },
      };
    }
  };
  return Object.assign(target, { rpc, rpcCalls: 0 });
}
