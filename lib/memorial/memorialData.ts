/**
 * Carga de dados para memorial descritivo (Supabase).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOfficialLotMeasurements } from '@/lib/officialLotMeasurements';
import { normalizeStreetGuideRow } from '@/lib/streetGuide';
import {
  buildLotConfrontationAuditForMemorial,
  buildMemorialSideSummaryFromAudit,
  memorialHasPendingConfrontations,
} from '@/lib/memorial/memorialConfrontants';
import { buildMemorialSegments } from '@/lib/memorial/memorialGeometry';
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
    logoUrl: String(row.logo_url || '').trim(),
    signatureUrl: String(
      row.technical_signature_url || row.signature_url || '',
    ).trim(),
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

  const { data: allBlocks } = await supabase
    .from('blocks')
    .select('*')
    .eq('project_id', params.projectId);

  const { data: guides } = await supabase
    .from('street_guides')
    .select('*')
    .eq('project_id', params.projectId);

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.tenantId)
    .maybeSingle();

  const blockRecord = block as Record<string, unknown>;
  const projectRecord = project as Record<string, unknown>;
  const blocksList = (allBlocks || []) as Record<string, unknown>[];
  const guidesList = ((guides || []) as Record<string, unknown>[]).map(
    normalizeStreetGuideRow,
  ) as StreetGuideConfrontInput[];

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

  const audit = buildLotConfrontationAuditForMemorial(
    blockRecord,
    params.blockId,
    blocksList,
    guidesList as Record<string, unknown>[],
    projectRecord,
  );

  const hasPending = memorialHasPendingConfrontations(segments, audit);
  const measures = getOfficialLotMeasurements(
    blockRecord,
    blockRecord.number,
  );
  const chanfreStr =
    measures.chanfre?.total != null
      ? formatMemorialDistanceM(measures.chanfre.total)
      : '—';

  return {
    block: blockRecord,
    project: projectRecord,
    company: companyFromRow((company as Record<string, unknown>) || null),
    technical: normalizeTechnicalResponsibleFromCompany(
      (company as Record<string, unknown>) || null,
    ),
    identification: buildMemorialIdentificationFields(
      blockRecord,
      projectRecord,
      {
        area: measures.area,
        perimeter: measures.perimeter,
        frente: measures.frente,
        fundo: measures.fundo,
        ladoDireito: measures.ladoDireito,
        ladoEsquerdo: measures.ladoEsquerdo,
      },
      formatMemorialAreaM2,
      formatMemorialDistanceM,
    ),
    sides: buildMemorialSideSummaryFromAudit(audit, chanfreStr),
    segments,
    descriptionText: buildMemorialDescriptionText(segments),
    observations: buildMemorialObservations(segments, hasPending),
    hasPendingConfrontations: hasPending,
    pendingWarning: hasPending
      ? 'Este lote possui confrontações pendentes (A DEFINIR).'
      : null,
    generatedAt: new Date().toISOString(),
  };
}
