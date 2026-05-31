/**
 * Confrontação automática em lote (MVP v1.9) — detecta vizinhos e ruas por geometria.
 */

import { supabase } from '@/lib/supabase';
import { autoLotSideConfrontants } from '@/lib/lotConfrontations';
import { latLngRingFromBlock } from '@/lib/lotSheetEnrichment';
import {
  PROJECT_CONFRONTATION_SNAPSHOT_VERSION,
  saveProjectConfrontationSnapshot,
  type LotAutoConfrontationRecord,
  type ProjectConfrontationSnapshot,
} from '@/lib/projectConfrontations';

export type AutomaticConfrontationResult = {
  projectId: string;
  processed: number;
  skipped: number;
  computedAt: string;
  errors: string[];
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
  return (data || []) as Record<string, unknown>[];
}

async function fetchProjectStreetGuides(
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('street_guides')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  return (data || []) as Record<string, unknown>[];
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
  const blocks =
    options.blocks?.length
      ? options.blocks
      : await fetchProjectBlocks(projectId, options.tenantId);
  const streetGuides =
    options.streetGuides?.length
      ? options.streetGuides
      : await fetchProjectStreetGuides(projectId);

  const lots: LotAutoConfrontationRecord[] = [];
  let processed = 0;
  let skipped = 0;

  for (const block of blocks) {
    const blockId = String(block.id || '');
    if (!blockId) {
      skipped += 1;
      continue;
    }
    const ring = latLngRingFromBlock(block);
    if (ring.length < 3) {
      skipped += 1;
      errors.push(`Lote ${block.number ?? blockId}: sem geometria válida`);
      continue;
    }
    try {
      const confrontants = autoLotSideConfrontants(
        block,
        blockId,
        blocks,
        streetGuides,
      );
      lots.push({
        blockId,
        lotNumber: String(block.number ?? block.lot ?? ''),
        confrontants,
      });
      processed += 1;
    } catch (e: unknown) {
      skipped += 1;
      const msg = e instanceof Error ? e.message : 'erro desconhecido';
      errors.push(`Lote ${block.number ?? blockId}: ${msg}`);
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
  };
}
