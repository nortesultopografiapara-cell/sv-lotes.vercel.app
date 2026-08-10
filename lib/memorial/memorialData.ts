/**
 * Carga de dados para memorial descritivo (Supabase).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOfficialLotDocumentBundle } from '@/lib/officialLotDocumentData';
import { normalizeStreetGuideRow } from '@/lib/streetGuide';
import {
  buildLotConfrontationAuditForMemorial,
  buildMemorialSideSummaryFromAudit,
  memorialHasPendingConfrontations,
} from '@/lib/memorial/memorialConfrontants';
import { buildMemorialSegments } from '@/lib/memorial/memorialGeometry';
import {
  applyResolvedOwnerToBlock,
  resolveLotOwnerFromBlock,
} from '@/lib/lotOwnerResolution';
import {
  buildMemorialDescriptionText,
  buildMemorialIdentificationFields,
  buildMemorialObservations,
} from '@/lib/memorial/memorialText';
import {
  displayOrNotInformed,
  formatMemorialAreaM2,
  formatMemorialDistanceM,
} from '@/lib/memorial/memorialFormat';
import { sanitizeMemorialDisplayText } from '@/lib/memorial/memorialBranding';
import { fetchAllBlocksForProject } from '@/lib/blocksFetchAll';
import type { MemorialCompanyInfo, MemorialPayload } from '@/lib/memorial/memorialTypes';
import {
  normalizeTechnicalResponsibleFromCompany,
} from '@/lib/technicalResponsible';
import type { StreetGuideConfrontInput } from '@/lib/streetGuideConfrontation';

function companyFromRow(row: Record<string, unknown> | null): MemorialCompanyInfo {
  if (!row) {
    return {
      name: 'Não informado',
      fantasyName: 'Não informado',
      cnpj: 'Não informado',
      phone: 'Não informado',
      email: 'Não informado',
      address: 'Não informado',
      city: 'Não informado',
      state: 'Não informado',
      slogan: 'Não informado',
      website: 'Não informado',
      instagram: 'Não informado',
      logoUrl: '',
      signatureUrl: '',
    };
  }
  const parts = [
    displayOrNotInformed(row.address),
    displayOrNotInformed(row.city),
    displayOrNotInformed(row.state),
    displayOrNotInformed(row.zip_code),
  ].filter((p) => p !== 'Não informado');
  return {
    name: displayOrNotInformed(row.name ?? row.razao_social),
    fantasyName: displayOrNotInformed(row.fantasy_name ?? row.name),
    cnpj: displayOrNotInformed(row.cnpj),
    phone: displayOrNotInformed(row.phone),
    email: displayOrNotInformed(row.email),
    address: parts.length ? parts.join(' — ') : 'Não informado',
    city: displayOrNotInformed(row.city),
    state: displayOrNotInformed(row.state),
    slogan: displayOrNotInformed(
      row.slogan ?? row.tagline ?? row.company_slogan,
    ),
    website: displayOrNotInformed(row.website ?? row.site ?? row.site_url),
    instagram: displayOrNotInformed(row.instagram ?? row.instagram_url),
    logoUrl: String(row.logo_url || '').trim(),
    signatureUrl: String(
      row.technical_signature_url || row.signature_url || '',
    ).trim(),
  };
}

export function buildMemorialPayloadFromRecords(params: {
  block: Record<string, unknown>;
  blockId: string;
  project: Record<string, unknown>;
  allBlocks: Record<string, unknown>[];
  streetGuides: StreetGuideConfrontInput[];
  company: Record<string, unknown> | null;
}): MemorialPayload {
  const blockRecord = params.block;
  const projectRecord = params.project;
  const blocksList = params.allBlocks;
  const guidesList = params.streetGuides;

  const segments = buildMemorialSegments(
    blockRecord,
    params.blockId,
    blocksList,
    guidesList,
    projectRecord,
  );

  if (segments.length < 2) {
    throw new Error(
      'Memorial requer ao menos 2 segmentos oficiais em segments_json.',
    );
  }

  const bundle = buildOfficialLotDocumentBundle({
    block: blockRecord,
    blockId: params.blockId,
    project: projectRecord,
    allBlocks: blocksList,
    streetGuides: guidesList,
  });

  const hasPending = memorialHasPendingConfrontations(
    blockRecord,
    bundle.audit,
    blocksList,
    projectRecord,
    guidesList,
  );

  return {
    block: blockRecord,
    project: projectRecord,
    company: companyFromRow(params.company),
    technical: normalizeTechnicalResponsibleFromCompany(params.company),
    identification: buildMemorialIdentificationFields(
      blockRecord,
      projectRecord,
      {
        area: bundle.measures.area,
        perimeter: bundle.measures.perimeter,
        frente: bundle.measures.frente,
        fundo: bundle.measures.fundo,
        ladoDireito: bundle.measures.ladoDireito,
        ladoEsquerdo: bundle.measures.ladoEsquerdo,
      },
      formatMemorialAreaM2,
      formatMemorialDistanceM,
    ),
    sides: {
      frente: bundle.confrontations.frente,
      fundo: bundle.confrontations.fundo,
      ladoDireito: bundle.confrontations.ladoDireito,
      ladoEsquerdo: bundle.confrontations.ladoEsquerdo,
      chanfre: bundle.confrontations.chanfre ?? bundle.chanfreLabel,
    },
    segments,
    descriptionText: buildMemorialDescriptionText(segments),
    observations: buildMemorialObservations(segments, hasPending),
    hasPendingConfrontations: hasPending,
    pendingWarning: hasPending
      ? 'Este lote possui confrontações pendentes (A DEFINIR).'
      : null,
    generatedAt: new Date().toISOString(),
    projectName: sanitizeMemorialDisplayText(
      projectRecord.name ?? projectRecord.title,
    ),
    utmZone: sanitizeMemorialDisplayText(
      projectRecord.utm_zone ?? projectRecord.fuso_utm ?? '22S',
    ),
  };
}

export async function loadMemorialPayload(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    blockId: string;
    tenantId: string;
  },
): Promise<MemorialPayload> {
  const { data: block, error: blockErr } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', params.blockId)
    .single();
  if (blockErr || !block) {
    throw new Error(blockErr?.message || 'Lote não encontrado.');
  }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .single();
  if (projErr || !project) {
    throw new Error(projErr?.message || 'Empreendimento não encontrado.');
  }

  const allBlocksFetch = await fetchAllBlocksForProject(supabase, params.projectId, {
    select: '*',
    applyTenant: false,
  });
  const allBlocks = allBlocksFetch.rows;

  const { data: guides } = await supabase
    .from('street_guides')
    .select('*')
    .eq('project_id', params.projectId);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.tenantId)
    .maybeSingle();

  const guidesList = ((guides || []) as Record<string, unknown>[]).map(
    normalizeStreetGuideRow,
  ) as StreetGuideConfrontInput[];

  const ownerResolved = await resolveLotOwnerFromBlock(
    supabase,
    block as Record<string, unknown>,
  );
  const blockForMemorial = applyResolvedOwnerToBlock(
    block as Record<string, unknown>,
    ownerResolved,
  );

  return buildMemorialPayloadFromRecords({
    block: blockForMemorial,
    blockId: params.blockId,
    project: project as Record<string, unknown>,
    allBlocks: (allBlocks || []) as Record<string, unknown>[],
    streetGuides: guidesList,
    company: (company as Record<string, unknown>) || null,
  });
}
