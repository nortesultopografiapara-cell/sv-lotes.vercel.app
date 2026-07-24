/**
 * Confrontação automática em lote — perímetro oficial UTM (segments_json).
 */

import { supabase } from '@/lib/supabase';
import { applyAutoFrontStreetToBlockSegments } from '@/lib/autoFrontStreetSegments';
import { buildLotConfrontationAudit } from '@/lib/assistedConfrontation';
import {
  buildAllPolysUtm,
  buildSideConfrontantsWithSources,
} from '@/lib/lotSegmentConfrontation';
import type { OfficialConfrontationRingSource } from '@/lib/officialConfrontationRing';
import { validateConfrontationLot } from '@/lib/lotGeometryNormalize';
import {
  PROJECT_CONFRONTATION_SNAPSHOT_VERSION,
  saveProjectConfrontationSnapshot,
  type LotAutoConfrontationRecord,
  type ProjectConfrontationSnapshot,
} from '@/lib/projectConfrontations';
import { logLotAuditEvent, lotAuditContextFromBlock } from '@/lib/lotAudit';

export type AutomaticConfrontationResult = {
  projectId: string;
  processed: number;
  skipped: number;
  computedAt: string;
  errors: string[];
  skipReasons: Record<string, number>;
  sourceCounts: Record<OfficialConfrontationRingSource, number>;
};

export type RunAutomaticConfrontationOptions = {
  tenantId?: string;
  userId?: string | null;
  project?: Record<string, unknown> | null;
  blocks?: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
};

async function fetchProjectBlocks(
  projectId: string,
  tenantId?: string,
): Promise<Record<string, unknown>[]> {
  let query = supabase.from('blocks').select('*').eq('project_id', projectId);
  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data || [];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

async function fetchProjectStreetGuides(
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('street_guides')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  const rows = data || [];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function recordSkip(
  skipReasons: Record<string, number>,
  reason: string,
): void {
  const key = reason || 'desconhecido';
  skipReasons[key] = (skipReasons[key] || 0) + 1;
}

/**
 * Detecta confrontantes de todos os lotes do projeto e grava snapshot reutilizável.
 */
export async function runAutomaticConfrontation(
  projectId: string,
  options: RunAutomaticConfrontationOptions = {},
): Promise<AutomaticConfrontationResult> {
  if (!projectId) {
    throw new Error('Selecione um projeto para executar a confrontação automática.');
  }

  const errors: string[] = [];
  const skipReasons: Record<string, number> = {};
  const sourceCounts: Record<OfficialConfrontationRingSource, number> = {
    segments_json: 0,
    coordinates_utm_json: 0,
    geometry: 0,
  };

  const rawBlocks =
    options.blocks?.length
      ? options.blocks
      : await fetchProjectBlocks(projectId, options.tenantId);
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
  const project = options.project ?? null;

  const streetGuidesRaw =
    options.streetGuides != null
      ? options.streetGuides
      : await fetchProjectStreetGuides(projectId);
  const streetGuides = Array.isArray(streetGuidesRaw) ? streetGuidesRaw : [];

  const lots: LotAutoConfrontationRecord[] = [];
  let processed = 0;
  let skipped = 0;
  const batchAt = new Date().toISOString();
  const sharedPolys = buildAllPolysUtm(blocks, project);

  for (const block of blocks) {
    const blockId = String(block.id || '');
    const lotLabel = String(
      block.number ?? block.lot ?? (blockId || '?'),
    );

    if (!blockId) {
      skipped += 1;
      recordSkip(skipReasons, 'sem id');
      errors.push(`Lote ${lotLabel}: sem id`);
      continue;
    }

    const validation = validateConfrontationLot(block, project);
    if (!validation.valid) {
      skipped += 1;
      const reason = validation.reason || 'sem perímetro oficial';
      recordSkip(skipReasons, reason);
      errors.push(`Lote ${lotLabel}: ${reason}`);
      continue;
    }

    try {
      const built = buildSideConfrontantsWithSources(
        block,
        blockId,
        validation.ring,
        blocks,
        streetGuides,
        project,
        sharedPolys,
      );

      const source = validation.ringSource ?? 'segments_json';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;

      const blockForAudit =
        built.sources.frente === 'street_guide' && !built.pending.frente
          ? applyAutoFrontStreetToBlockSegments(
              block,
              built.frente,
              'street_guide',
              blocks,
              project,
              streetGuides as import('@/lib/streetGuideConfrontation').StreetGuideConfrontInput[],
            )
          : block;

      const audit = buildLotConfrontationAudit(
        blockForAudit,
        blockId,
        blocks,
        streetGuides,
        project,
        sharedPolys,
      );

      lots.push({
        blockId,
        lotNumber: lotLabel,
        block: String(block.block_name ?? block.name ?? ''),
        confrontants: built,
        sources: built.sources,
        pendingSides: built.pending,
        front: built.frente,
        back: built.fundo,
        left: built.ladoEsquerdo,
        right: built.ladoDireito,
        source,
        confidence: built.confidence,
        computedAt: batchAt,
      });

      if (audit.hasPending) {
        console.log('CONFRONTATION_PENDING_SIDES', {
          blockId,
          lotNumber: lotLabel,
          pending: audit.pendingCount,
        });
      }

      void logLotAuditEvent(supabase, {
        ...lotAuditContextFromBlock(block, {
          companyId: options.tenantId ?? null,
          projectId,
        }),
        userId: options.userId ?? null,
        action: 'confrontation_auto',
        title: 'Confrontação automática',
        description: `Confrontantes calculados (frente: ${built.frente || '—'})`,
        newData: {
          frente: built.frente,
          fundo: built.fundo,
          ladoDireito: built.ladoDireito,
          ladoEsquerdo: built.ladoEsquerdo,
          pending: built.pending,
          confidence: built.confidence,
        },
        source: 'gis_map',
      });

      processed += 1;
    } catch (e: unknown) {
      skipped += 1;
      const msg =
        e instanceof Error ? e.message : 'erro desconhecido';
      const reason =
        /not iterable/i.test(msg) ? 'erro de geometria' : msg;
      recordSkip(skipReasons, reason);
      errors.push(`Lote ${lotLabel}: ${reason}`);
      console.warn('[CONFRONTATION] erro', lotLabel, e);
    }
  }

  const computedAt = batchAt;
  const snapshot: ProjectConfrontationSnapshot = {
    projectId,
    computedAt,
    version: PROJECT_CONFRONTATION_SNAPSHOT_VERSION,
    lots,
  };
  saveProjectConfrontationSnapshot(snapshot);

  return {
    projectId,
    processed,
    skipped,
    computedAt,
    errors,
    skipReasons,
    sourceCounts,
  };
}
