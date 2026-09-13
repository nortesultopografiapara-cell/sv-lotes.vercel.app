import { REVENUE_SPLIT_DEFAULT_CURRENCY } from './types';
import type {
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
}
