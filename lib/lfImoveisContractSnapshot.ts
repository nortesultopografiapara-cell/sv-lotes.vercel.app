/**
 * Snapshot contratual LF Imóveis por venda.
 * Coluna: sales.lf_contract_snapshot_json
 *
 * Congela segundo vendedor, percentuais e localização do empreendimento
 * no momento da criação da venda. Sem wallet, Split ou conta financeira.
 * Sem backfill. Não sobrescrever após gravado.
 *
 * Isolado de lfImoveisContractConfig para evitar import circular.
 */

import {
  emptyContractSecondVendorFields,
  isContractSecondVendorComplete,
  parseContractSecondVendorJson,
  type ContractSecondVendorFields,
} from '@/lib/contractSecondVendor';

export const LF_CONTRACT_SNAPSHOT_COLUMN = 'lf_contract_snapshot_json';
export const LF_CONTRACT_SNAPSHOT_VERSION = 1;

export type LfContractSnapshotProject = {
  projectName: string;
  city: string;
  uf: string;
  neighborhood: string;
  address: string;
  contractForum: string;
};

export type LfContractSnapshot = {
  version: number;
  secondVendor: ContractSecondVendorFields;
  hasSecondVendor: boolean;
  participation: { firstVendorPercent: number; secondVendorPercent: number } | null;
  project: LfContractSnapshotProject;
  capturedAt: string;
};

const FORBIDDEN_SNAPSHOT_KEYS = [
  'wallet',
  'walletId',
  'wallet_id',
  'asaasWallet',
  'financialAccountId',
  'financial_account_id',
  'accountId',
  'bankAccount',
  'gateway',
  'split',
  'revenueSplit',
] as const;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === '') return null;
  let parsed: unknown = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

function parsePercent(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim().replace('%', '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function percentsValid(first: number | null, second: number | null): boolean {
  if (first == null || second == null) return false;
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  if (first < 0 || second < 0 || first > 100 || second > 100) return false;
  return Math.round(first * 100) + Math.round(second * 100) === 10000;
}

export function pickLfSnapshotProjectLocation(
  project: Record<string, unknown> | null | undefined,
): LfContractSnapshotProject {
  const rec = project && typeof project === 'object' ? project : {};
  return {
    projectName: clean(rec.name),
    city: clean(rec.city ?? rec.cidade),
    uf: clean(rec.uf ?? rec.state).toUpperCase(),
    neighborhood: clean(rec.neighborhood ?? rec.locality ?? rec.bairro),
    address: clean(
      rec.address ?? rec.address_reference ?? rec.reference ?? rec.endereco,
    ),
    contractForum: clean(rec.forum_city ?? rec.contract_city ?? rec.city ?? rec.cidade),
  };
}

export function parseLfContractSnapshotJson(raw: unknown): LfContractSnapshot | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  for (const key of FORBIDDEN_SNAPSHOT_KEYS) {
    delete obj[key];
  }

  const vendorRaw =
    obj.secondVendor ?? obj.second_vendor ?? obj.segundoVendedor ?? obj.vendor;
  const secondVendor = parseContractSecondVendorJson(vendorRaw);
  const hasSecondVendor = isContractSecondVendorComplete(secondVendor);

  const partRaw = obj.participation ?? obj.participacao ?? obj.percentages;
  const partObj = asRecord(partRaw) || obj;
  const first = parsePercent(
    partObj.firstVendorPercent ?? partObj.first_vendor_percent,
  );
  const second = parsePercent(
    partObj.secondVendorPercent ?? partObj.second_vendor_percent,
  );
  const participation = percentsValid(first, second)
    ? {
        firstVendorPercent: first as number,
        secondVendorPercent: second as number,
      }
    : null;

  const projectObj = asRecord(obj.project) || {};
  const project: LfContractSnapshotProject = {
    projectName: clean(projectObj.projectName ?? projectObj.name),
    city: clean(projectObj.city),
    uf: clean(projectObj.uf ?? projectObj.state).toUpperCase(),
    neighborhood: clean(projectObj.neighborhood ?? projectObj.bairro),
    address: clean(projectObj.address ?? projectObj.address_reference),
    contractForum: clean(
      projectObj.contractForum ?? projectObj.forum_city ?? projectObj.city,
    ),
  };

  const hasProject = Boolean(
    project.projectName ||
      project.city ||
      project.uf ||
      project.neighborhood ||
      project.address ||
      project.contractForum,
  );
  if (!hasSecondVendor && !participation && !hasProject) return null;

  return {
    version: Number(obj.version) || LF_CONTRACT_SNAPSHOT_VERSION,
    secondVendor: hasSecondVendor ? secondVendor : emptyContractSecondVendorFields(),
    hasSecondVendor,
    participation,
    project,
    capturedAt: clean(obj.capturedAt),
  };
}

export function hasLfContractSnapshot(raw: unknown): boolean {
  return parseLfContractSnapshotJson(raw) != null;
}

export function readSaleLfSnapshotRaw(
  sale?: Record<string, unknown> | null,
): unknown {
  if (!sale || typeof sale !== 'object') return null;
  return sale[LF_CONTRACT_SNAPSHOT_COLUMN] ?? sale.lf_contract_snapshot ?? null;
}

/**
 * Monta o JSON imutável a partir da resolução efetiva já calculada
 * (projeto → empresa → 40/60) + localização vigente do empreendimento.
 */
export function buildLfContractSnapshotPayload(input: {
  secondVendor: ContractSecondVendorFields;
  firstVendorPercent: number;
  secondVendorPercent: number;
  secondVendorSource: string;
  participationSource: string;
  project?: Record<string, unknown> | null;
  capturedAt?: string;
}): Record<string, unknown> {
  return {
    version: LF_CONTRACT_SNAPSHOT_VERSION,
    secondVendor: { ...input.secondVendor },
    participation: {
      firstVendorPercent: input.firstVendorPercent,
      secondVendorPercent: input.secondVendorPercent,
    },
    project: pickLfSnapshotProjectLocation(input.project),
    capturedAt: input.capturedAt || new Date().toISOString(),
    sources: {
      secondVendor: input.secondVendorSource,
      participation: input.participationSource,
    },
  };
}

export function applyLfSnapshotProjectToRecord(
  projectRecord: Record<string, unknown>,
  sale?: Record<string, unknown> | null,
): Record<string, unknown> {
  const snap = parseLfContractSnapshotJson(readSaleLfSnapshotRaw(sale));
  if (!snap) return projectRecord;
  const p = snap.project;
  return {
    ...projectRecord,
    name: p.projectName,
    city: p.city,
    uf: p.uf,
    neighborhood: p.neighborhood,
    address: p.address,
    forum_city: p.contractForum,
  };
}
