import { REVENUE_SPLIT_DEFAULT_CURRENCY, RevenueSplitError } from './types';
import type {
  ChargeRevenueSplitLegDraft,
  FreezeSaleRevenueSplitResult,
  GetProjectRevenueSplitResult,
  ProjectRevenueSplitParticipantInput,
  RevenueSplitActor,
  SaleRevenueSplitSnapshot,
  SaleRevenueSplitSnapshotParticipant,
} from './types';
import type { RevenueSplitStore } from './store';
import { assertCanManageRevenueSplit } from './permissions';
import {
  isOperationalProjectRevenueSplit,
  validateProjectRevenueSplit,
  type RevenueSplitValidationContext,
  type RevenueSplitValidationMode,
} from './validation';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function buildValidationContext(
  store: RevenueSplitStore,
  companyId: string,
  projectId: string,
  participants: ProjectRevenueSplitParticipantInput[],
): Promise<RevenueSplitValidationContext> {
  const project = await store.getProject(projectId);
  const accountIds = participants
    .map((row) => String(row.financialAccountId || '').trim())
    .filter(Boolean);
  const userIds = participants.map((row) => String(row.userId || '').trim()).filter(Boolean);
  const usersById: RevenueSplitValidationContext['usersById'] = {};
  const accountsById: RevenueSplitValidationContext['accountsById'] = {};
  for (const userId of userIds) {
    usersById[userId] = (await store.getUser(userId)) || undefined;
  }
  for (const accountId of accountIds) {
    accountsById[accountId] = (await store.getFinancialAccount(accountId)) || undefined;
  }
  const destinations = await store.listDestinations(companyId, accountIds);
  return {
    companyId,
    projectId,
    projectCompanyId: project?.companyId || null,
    usersById,
    accountsById,
    destinations,
  };
}

function throwIfInvalid(
  result: ReturnType<typeof validateProjectRevenueSplit>,
): void {
  if (result.ok) return;
  const first = result.issues[0];
  throw new RevenueSplitError(first?.code || 'VALIDATION', first?.message || 'Configuração inválida.');
}

export function createRevenueSplitService(store: RevenueSplitStore) {
  async function getProjectRevenueSplit(
    projectId: string,
    companyId: string,
  ): Promise<GetProjectRevenueSplitResult> {
    const project = await store.getProject(projectId);
    if (!project) {
      throw new RevenueSplitError('PROJECT_NOT_FOUND', 'Empreendimento não encontrado.');
    }
    if (project.companyId !== companyId) {
      throw new RevenueSplitError('PROJECT_TENANT_MISMATCH', 'Empreendimento não pertence a esta empresa.');
    }
    const config = await store.getConfigByProject(projectId);
    if (!config || config.companyId !== companyId) {
      return { present: false, operational: false, config: null, participants: [] };
    }
    const participants = await store.getParticipants(config.id);
    return {
      present: true,
      operational: isOperationalProjectRevenueSplit(config),
      config,
      participants,
    };
  }

  async function saveProjectRevenueSplit(input: {
    actor: RevenueSplitActor;
    companyId: string;
    projectId: string;
    enabled: boolean;
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
    currency?: string;
    participants: ProjectRevenueSplitParticipantInput[];
  }) {
    assertCanManageRevenueSplit(input.actor, input.companyId);
    const project = await store.getProject(input.projectId);
    if (!project) {
      throw new RevenueSplitError('PROJECT_NOT_FOUND', 'Empreendimento não encontrado.');
    }
    if (project.companyId !== input.companyId) {
      throw new RevenueSplitError('PROJECT_TENANT_MISMATCH', 'Empreendimento não pertence a esta empresa.');
    }

    const mode: RevenueSplitValidationMode =
      input.enabled && input.status === 'ACTIVE' ? 'activate' : 'draft';
    const context = await buildValidationContext(
      store,
      input.companyId,
      input.projectId,
      input.participants,
    );
    throwIfInvalid(
      validateProjectRevenueSplit(
        {
          companyId: input.companyId,
          projectId: input.projectId,
          enabled: input.enabled,
          status: input.status,
        },
        input.participants,
        context,
        mode,
      ),
    );

    return store.saveConfig({
      companyId: input.companyId,
      projectId: input.projectId,
      enabled: input.enabled,
      status: input.status,
      currency: input.currency || REVENUE_SPLIT_DEFAULT_CURRENCY,
      participants: input.participants.map((row, index) => ({
        companyId: input.companyId,
        projectId: input.projectId,
        displayName: String(row.displayName || '').trim(),
        partyKind: row.partyKind,
        userId: row.userId ?? null,
        financialAccountId: row.financialAccountId ?? null,
        sharePercent: Number(row.sharePercent),
        isIssuerRemainder: Boolean(row.isIssuerRemainder),
        sortOrder: row.sortOrder ?? index,
        active: row.active !== false,
      })),
    });
  }

  async function freezeSaleRevenueSplit(input: {
    actor: RevenueSplitActor;
    companyId: string;
    saleId: string;
    provider?: string | null;
  }): Promise<FreezeSaleRevenueSplitResult> {
    assertCanManageRevenueSplit(input.actor, input.companyId);
    const sale = await store.getSale(input.saleId);
    if (!sale) {
      throw new RevenueSplitError('SALE_NOT_FOUND', 'Venda não encontrada.');
    }
    if (sale.companyId !== input.companyId) {
      throw new RevenueSplitError('SALE_TENANT_MISMATCH', 'Venda não pertence a esta empresa.');
    }

    const existing = await store.getSnapshotBySale(sale.id);
    if (existing) {
      if (existing.companyId !== input.companyId) {
        throw new RevenueSplitError('TENANT_MISMATCH', 'Snapshot não pertence a esta empresa.');
      }
      return {
        frozen: true,
        duplicated: true,
        reason: 'SNAPSHOT_ALREADY_EXISTS',
        snapshot: existing,
        participants: await store.getSnapshotParticipants(existing.id),
      };
    }

    const current = await getProjectRevenueSplit(sale.projectId, input.companyId);
    if (!current.operational || !current.config) {
      return {
        frozen: false,
        duplicated: false,
        reason: 'SPLIT_NOT_ENABLED',
        snapshot: null,
        participants: [],
      };
    }

    const context = await buildValidationContext(
      store,
      input.companyId,
      sale.projectId,
      current.participants,
    );
    throwIfInvalid(
      validateProjectRevenueSplit(current.config, current.participants, context, 'activate'),
    );

    const active = current.participants.filter((row) => row.active);
    const inserted = await store.insertSnapshot({
      snapshot: {
        companyId: input.companyId,
        projectId: sale.projectId,
        saleId: sale.id,
        sourceConfigId: current.config.id,
        provider: input.provider ?? null,
        currency: current.config.currency,
      },
      participants: active.map((row) => {
        const dest = context.destinations.find(
          (item) =>
            item.financialAccountId === row.financialAccountId &&
            item.companyId === input.companyId &&
            item.status === 'ACTIVE',
        );
        return {
          companyId: input.companyId,
          sourceParticipantId: row.id,
          displayName: row.displayName,
          partyKind: row.partyKind,
          userId: row.userId,
          financialAccountId: row.financialAccountId,
          destinationProvider: row.isIssuerRemainder ? null : dest?.provider || null,
          destinationType: row.isIssuerRemainder ? null : dest?.destinationType || null,
          destinationIdentifier: row.isIssuerRemainder ? null : dest?.destinationIdentifier || null,
          sharePercent: row.sharePercent,
          isIssuerRemainder: row.isIssuerRemainder,
          sortOrder: row.sortOrder,
        };
      }),
    });

    return {
      frozen: true,
      duplicated: false,
      reason: 'SNAPSHOT_CREATED',
      snapshot: inserted.snapshot,
      participants: inserted.participants,
    };
  }

  async function inspectProjectRevenueSplit(input: {
    companyId: string;
    projectId: string;
    enabled: boolean;
    status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
    participants: ProjectRevenueSplitParticipantInput[];
  }) {
    const mode: RevenueSplitValidationMode =
      input.enabled && input.status === 'ACTIVE' ? 'activate' : 'draft';
    const context = await buildValidationContext(
      store,
      input.companyId,
      input.projectId,
      input.participants,
    );
    return validateProjectRevenueSplit(
      {
        companyId: input.companyId,
        projectId: input.projectId,
        enabled: input.enabled,
        status: input.status,
      },
      input.participants,
      context,
      mode,
    );
  }

  async function getProjectRevenueSplitView(projectId: string, companyId: string) {
    const result = await getProjectRevenueSplit(projectId, companyId);
    const accountIds = [
      ...new Set(
        result.participants
          .map((row) => String(row.financialAccountId || '').trim())
          .filter(Boolean),
      ),
    ];
    const destinations = await store.listDestinations(companyId, accountIds);
    const activation = await inspectProjectRevenueSplit({
      companyId,
      projectId,
      enabled: true,
      status: 'ACTIVE',
      participants: result.participants,
    });
    return { ...result, destinations, activation };
  }

  async function upsertAsaasWalletDestination(input: {
    actor: RevenueSplitActor;
    companyId: string;
    financialAccountId: string;
    walletId: string;
  }) {
    assertCanManageRevenueSplit(input.actor, input.companyId);
    const identifier = String(input.walletId || '').trim();
    if (!identifier) {
      throw new RevenueSplitError('WALLET_REQUIRED', 'Informe o Wallet ID da conta Asaas.');
    }
    if (/api[_-]?key|secret|token|password|aact_/i.test(identifier)) {
      throw new RevenueSplitError(
        'WALLET_REJECTED',
        'Informe apenas o Wallet ID. Não envie API key, token ou senha.',
      );
    }
    const account = await store.getFinancialAccount(input.financialAccountId);
    if (!account) {
      throw new RevenueSplitError('FINANCIAL_ACCOUNT_NOT_FOUND', 'Conta financeira não encontrada.');
    }
    if (account.companyId !== input.companyId) {
      throw new RevenueSplitError(
        'FINANCIAL_ACCOUNT_TENANT_MISMATCH',
        'Não é permitido usar conta financeira de outra empresa.',
      );
    }
    return store.upsertDestination({
      companyId: input.companyId,
      financialAccountId: input.financialAccountId,
      provider: 'ASAAS_COMPANY',
      destinationType: 'WALLET_ID',
      destinationIdentifier: identifier,
      status: 'ACTIVE',
    });
  }

  async function listOwnerParticipations(input: {
    actor: RevenueSplitActor;
    companyId: string;
    userId: string;
  }) {
    assertCanManageRevenueSplit(input.actor, input.companyId);
    const user = await store.getUser(input.userId);
    if (!user || user.companyId !== input.companyId) {
      throw new RevenueSplitError('USER_TENANT_MISMATCH', 'Usuário não pertence a esta empresa.');
    }
    const participants = await store.listParticipationsByUser(input.companyId, input.userId);
    const destinations = await store.listDestinations(
      input.companyId,
      participants.map((row) => String(row.financialAccountId || '').trim()).filter(Boolean),
    );
    return { participants, destinations };
  }

  return {
    getProjectRevenueSplit,
    getProjectRevenueSplitView,
    inspectProjectRevenueSplit,
    saveProjectRevenueSplit,
    freezeSaleRevenueSplit,
    upsertAsaasWalletDestination,
    listOwnerParticipations,
  };
}

/**
 * Monta pernas locais a partir do snapshot. Não persiste e não chama gateway.
 */
export function planChargeRevenueSplitLegs(input: {
  snapshot: SaleRevenueSplitSnapshot;
  participants: SaleRevenueSplitSnapshotParticipant[];
  installmentId: string;
  chargeId?: string | null;
  provider: string;
  grossAmount?: number | null;
}): ChargeRevenueSplitLegDraft[] {
  const gross = input.grossAmount == null ? null : Number(input.grossAmount);
  return [...input.participants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({
      companyId: input.snapshot.companyId,
      saleId: input.snapshot.saleId,
      installmentId: input.installmentId,
      chargeId: input.chargeId ?? null,
      snapshotId: input.snapshot.id,
      snapshotParticipantId: row.id,
      provider: input.provider,
      providerSplitId: null,
      destinationType: row.destinationType,
      destinationIdentifier: row.destinationIdentifier,
      sharePercent: row.sharePercent,
      isIssuerRemainder: row.isIssuerRemainder,
      displayName: row.displayName,
      grossAmountEstimate:
        gross == null ? null : roundMoney((gross * Number(row.sharePercent)) / 100),
      netAmount: null,
      status: 'PENDING',
      failureReason: null,
    }));
}
