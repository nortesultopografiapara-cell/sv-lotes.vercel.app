import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MapProjectCacheRecord, OfflineSyncAction } from '@/lib/offline/types';

export interface SvLotesOfflineDB extends DBSchema {
  projects: {
    key: string;
    value: Record<string, unknown>;
  };
  blocks: {
    key: string;
    value: Record<string, unknown>;
  };
  lots: {
    key: string;
    value: Record<string, unknown>;
  };
  customers: {
    key: string;
    value: Record<string, unknown>;
  };
  sales: {
    key: string;
    value: Record<string, unknown>;
  };
  contracts: {
    key: string;
    value: Record<string, unknown>;
  };
  finance_receipts: {
    key: string;
    value: Record<string, unknown>;
  };
  sync_queue: {
    key: string;
    value: OfflineSyncAction;
    indexes: { 'by-status': OfflineSyncAction['status'] };
  };
  map_projects: {
    key: string;
    value: MapProjectCacheRecord;
  };
}

const DB_NAME = 'sv-lotes-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SvLotesOfflineDB>> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function getOfflineDb(): Promise<IDBPDatabase<SvLotesOfflineDB>> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB indisponível neste ambiente.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<SvLotesOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('blocks', { keyPath: 'id' });
        db.createObjectStore('lots', { keyPath: 'id' });
        db.createObjectStore('customers', { keyPath: 'id' });
        db.createObjectStore('sales', { keyPath: 'id' });
        db.createObjectStore('contracts', { keyPath: 'id' });
        db.createObjectStore('finance_receipts', { keyPath: 'id' });

        const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncStore.createIndex('by-status', 'status');

        db.createObjectStore('map_projects', { keyPath: 'projectId' });
      },
    });
  }
  return dbPromise;
}
