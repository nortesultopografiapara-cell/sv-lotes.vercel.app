/**
 * Confrontação automática em lote (MVP v1.9) — detecta vizinhos e ruas por geometria.
 */

import { supabase } from '@/lib/supabase';
import { autoLotSideConfrontants } from '@/lib/lotConfrontations';
import { runLotGeometryDiagnosticReport } from '@/lib/lotGeometryDiagnostic';
import { validateConfrontationLot } from '@/lib/lotGeometryNormalize';
import {
  PROJECT_CONFRONTATION_SNAPSHOT_VERSION,
  saveProjectConfrontationSnapshot,
  type LotAutoConfrontationRecord,
  type ProjectConfrontationSnapshot,
} from '@/lib/projectConfrontations';

/** Marcador de build — visível no console para confirmar deploy. */
export const AUTOMATIC_CONFRONTATION_BUILD_ID =
  'v1.9.6-confrontation-field-compare';

if (typeof window !== 'undefined') {
  console.error(
    'AUTOMATIC_CONFRONTATION MODULE LOADED',
    AUTOMATIC_CONFRONTATION_BUILD_ID,
  );
}

export type AutomaticConfrontationResult = {
  projectId: string;
  processed: number;
  skipped: number;
  computedAt: string;
  errors: string[];
  skipReasons: Record<string, number>;
};

export type RunAutomaticConfrontationOptions = {
  tenantId?: string;
  /** Se já carregados na tela do mapa, evita nova consulta. */
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
  const rawBlocks =
    options.blocks?.length
      ? options.blocks
      : await fetchProjectBlocks(projectId, options.tenantId);
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];

  console.error('DIAGNOSTIC FORCED START', {
    build: AUTOMATIC_CONFRONTATION_BUILD_ID,
    projectId,
    blockCount: blocks.length,
  });

  let diagnosticReport: unknown = null;
  try {
    diagnosticReport = runLotGeometryDiagnosticReport(blocks, {
      projectId,
      context: 'automaticConfrontation',
    });
    console.error('DIAGNOSTIC REPORT', diagnosticReport);
  } catch (diagErr: unknown) {
    console.error('[LOT GEOMETRY DEBUG] invoke failed', diagErr);
  }

  const streetGuides =
    options.streetGuides?.length
      ? options.streetGuides
      : await fetchProjectStreetGuides(projectId);

  const lots: LotAutoConfrontationRecord[] = [];
  let processed = 0;
  let skipped = 0;

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

    const validation = validateConfrontationLot(block);
    if (!validation.valid) {
      skipped += 1;
      const reason = validation.reason || 'geometria inválida';
      recordSkip(skipReasons, reason);
      errors.push(`Lote ${lotLabel}: ${reason}`);
      continue;
    }

    try {
      const confrontants = autoLotSideConfrontants(
        block,
        blockId,
        blocks,
        streetGuides,
        validation.ring,
      );
      lots.push({
        blockId,
        lotNumber: lotLabel,
        confrontants,
      });
      processed += 1;
    } catch (e: unknown) {
      skipped += 1;
      const msg =
        e instanceof Error ? e.message : 'erro desconhecido';
      const reason =
        /not iterable/i.test(msg) ? 'geometria inválida' : msg;
      recordSkip(skipReasons, reason);
      errors.push(`Lote ${lotLabel}: ${reason}`);
      console.warn('[CONFRONTATION] erro', lotLabel, e);
    }
  }

  const computedAt = new Date().toISOString();
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
  };
}
