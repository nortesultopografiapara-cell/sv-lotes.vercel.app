import { REVENUE_SPLIT_DEFAULT_CURRENCY } from './types';
import type {
  ChargeRevenueSplitLeg,
  ChargeRevenueSplitLegDraft,
  ChargeRevenueSplitLegPatch,
  FinancialAccountProviderDestination,
  ProjectRevenueSplitConfig,
  ProjectRevenueSplitParticipant,
  RevenueSplitFinancialAccountRecord,
  RevenueSplitProjectRecord,
  RevenueSplitSaleRecord,
  RevenueSplitUserRecord,
  SaleRevenueSplitSnapshot,
  SaleRevenueSplitSnapshotParticipant,
} from './types';
import type { RevenueSplitStore, SaveProjectRevenueSplitInput } from './store';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

export class MemoryRevenueSplitStore implements RevenueSplitStore {
  projects = new Map<string, RevenueSplitProjectRecord>();
  sales = new Map<string, RevenueSplitSaleRecord>();
  users = new Map<string, RevenueSplitUserRecord>();
  accounts = new Map<string, RevenueSplitFinancialAccountRecord>();
  destinations: FinancialAccountProviderDestination[] = [];
  configs = new Map<string, ProjectRevenueSplitConfig>();
  participants = new Map<string, ProjectRevenueSplitParticipant[]>();
  snapshotsBySale = new Map<string, SaleRevenueSplitSnapshot>();
  snapshotParticipants = new Map<string, SaleRevenueSplitSnapshotParticipant[]>();
  legs: ChargeRevenueSplitLeg[] = [];

  seedProject(row: RevenueSplitProjectRecord): void {
    this.projects.set(row.id, row);
  }

  seedSale(row: RevenueSplitSaleRecord): void {
    this.sales.set(row.id, row);
  }

  seedUser(row: RevenueSplitUserRecord): void {
    this.users.set(row.id, row);
  }

  seedAccount(row: RevenueSplitFinancialAccountRecord): void {
    this.accounts.set(row.id, row);
  }

  seedDestination(row: FinancialAccountProviderDestination): void {
    this.destinations.push(row);
  }

  async getProject(projectId: string): Promise<RevenueSplitProjectRecord | null> {
    return this.projects.get(projectId) || null;
  }

  async getSale(saleId: string): Promise<RevenueSplitSaleRecord | null> {
    return this.sales.get(saleId) || null;
  }

  async getUser(userId: string): Promise<RevenueSplitUserRecord | null> {
    return this.users.get(userId) || null;
  }

  async getFinancialAccount(accountId: string): Promise<RevenueSplitFinancialAccountRecord | null> {
    return this.accounts.get(accountId) || null;
  }

  async getConfigByProject(projectId: string): Promise<ProjectRevenueSplitConfig | null> {
    return [...this.configs.values()].find((row) => row.projectId === projectId) || null;
  }

  async getParticipants(configId: string): Promise<ProjectRevenueSplitParticipant[]> {
    return [...(this.participants.get(configId) || [])];
  }

  async listDestinations(
    companyId: string,
    financialAccountIds: string[],
  ): Promise<FinancialAccountProviderDestination[]> {
    const ids = new Set(financialAccountIds);
    return this.destinations.filter(
      (row) => row.companyId === companyId && ids.has(row.financialAccountId),
    );
  }

  async saveConfig(input: SaveProjectRevenueSplitInput): Promise<{
    config: ProjectRevenueSplitConfig;
    participants: ProjectRevenueSplitParticipant[];
  }> {
    const existing = await this.getConfigByProject(input.projectId);
    const timestamp = nowIso();
    const config: ProjectRevenueSplitConfig = {
      id: existing?.id || newId(),
      companyId: input.companyId,
      projectId: input.projectId,
      enabled: input.enabled,
      status: input.status,
      currency: input.currency || existing?.currency || REVENUE_SPLIT_DEFAULT_CURRENCY,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    this.configs.set(config.id, config);

    const participants: ProjectRevenueSplitParticipant[] = input.participants.map((row, index) => ({
      id: row.id || newId(),
      configId: config.id,
      companyId: input.companyId,
      projectId: input.projectId,
      displayName: row.displayName,
      partyKind: row.partyKind,
      userId: row.userId ?? null,
      financialAccountId: row.financialAccountId ?? null,
      sharePercent: row.sharePercent,
      isIssuerRemainder: Boolean(row.isIssuerRemainder),
      sortOrder: row.sortOrder ?? index,
      active: row.active !== false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    this.participants.set(config.id, participants);
    return { config, participants };
  }

  async getSnapshotBySale(saleId: string): Promise<SaleRevenueSplitSnapshot | null> {
    return this.snapshotsBySale.get(saleId) || null;
  }

  async getSnapshotParticipants(snapshotId: string): Promise<SaleRevenueSplitSnapshotParticipant[]> {
    return [...(this.snapshotParticipants.get(snapshotId) || [])];
  }

  async insertSnapshot(input: {
    snapshot: Omit<SaleRevenueSplitSnapshot, 'id' | 'createdAt' | 'frozenAt'> & {
      id?: string;
      frozenAt?: string;
      createdAt?: string;
    };
    participants: Array<
      Omit<SaleRevenueSplitSnapshotParticipant, 'id' | 'snapshotId' | 'createdAt'> & {
        id?: string;
      }
    >;
  }): Promise<{
    snapshot: SaleRevenueSplitSnapshot;
    participants: SaleRevenueSplitSnapshotParticipant[];
  }> {
    const existing = this.snapshotsBySale.get(input.snapshot.saleId);
    if (existing) {
      return {
        snapshot: existing,
        participants: await this.getSnapshotParticipants(existing.id),
      };
    }
    const timestamp = nowIso();
    const snapshot: SaleRevenueSplitSnapshot = {
      id: input.snapshot.id || newId(),
      companyId: input.snapshot.companyId,
      projectId: input.snapshot.projectId,
      saleId: input.snapshot.saleId,
      sourceConfigId: input.snapshot.sourceConfigId,
      provider: input.snapshot.provider,
      currency: input.snapshot.currency || REVENUE_SPLIT_DEFAULT_CURRENCY,
      frozenAt: input.snapshot.frozenAt || timestamp,
      createdAt: input.snapshot.createdAt || timestamp,
    };
    const participants: SaleRevenueSplitSnapshotParticipant[] = input.participants.map((row, index) => ({
      id: row.id || newId(),
      snapshotId: snapshot.id,
      companyId: snapshot.companyId,
      sourceParticipantId: row.sourceParticipantId,
      displayName: row.displayName,
      partyKind: row.partyKind,
      userId: row.userId,
      financialAccountId: row.financialAccountId,
      destinationProvider: row.destinationProvider,
      destinationType: row.destinationType,
      destinationIdentifier: row.destinationIdentifier,
      sharePercent: row.sharePercent,
      isIssuerRemainder: row.isIssuerRemainder,
      sortOrder: row.sortOrder ?? index,
      createdAt: timestamp,
    }));
    this.snapshotsBySale.set(snapshot.saleId, snapshot);
    this.snapshotParticipants.set(snapshot.id, participants);
    return { snapshot, participants };
  }

  async upsertDestination(input: {
    companyId: string;
    financialAccountId: string;
    provider: string;
    destinationType: FinancialAccountProviderDestination['destinationType'];
    destinationIdentifier: string;
    status?: FinancialAccountProviderDestination['status'];
  }): Promise<FinancialAccountProviderDestination> {
    const timestamp = nowIso();
    const existingIndex = this.destinations.findIndex(
      (row) =>
        row.financialAccountId === input.financialAccountId &&
        row.provider === input.provider &&
        row.destinationType === input.destinationType,
    );
    const next: FinancialAccountProviderDestination = {
      id: existingIndex >= 0 ? this.destinations[existingIndex].id : newId(),
      companyId: input.companyId,
      financialAccountId: input.financialAccountId,
      provider: input.provider,
      destinationType: input.destinationType,
      destinationIdentifier: String(input.destinationIdentifier || '').trim(),
      status: input.status || 'ACTIVE',
      createdAt: existingIndex >= 0 ? this.destinations[existingIndex].createdAt : timestamp,
      updatedAt: timestamp,
    };
    if (existingIndex >= 0) this.destinations[existingIndex] = next;
    else this.destinations.push(next);
    return next;
  }

  async listParticipationsByUser(
    companyId: string,
    userId: string,
  ): Promise<ProjectRevenueSplitParticipant[]> {
    const out: ProjectRevenueSplitParticipant[] = [];
    for (const rows of this.participants.values()) {
      for (const row of rows) {
        if (row.companyId === companyId && row.userId === userId && row.active) out.push(row);
      }
    }
    return out;
  }

  private hydrateLeg(leg: ChargeRevenueSplitLeg): ChargeRevenueSplitLeg {
    const participants = this.snapshotParticipants.get(leg.snapshotId) || [];
    const participant = participants.find((row) => row.id === leg.snapshotParticipantId);
    return {
      ...leg,
      displayName: participant?.displayName || leg.displayName,
      isIssuerRemainder: participant?.isIssuerRemainder ?? leg.isIssuerRemainder,
    };
  }

  async listLegsBySale(saleId: string): Promise<ChargeRevenueSplitLeg[]> {
    return this.legs.filter((row) => row.saleId === saleId).map((row) => this.hydrateLeg(row));
  }

  async listLegsByInstallment(installmentId: string): Promise<ChargeRevenueSplitLeg[]> {
    return this.legs
      .filter((row) => row.installmentId === installmentId)
      .map((row) => this.hydrateLeg(row));
  }

  async listLegsByCharge(chargeId: string): Promise<ChargeRevenueSplitLeg[]> {
    return this.legs.filter((row) => row.chargeId === chargeId).map((row) => this.hydrateLeg(row));
  }

  async getLegById(legId: string): Promise<ChargeRevenueSplitLeg | null> {
    const found = this.legs.find((row) => row.id === legId);
    return found ? this.hydrateLeg(found) : null;
  }

  async upsertLegs(drafts: ChargeRevenueSplitLegDraft[]): Promise<ChargeRevenueSplitLeg[]> {
    const timestamp = nowIso();
    const out: ChargeRevenueSplitLeg[] = [];
    for (const draft of drafts) {
      const index = this.legs.findIndex(
        (row) =>
          row.installmentId === draft.installmentId &&
          row.snapshotParticipantId === draft.snapshotParticipantId,
      );
      const existing = index >= 0 ? this.legs[index] : null;
      const next: ChargeRevenueSplitLeg = {
        id: existing?.id || newId(),
        companyId: draft.companyId,
        saleId: draft.saleId,
        installmentId: draft.installmentId,
        chargeId: draft.chargeId,
        snapshotId: draft.snapshotId,
        snapshotParticipantId: draft.snapshotParticipantId,
        provider: draft.provider,
        providerSplitId: draft.providerSplitId,
        destinationType: draft.destinationType,
        destinationIdentifier: draft.destinationIdentifier,
        sharePercent: draft.sharePercent,
        isIssuerRemainder: draft.isIssuerRemainder,
        displayName: draft.displayName,
        grossAmountEstimate: draft.grossAmountEstimate,
        netAmount: draft.netAmount,
        status: draft.status,
        failureReason: draft.failureReason,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
      };
      if (index >= 0) this.legs[index] = next;
      else this.legs.push(next);
      out.push(this.hydrateLeg(next));
    }
    return out;
  }

  async updateLeg(
    legId: string,
    companyId: string,
    patch: ChargeRevenueSplitLegPatch,
  ): Promise<ChargeRevenueSplitLeg> {
    const index = this.legs.findIndex((row) => row.id === legId && row.companyId === companyId);
    if (index < 0) throw new Error('Perna de split não encontrada.');
    const current = this.legs[index];
    const next: ChargeRevenueSplitLeg = {
      ...current,
      chargeId: patch.chargeId === undefined ? current.chargeId : patch.chargeId,
      providerSplitId:
        patch.providerSplitId === undefined ? current.providerSplitId : patch.providerSplitId,
      destinationType:
        patch.destinationType === undefined ? current.destinationType : patch.destinationType,
      destinationIdentifier:
        patch.destinationIdentifier === undefined
          ? current.destinationIdentifier
          : patch.destinationIdentifier,
      sharePercent: patch.sharePercent === undefined ? current.sharePercent : patch.sharePercent,
      grossAmountEstimate:
        patch.grossAmountEstimate === undefined
          ? current.grossAmountEstimate
          : patch.grossAmountEstimate,
      netAmount: patch.netAmount === undefined ? current.netAmount : patch.netAmount,
      status: patch.status === undefined ? current.status : patch.status,
      failureReason:
        patch.failureReason === undefined ? current.failureReason : patch.failureReason,
      updatedAt: nowIso(),
    };
    this.legs[index] = next;
    return this.hydrateLeg(next);
  }
}
