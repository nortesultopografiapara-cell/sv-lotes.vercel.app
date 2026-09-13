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

export type SaveProjectRevenueSplitInput = {
  companyId: string;
  projectId: string;
  enabled: boolean;
  status: ProjectRevenueSplitConfig['status'];
  currency?: string;
  participants: Array<
    Omit<ProjectRevenueSplitParticipant, 'id' | 'configId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  >;
};

export type UpsertRevenueSplitDestinationInput = {
  companyId: string;
  financialAccountId: string;
  provider: string;
  destinationType: FinancialAccountProviderDestination['destinationType'];
  destinationIdentifier: string;
  status?: FinancialAccountProviderDestination['status'];
};

export interface RevenueSplitStore {
  getProject(projectId: string): Promise<RevenueSplitProjectRecord | null>;
  getSale(saleId: string): Promise<RevenueSplitSaleRecord | null>;
  getUser(userId: string): Promise<RevenueSplitUserRecord | null>;
  getFinancialAccount(accountId: string): Promise<RevenueSplitFinancialAccountRecord | null>;

  getConfigByProject(projectId: string): Promise<ProjectRevenueSplitConfig | null>;
  getParticipants(configId: string): Promise<ProjectRevenueSplitParticipant[]>;
  listDestinations(
    companyId: string,
    financialAccountIds: string[],
  ): Promise<FinancialAccountProviderDestination[]>;
  upsertDestination(
    input: UpsertRevenueSplitDestinationInput,
  ): Promise<FinancialAccountProviderDestination>;
  listParticipationsByUser(
    companyId: string,
    userId: string,
  ): Promise<ProjectRevenueSplitParticipant[]>;

  saveConfig(input: SaveProjectRevenueSplitInput): Promise<{
    config: ProjectRevenueSplitConfig;
    participants: ProjectRevenueSplitParticipant[];
  }>;

  getSnapshotBySale(saleId: string): Promise<SaleRevenueSplitSnapshot | null>;
  getSnapshotParticipants(snapshotId: string): Promise<SaleRevenueSplitSnapshotParticipant[]>;
  insertSnapshot(input: {
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
  }>;

  listLegsBySale(saleId: string): Promise<ChargeRevenueSplitLeg[]>;
  listLegsByInstallment(installmentId: string): Promise<ChargeRevenueSplitLeg[]>;
  listLegsByCharge(chargeId: string): Promise<ChargeRevenueSplitLeg[]>;
  getLegById(legId: string): Promise<ChargeRevenueSplitLeg | null>;
  upsertLegs(drafts: ChargeRevenueSplitLegDraft[]): Promise<ChargeRevenueSplitLeg[]>;
  updateLeg(
    legId: string,
    companyId: string,
    patch: ChargeRevenueSplitLegPatch,
  ): Promise<ChargeRevenueSplitLeg>;
}
