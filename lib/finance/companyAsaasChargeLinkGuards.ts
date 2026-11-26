/**
 * Proteções de vínculo Asaas Company — status sync e geração.
 * Sem migration: ENVIRONMENT_MISMATCH vive em erro tipado + raw_payload.
 */

import type { CompanyAsaasChargeResponse, CompanyAsaasChargeStatus } from '@/lib/finance/companyAsaasChargeTypes';
import { isFinancialAccountRequiredError } from '@/lib/finance/financialAccountRequired';

export class CompanyAsaasEnvironmentMismatchError extends Error {
  readonly code = 'ENVIRONMENT_MISMATCH' as const;
  readonly asaasPaymentId: string;
  readonly chargeId: string;

  constructor(message: string, opts: { asaasPaymentId: string; chargeId: string }) {
    super(message);
    this.name = 'CompanyAsaasEnvironmentMismatchError';
    this.asaasPaymentId = opts.asaasPaymentId;
    this.chargeId = opts.chargeId;
  }
}

export function isAsaasNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('não encontrad') ||
    lower.includes('nao encontrad')
  );
}

/** Nunca rebaixa PAID → outro status a partir de sync remoto. */
export function resolveSafeSyncedChargeStatus(params: {
  localStatus: CompanyAsaasChargeStatus;
  remoteMappedStatus: CompanyAsaasChargeStatus;
}): CompanyAsaasChargeStatus {
  if (params.localStatus === 'PAID') return 'PAID';
  return params.remoteMappedStatus;
}

export function shouldPreserveLocalPaidAt(params: {
  localStatus: CompanyAsaasChargeStatus;
  nextStatus: CompanyAsaasChargeStatus;
  localPaidAt: string | null | undefined;
  remotePaidAt: string | null | undefined;
}): string | null {
  if (params.nextStatus === 'PAID') {
    return params.remotePaidAt || params.localPaidAt || new Date().toISOString();
  }
  if (params.localStatus === 'PAID') {
    return params.localPaidAt ?? null;
  }
  return params.localPaidAt ?? null;
}

/** Gerar cobrança só quando não há vínculo ativo/pago/não resolvido. */
export function canGenerateAsaasChargeWithHistory(params: {
  installmentPaid: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  charge: CompanyAsaasChargeResponse | null | undefined;
  hasPaidChargeHistory?: boolean;
  hasUnresolvedChargeLink?: boolean;
  installmentsDataReady?: boolean;
  installmentId?: string;
}): boolean {
  if (params.installmentsDataReady === false) return false;
  if (params.installmentId !== undefined && !String(params.installmentId).trim()) return false;
  if (!params.companyAsaasEnabled || !params.integrationActive || params.ownerReadOnly) {
    return false;
  }
  if (params.installmentPaid) return false;
  if (params.hasPaidChargeHistory) return false;
  if (params.hasUnresolvedChargeLink) return false;
  if (params.charge) {
    if (params.charge.status === 'PAID') return false;
    if (params.charge.status === 'PENDING' || params.charge.status === 'REGISTERED' || params.charge.status === 'OVERDUE') {
      return false;
    }
    // CANCELLED / EXPIRED / FAILED → regeneração, não "gerar nova" sem fluxo explícito
    return false;
  }
  return true;
}

export type RefreshAllChargesBlockReason =
  | 'loading'
  | 'busy'
  | 'owner_readonly'
  | 'integration_unavailable'
  | 'not_ready'
  | 'access_denied'
  | 'module_disabled'
  | 'query_error'
  | 'no_active_charges'
  | 'environment_mismatch'
  | 'inconsistent_links'
  | null;

/**
 * Resultado de GET /api/finance/asaas/integration.
 * 404 vem de assertBankingModuleEnabled: BANKING_MODULE_ENABLED não é "true".
 * A rota responde "Not found" para não expor o módulo. Não é integração ausente
 * nem empresa fora da allowlist (isso é 403).
 */
export type ChargesAsaasIntegrationGate =
  | 'pending'
  | 'ready'
  | 'not_ready'
  | 'denied'
  | 'module_disabled'
  | 'multiple_accounts'
  | 'query_error';

export function classifyAsaasIntegrationResponse(
  status: number,
  ready: boolean,
  errorMessage?: string | null,
): ChargesAsaasIntegrationGate {
  if (isFinancialAccountRequiredError(errorMessage)) return 'multiple_accounts';
  if (status === 404) return 'module_disabled';
  if (status === 403) return 'denied';
  if (status < 200 || status >= 300) return 'query_error';
  return ready ? 'ready' : 'not_ready';
}

/** A consulta geral não escolhe conta quando há várias. O lote usa a conta de cada cobrança. */
export function overviewGateAllowsPerChargeAsaasSync(
  gate: ChargesAsaasIntegrationGate,
): boolean {
  return gate === 'ready' || gate === 'multiple_accounts';
}

export type AsaasRowAccountState = 'none' | 'unknown' | 'active' | 'inactive';

export type AsaasRowActionNotice = {
  code: 'missing_account' | 'inactive_account' | 'installment_status' | 'integration_inactive';
  label: string;
  title: string;
  /** Cobrança já emitida mantém links e ações de leitura. O aviso só substitui a célula quando ainda não há cobrança. */
  replacesActions: boolean;
};

export function resolveAsaasRowAccountState(params: {
  accountId: string | null | undefined;
  accountActive: boolean | null | undefined;
  accountsLoaded: boolean;
}): AsaasRowAccountState {
  const id = String(params.accountId || '').trim();
  if (!id) return 'none';
  if (!params.accountsLoaded) return 'unknown';
  if (params.accountActive === true) return 'active';
  if (params.accountActive === false) return 'inactive';
  return 'none';
}

/**
 * A mensagem "Integração inativa" vale só quando a integração da empresa está de fato inativa.
 * Várias contas ativas não são integração inativa: a linha usa a conta vinculada.
 */
export function resolveAsaasRowActionNotice(params: {
  gate: ChargesAsaasIntegrationGate;
  issued: boolean;
  installmentPaid: boolean;
  accountState: AsaasRowAccountState;
}): AsaasRowActionNotice | null {
  if (params.issued) {
    if (params.accountState === 'none') {
      return {
        code: 'missing_account',
        label: 'Conta ausente',
        title: 'Cobrança sem conta financeira vinculada.',
        replacesActions: false,
      };
    }
    if (params.accountState === 'inactive') {
      return {
        code: 'inactive_account',
        label: 'Conta inativa',
        title: 'A conta vinculada a esta cobrança está inativa.',
        replacesActions: false,
      };
    }
    return null;
  }

  if (params.installmentPaid) {
    return {
      code: 'installment_status',
      label: 'Parcela paga',
      title: 'Ação indisponível para parcela paga.',
      replacesActions: true,
    };
  }
  if (params.accountState === 'none') {
    return {
      code: 'missing_account',
      label: 'Conta ausente',
      title: 'A parcela não tem conta financeira para emitir a cobrança.',
      replacesActions: true,
    };
  }
  if (params.accountState === 'inactive') {
    return {
      code: 'inactive_account',
      label: 'Conta inativa',
      title: 'A conta financeira desta parcela está inativa.',
      replacesActions: true,
    };
  }
  if (
    params.accountState === 'unknown' ||
    params.gate === 'pending' ||
    params.gate === 'ready' ||
    params.gate === 'multiple_accounts'
  ) {
    return null;
  }
  return {
    code: 'integration_inactive',
    label: 'Integração inativa',
    title: 'Integração Asaas não está ativa.',
    replacesActions: true,
  };
}

export function asaasRowMayUseLinkedAccount(params: {
  gate: ChargesAsaasIntegrationGate;
  accountState: AsaasRowAccountState;
}): boolean {
  if (params.accountState !== 'active') return false;
  return params.gate === 'ready' || params.gate === 'multiple_accounts';
}

export function formatChargesAsaasIntegrationGate(
  gate: ChargesAsaasIntegrationGate,
): string | null {
  switch (gate) {
    case 'pending':
      return 'Carregando cobranças…';
    case 'ready':
      return null;
    case 'not_ready':
      return 'Integração Asaas não está ativa.';
    case 'denied':
      return 'Integração Asaas não disponível para esta empresa.';
    case 'module_disabled':
      return 'Módulo bancário desativado neste ambiente.';
    case 'multiple_accounts':
      return 'Há mais de uma conta Asaas ativa. Cada cobrança é atualizada pela conta já vinculada.';
    case 'query_error':
      return 'Não foi possível consultar a integração Asaas.';
    default:
      return null;
  }
}

export function resolveRefreshAllChargesBlockReason(params: {
  loading: boolean;
  bulkBusy: boolean;
  ownerReadOnly: boolean;
  integrationReady: boolean;
  visibleChargeCount: number;
  hasEnvironmentMismatch?: boolean;
  hasInconsistentLinks?: boolean;
}): RefreshAllChargesBlockReason {
  if (params.ownerReadOnly) return 'owner_readonly';
  if (!params.integrationReady) return 'integration_unavailable';
  if (params.loading) return 'loading';
  if (params.bulkBusy) return 'busy';
  if (params.hasEnvironmentMismatch) return 'environment_mismatch';
  if (params.hasInconsistentLinks) return 'inconsistent_links';
  if (params.visibleChargeCount <= 0) return 'no_active_charges';
  return null;
}

export function formatRefreshAllChargesBlockReason(
  reason: RefreshAllChargesBlockReason,
): string | null {
  switch (reason) {
    case 'loading':
      return 'Carregando cobranças…';
    case 'busy':
      return 'Atualização em andamento…';
    case 'owner_readonly':
      return 'Perfil somente leitura — atualização indisponível.';
    case 'integration_unavailable':
      return 'Integração Asaas indisponível.';
    case 'not_ready':
      return 'Integração Asaas não está ativa.';
    case 'access_denied':
      return 'Integração Asaas não disponível para esta empresa.';
    case 'module_disabled':
      return 'Módulo bancário desativado neste ambiente.';
    case 'query_error':
      return 'Não foi possível consultar a integração Asaas.';
    case 'no_active_charges':
      return 'Nenhuma cobrança ativa para atualizar.';
    case 'environment_mismatch':
      return 'Existem cobranças de outro ambiente.';
    case 'inconsistent_links':
      return 'Cobranças com vínculo inconsistente.';
    default:
      return null;
  }
}

/**
 * A abertura da lista compacta mostra parcelas antes da integração responder.
 * Enquanto a consulta não termina, o aviso é de espera. "Indisponível" fica
 * para o resultado real da consulta.
 */
export function resolveChargesRefreshAllPresentation(params: {
  ownerReadOnly: boolean;
  integrationReady: boolean;
  gate: ChargesAsaasIntegrationGate;
  hasVisibleInterCharges: boolean;
  hasAsaasRows: boolean;
  integrationLoading: boolean;
}): { showButton: boolean; notice: string | null } {
  if (params.ownerReadOnly) return { showButton: false, notice: null };
  const showButton =
    params.integrationReady ||
    overviewGateAllowsPerChargeAsaasSync(params.gate) ||
    params.hasVisibleInterCharges;
  if (showButton) return { showButton: true, notice: null };
  if (!params.hasAsaasRows) return { showButton: false, notice: null };
  if (params.integrationLoading || params.gate === 'pending') {
    return { showButton: false, notice: 'Carregando integração Asaas…' };
  }
  return {
    showButton: false,
    notice:
      formatChargesAsaasIntegrationGate(params.gate) ||
      formatRefreshAllChargesBlockReason('integration_unavailable'),
  };
}

/** O cartão não pode anunciar zero enquanto a leitura local ainda não terminou. */
export function resolveIssuedChargesCardSubtitle(params: {
  chargeStatusReady: boolean;
  readError: string | null;
  activeCount: number;
}): string {
  const readError = String(params.readError || '').trim();
  if (readError) return readError;
  if (!params.chargeStatusReady) return 'Consultando cobranças locais…';
  const count = Number.isFinite(params.activeCount) ? Math.max(0, Math.trunc(params.activeCount)) : 0;
  return `${count} cobrança(s) ativa(s)`;
}

/**
 * "Dados indisponíveis" é falha da leitura de parcelas.
 * O prefixo progressivo já mostra linhas e não é essa falha.
 */
export function chargesRowActionsReady(params: {
  totalsReady: boolean;
  loadError: string | null;
  rowCount: number;
}): boolean {
  if (String(params.loadError || '').trim()) return false;
  return params.totalsReady || params.rowCount > 0;
}

/**
 * Abertura direta e Ctrl+F5 usam a mesma condição.
 * Sem sessão, ou com sessão ainda sem empresa, a leitura não começa.
 * Quando a empresa passa a existir, a mesma condição libera a abertura.
 */
export function shouldStartChargesOpenRead(params: {
  authLoading: boolean;
  userId: string | null;
  companyId: string | null;
  platformAdmin: boolean;
}): boolean {
  if (params.authLoading) return false;
  if (!String(params.userId || '').trim()) return false;
  if (params.platformAdmin) return true;
  return Boolean(String(params.companyId || '').trim());
}
