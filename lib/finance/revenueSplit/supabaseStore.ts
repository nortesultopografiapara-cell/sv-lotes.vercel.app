import type { SupabaseClient } from '@supabase/supabase-js';
import { REVENUE_SPLIT_DEFAULT_CURRENCY } from './types';
import type {
  FinancialAccountProviderDestination,
  ProjectRevenueSplitConfig,
  ProjectRevenueSplitParticipant,
  RevenueSplitConfigStatus,
  RevenueSplitDestinationStatus,
  RevenueSplitDestinationType,
  RevenueSplitFinancialAccountRecord,
  RevenueSplitPartyKind,
  RevenueSplitProjectRecord,
  RevenueSplitSaleRecord,
  RevenueSplitUserRecord,
  SaleRevenueSplitSnapshot,
  SaleRevenueSplitSnapshotParticipant,
} from './types';
import type { RevenueSplitStore, SaveProjectRevenueSplitInput, UpsertRevenueSplitDestinationInput } from './store';

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function asNumber(value: unknown): number {
  return Number(value);
}

function mapConfig(row: Record<string, unknown>): ProjectRevenueSplitConfig {
  return {
    id: asText(row.id),
    companyId: asText(row.company_id),
    projectId: asText(row.project_id),
    enabled: Boolean(row.enabled),
    status: asText(row.status) as RevenueSplitConfigStatus,
    currency: asText(row.currency) || REVENUE_SPLIT_DEFAULT_CURRENCY,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

function mapParticipant(row: Record<string, unknown>): ProjectRevenueSplitParticipant {
  return {
    id: asText(row.id),
    configId: asText(row.config_id),
    companyId: asText(row.company_id),
    projectId: asText(row.project_id),
    displayName: asText(row.display_name),
    partyKind: asText(row.party_kind) as RevenueSplitPartyKind,
    userId: asText(row.user_id) || null,
    financialAccountId: asText(row.financial_account_id) || null,
    sharePercent: asNumber(row.share_percent),
    isIssuerRemainder: Boolean(row.is_issuer_remainder),
    sortOrder: Number(row.sort_order || 0),
    active: row.active !== false,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

function mapDestination(row: Record<string, unknown>): FinancialAccountProviderDestination {
  return {
    id: asText(row.id),
    companyId: asText(row.company_id),
    financialAccountId: asText(row.financial_account_id),
    provider: asText(row.provider),
    destinationType: asText(row.destination_type) as RevenueSplitDestinationType,
    destinationIdentifier: asText(row.destination_identifier),
    status: asText(row.status) as RevenueSplitDestinationStatus,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at),
  };
}

function throwIfError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

export function createSupabaseRevenueSplitStore(admin: SupabaseClient): RevenueSplitStore {
  return {
    async getProject(projectId: string): Promise<RevenueSplitProjectRecord | null> {
      const { data, error } = await admin
        .from('projects')
        .select('id, tenant_id, company_id')
        .eq('id', projectId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar empreendimento.');
      if (!data) return null;
      const companyId = asText(data.company_id) || asText(data.tenant_id);
      if (!companyId) return null;
      return { id: asText(data.id), companyId };
    },

    async getSale(saleId: string): Promise<RevenueSplitSaleRecord | null> {
      const { data, error } = await admin
        .from('sales')
        .select('id, company_id, tenant_id, project_id')
        .eq('id', saleId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar venda.');
      if (!data) return null;
      return {
        id: asText(data.id),
        companyId: asText(data.company_id) || asText(data.tenant_id),
        projectId: asText(data.project_id),
      };
    },

    async getUser(userId: string): Promise<RevenueSplitUserRecord | null> {
      const { data, error } = await admin
        .from('users')
        .select('id, tenant_id')
        .eq('id', userId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar usuário.');
      if (!data) return null;
      return {
        id: asText(data.id),
        companyId: asText(data.tenant_id),
      };
    },

    async getFinancialAccount(accountId: string): Promise<RevenueSplitFinancialAccountRecord | null> {
      const { data, error } = await admin
        .from('company_financial_accounts')
        .select('id, company_id, active')
        .eq('id', accountId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar conta financeira.');
      if (!data) return null;
      return {
        id: asText(data.id),
        companyId: asText(data.company_id),
        active: data.active !== false,
      };
    },

    async getConfigByProject(projectId: string): Promise<ProjectRevenueSplitConfig | null> {
      const { data, error } = await admin
        .from('project_revenue_split_configs')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar configuração de split.');
      return data ? mapConfig(data as Record<string, unknown>) : null;
    },

    async getParticipants(configId: string): Promise<ProjectRevenueSplitParticipant[]> {
      const { data, error } = await admin
        .from('project_revenue_split_participants')
        .select('*')
        .eq('config_id', configId)
        .order('sort_order', { ascending: true });
      throwIfError(error, 'Falha ao carregar participantes.');
      return (data || []).map((row) => mapParticipant(row as Record<string, unknown>));
    },

    async listDestinations(
      companyId: string,
      financialAccountIds: string[],
    ): Promise<FinancialAccountProviderDestination[]> {
      if (!financialAccountIds.length) return [];
      const { data, error } = await admin
        .from('financial_account_provider_destinations')
        .select('*')
        .eq('company_id', companyId)
        .in('financial_account_id', financialAccountIds);
      throwIfError(error, 'Falha ao carregar destinos financeiros.');
      return (data || []).map((row) => mapDestination(row as Record<string, unknown>));
    },

    async upsertDestination(
      input: UpsertRevenueSplitDestinationInput,
    ): Promise<FinancialAccountProviderDestination> {
      const payload = {
        company_id: input.companyId,
        financial_account_id: input.financialAccountId,
        provider: input.provider,
        destination_type: input.destinationType,
        destination_identifier: input.destinationIdentifier,
        status: input.status || 'ACTIVE',
        updated_at: new Date().toISOString(),
      };
      const { data: existing, error: existingError } = await admin
        .from('financial_account_provider_destinations')
        .select('*')
        .eq('financial_account_id', input.financialAccountId)
        .eq('provider', input.provider)
        .eq('destination_type', input.destinationType)
        .maybeSingle();
      throwIfError(existingError, 'Falha ao consultar destino financeiro.');

      if (existing) {
        const { data, error } = await admin
          .from('financial_account_provider_destinations')
          .update(payload)
          .eq('id', existing.id)
          .eq('company_id', input.companyId)
          .select('*')
          .single();
        throwIfError(error, 'Falha ao atualizar destino financeiro.');
        return mapDestination(data as Record<string, unknown>);
      }

      const { data, error } = await admin
        .from('financial_account_provider_destinations')
        .insert(payload)
        .select('*')
        .single();
      throwIfError(error, 'Falha ao criar destino financeiro.');
      return mapDestination(data as Record<string, unknown>);
    },

    async listParticipationsByUser(
      companyId: string,
      userId: string,
    ): Promise<ProjectRevenueSplitParticipant[]> {
      const { data, error } = await admin
        .from('project_revenue_split_participants')
        .select('*')
        .eq('company_id', companyId)
        .eq('user_id', userId)
        .eq('active', true)
        .order('sort_order', { ascending: true });
      throwIfError(error, 'Falha ao carregar participações.');
      return (data || []).map((row) => mapParticipant(row as Record<string, unknown>));
    },

    async saveConfig(input: SaveProjectRevenueSplitInput) {
      const existing = await this.getConfigByProject(input.projectId);
      const timestamp = new Date().toISOString();
      const configPayload = {
        company_id: input.companyId,
        project_id: input.projectId,
        enabled: input.enabled,
        status: input.status,
        currency: input.currency || existing?.currency || REVENUE_SPLIT_DEFAULT_CURRENCY,
        updated_at: timestamp,
      };

      let configRow: Record<string, unknown>;
      if (existing) {
        const { data, error } = await admin
          .from('project_revenue_split_configs')
          .update(configPayload)
          .eq('id', existing.id)
          .eq('company_id', input.companyId)
          .select('*')
          .single();
        throwIfError(error, 'Falha ao atualizar configuração de split.');
        configRow = data as Record<string, unknown>;
      } else {
        const { data, error } = await admin
          .from('project_revenue_split_configs')
          .insert(configPayload)
          .select('*')
          .single();
        throwIfError(error, 'Falha ao criar configuração de split.');
        configRow = data as Record<string, unknown>;
      }

      const config = mapConfig(configRow);
      const { error: deleteError } = await admin
        .from('project_revenue_split_participants')
        .delete()
        .eq('config_id', config.id)
        .eq('company_id', input.companyId);
      throwIfError(deleteError, 'Falha ao substituir participantes.');

      if (input.participants.length) {
        const { error: insertError } = await admin.from('project_revenue_split_participants').insert(
          input.participants.map((row, index) => ({
            config_id: config.id,
            company_id: input.companyId,
            project_id: input.projectId,
            display_name: row.displayName,
            party_kind: row.partyKind,
            user_id: row.userId || null,
            financial_account_id: row.financialAccountId || null,
            share_percent: row.sharePercent,
            is_issuer_remainder: Boolean(row.isIssuerRemainder),
            sort_order: row.sortOrder ?? index,
            active: row.active !== false,
          })),
        );
        throwIfError(insertError, 'Falha ao gravar participantes.');
      }

      return {
        config,
        participants: await this.getParticipants(config.id),
      };
    },

    async getSnapshotBySale(saleId: string): Promise<SaleRevenueSplitSnapshot | null> {
      const { data, error } = await admin
        .from('sale_revenue_split_snapshots')
        .select('*')
        .eq('sale_id', saleId)
        .maybeSingle();
      throwIfError(error, 'Falha ao carregar snapshot.');
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: asText(row.id),
        companyId: asText(row.company_id),
        projectId: asText(row.project_id),
        saleId: asText(row.sale_id),
        sourceConfigId: asText(row.source_config_id) || null,
        provider: asText(row.provider) || null,
        currency: asText(row.currency) || REVENUE_SPLIT_DEFAULT_CURRENCY,
        frozenAt: asText(row.frozen_at),
        createdAt: asText(row.created_at),
      };
    },

    async getSnapshotParticipants(snapshotId: string): Promise<SaleRevenueSplitSnapshotParticipant[]> {
      const { data, error } = await admin
        .from('sale_revenue_split_snapshot_participants')
        .select('*')
        .eq('snapshot_id', snapshotId)
        .order('sort_order', { ascending: true });
      throwIfError(error, 'Falha ao carregar participantes do snapshot.');
      return (data || []).map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: asText(row.id),
          snapshotId: asText(row.snapshot_id),
          companyId: asText(row.company_id),
          sourceParticipantId: asText(row.source_participant_id) || null,
          displayName: asText(row.display_name),
          partyKind: asText(row.party_kind) as RevenueSplitPartyKind,
          userId: asText(row.user_id) || null,
          financialAccountId: asText(row.financial_account_id) || null,
          destinationProvider: asText(row.destination_provider) || null,
          destinationType: asText(row.destination_type) || null,
          destinationIdentifier: asText(row.destination_identifier) || null,
          sharePercent: asNumber(row.share_percent),
          isIssuerRemainder: Boolean(row.is_issuer_remainder),
          sortOrder: Number(row.sort_order || 0),
          createdAt: asText(row.created_at),
        };
      });
    },

    async insertSnapshot(input) {
      const existing = await this.getSnapshotBySale(input.snapshot.saleId);
      if (existing) {
        return {
          snapshot: existing,
          participants: await this.getSnapshotParticipants(existing.id),
        };
      }
      const { data, error } = await admin
        .from('sale_revenue_split_snapshots')
        .insert({
          company_id: input.snapshot.companyId,
          project_id: input.snapshot.projectId,
          sale_id: input.snapshot.saleId,
          source_config_id: input.snapshot.sourceConfigId,
          provider: input.snapshot.provider,
          currency: input.snapshot.currency || REVENUE_SPLIT_DEFAULT_CURRENCY,
        })
        .select('*')
        .single();
      throwIfError(error, 'Falha ao criar snapshot.');
      const snapshotRow = data as Record<string, unknown>;
      const snapshot: SaleRevenueSplitSnapshot = {
        id: asText(snapshotRow.id),
        companyId: asText(snapshotRow.company_id),
        projectId: asText(snapshotRow.project_id),
        saleId: asText(snapshotRow.sale_id),
        sourceConfigId: asText(snapshotRow.source_config_id) || null,
        provider: asText(snapshotRow.provider) || null,
        currency: asText(snapshotRow.currency) || REVENUE_SPLIT_DEFAULT_CURRENCY,
        frozenAt: asText(snapshotRow.frozen_at),
        createdAt: asText(snapshotRow.created_at),
      };
      if (input.participants.length) {
        const { error: insertError } = await admin
          .from('sale_revenue_split_snapshot_participants')
          .insert(
            input.participants.map((row, index) => ({
              snapshot_id: snapshot.id,
              company_id: snapshot.companyId,
              source_participant_id: row.sourceParticipantId,
              display_name: row.displayName,
              party_kind: row.partyKind,
              user_id: row.userId,
              financial_account_id: row.financialAccountId,
              destination_provider: row.destinationProvider,
              destination_type: row.destinationType,
              destination_identifier: row.destinationIdentifier,
              share_percent: row.sharePercent,
              is_issuer_remainder: row.isIssuerRemainder,
              sort_order: row.sortOrder ?? index,
            })),
          );
        throwIfError(insertError, 'Falha ao gravar participantes do snapshot.');
      }
      return {
        snapshot,
        participants: await this.getSnapshotParticipants(snapshot.id),
      };
    },
  };
}
