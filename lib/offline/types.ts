export type OfflineEntityTable =
  | 'projects'
  | 'blocks'
  | 'lots'
  | 'customers'
  | 'sales'
  | 'contracts'
  | 'finance_receipts'
  | 'sync_queue'
  | 'map_projects';

export type OfflineActionType =
  | 'BLOCK_RESERVE'
  | 'BLOCK_RELEASE'
  | 'CUSTOMER_UPSERT';

export type OfflineActionStatus = 'pending' | 'synced' | 'error' | 'ignored';

export type OfflineSyncAction = {
  id: string;
  type: OfflineActionType;
  table: string;
  payload: Record<string, unknown>;
  status: OfflineActionStatus;
  error_message?: string | null;
  /** true quando falha por conflito de reserva/venda */
  conflict?: boolean;
  created_at: string;
  synced_at?: string | null;
  ignored_at?: string | null;
  manual_confirmed_at?: string | null;
};

export type MapProjectCacheRecord = {
  projectId: string;
  tenantId: string;
  projectName?: string;
  blocksRaw: Record<string, unknown>[];
  lots: Record<string, unknown>[];
  blocksData: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
  updatedAt: string;
};

export type OfflineConnectivityState =
  | 'online'
  | 'offline'
  | 'syncing'
  | 'synced';
