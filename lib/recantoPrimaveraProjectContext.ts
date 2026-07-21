/**
 * Dados do empreendimento no contrato Recanto Primavera — fonte primária: projeto da venda.
 */

import {
  sanitizeContractField,
  type RecantoPrimaveraCompanyProfile,
} from '@/lib/recantoPrimaveraCompanyProfile';
import { toContractTitleCase } from '@/lib/contractTitleCase';

export type RecantoPrimaveraProjectContractFields = {
  enterpriseName: string;
  enterpriseLocation: string;
  municipality: string;
  uf: string;
  forumCity: string;
};

function toTitleCase(str: string): string {
  return toContractTitleCase(str);
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const clean = sanitizeContractField(value);
    if (clean) return clean;
  }
  return '';
}

function buildProjectEnterpriseLocation(
  project: Record<string, unknown>,
): string {
  const neighborhood = pickString(
    project.neighborhood,
    project.locality,
    project.bairro,
  );
  const address = pickString(
    project.address,
    project.address_reference,
    project.reference,
  );
  const location = pickString(project.location);

  const parts: string[] = [];
  if (neighborhood) parts.push(neighborhood);
  if (address) parts.push(address);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  if (
    location &&
    !location.toLowerCase().includes('cidade - uf') &&
    !/^\s*\w+\s*-\s*\w{2}\s*$/i.test(location)
  ) {
    return location;
  }

  return '';
}

export function resolveRecantoContractProjectRecord(
  project: Record<string, unknown> | null | undefined,
  sale?: Record<string, unknown> | null,
  block?: Record<string, unknown> | null,
  contractSnapshot?: Record<string, unknown> | null,
): Record<string, unknown> {
  const fromParam =
    project && typeof project === 'object' ? { ...project } : {};

  const nested =
    (sale?.projects && typeof sale.projects === 'object'
      ? (sale.projects as Record<string, unknown>)
      : null) ||
    (sale?.project && typeof sale.project === 'object'
      ? (sale.project as Record<string, unknown>)
      : null) ||
    (block?.projects && typeof block.projects === 'object'
      ? (block.projects as Record<string, unknown>)
      : null) ||
    (block?.project && typeof block.project === 'object'
      ? (block.project as Record<string, unknown>)
      : null);

  const merged: Record<string, unknown> = {
    ...(nested || {}),
    ...fromParam,
  };

  if (!pickString(merged.name) && contractSnapshot?.project_name_snapshot) {
    merged.name = contractSnapshot.project_name_snapshot;
  }
  if (!pickString(merged.city) && contractSnapshot?.project_city_snapshot) {
    merged.city = contractSnapshot.project_city_snapshot;
  }
  if (
    !pickString(merged.uf, merged.state) &&
    contractSnapshot?.project_uf_snapshot
  ) {
    merged.uf = contractSnapshot.project_uf_snapshot;
  }
  if (
    !pickString(merged.forum_city, merged.contract_city) &&
    contractSnapshot?.forum_city_snapshot
  ) {
    merged.forum_city = contractSnapshot.forum_city_snapshot;
  }

  return merged;
}

export function resolveRecantoPrimaveraProjectContractFields(
  project: Record<string, unknown> | null | undefined,
  company?: Record<string, unknown> | RecantoPrimaveraCompanyProfile | null,
): RecantoPrimaveraProjectContractFields {
  const p = project && typeof project === 'object' ? project : {};
  const c =
    company && typeof company === 'object'
      ? (company as Record<string, unknown>)
      : {};

  const enterpriseName = toTitleCase(
    pickString(
      p.name,
      c.contract_enterprise_name,
      c.fantasy_name,
      c.name,
    ),
  );

  const municipality = toTitleCase(
    pickString(
      p.city,
      c.contract_enterprise_municipality,
      c.city,
    ),
  );

  const uf = pickString(p.uf, p.state, c.contract_enterprise_uf, c.state, c.uf)
    .toUpperCase();

  const forumCity = toTitleCase(
    pickString(
      p.forum_city,
      p.contract_city,
      p.city,
      c.contract_forum_city,
      c.contract_enterprise_municipality,
      c.city,
    ),
  );

  const enterpriseLocation =
    buildProjectEnterpriseLocation(p) ||
    pickString(c.contract_enterprise_location);

  return {
    enterpriseName: enterpriseName || 'Chacreamento Recanto Primavera',
    enterpriseLocation,
    municipality: municipality || 'Parauapebas',
    uf: uf || 'PA',
    forumCity: forumCity || municipality || 'Parauapebas',
  };
}
