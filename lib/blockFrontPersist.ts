/**
 * Persistência da frente manual do lote (blocks) com fallback se colunas opcionais não existirem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  officialMeasuresToBlockFields,
  type OfficialLotMeasures,
} from '@/lib/officialLotMeasurements';
import type { FrontStreetPersistFields } from '@/lib/resolveFrontStreetGuide';

export type PostgrestErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function formatSupabaseError(error: unknown): string {
  if (error == null) return 'Erro desconhecido';
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  const o = error as PostgrestErrorLike;
  const parts = [o.message, o.details, o.hint, o.code].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return parts.length > 0 ? parts.join(' | ') : 'Erro desconhecido';
}

export function logSupabaseFrontSaveFailure(
  context: string,
  error: unknown,
  meta: Record<string, unknown>,
): void {
  const o = (error ?? {}) as PostgrestErrorLike;
  console.error(context, {
    message: o.message,
    details: o.details,
    code: o.code,
    hint: o.hint,
    raw: error,
    ...meta,
  });
}

export function isUnknownColumnError(error: unknown, column: string): boolean {
  const o = error as PostgrestErrorLike;
  if (o?.code === 'PGRST204') {
    const text = formatSupabaseError(error).toLowerCase();
    return text.includes(column.toLowerCase());
  }
  const text = formatSupabaseError(error).toLowerCase();
  const col = column.toLowerCase();
  return (
    text.includes(col) &&
    (text.includes('column') ||
      text.includes('schema cache') ||
      text.includes('could not find'))
  );
}

function findUnknownColumnInPatch(
  error: unknown,
  patch: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(patch)) {
    if (isUnknownColumnError(error, key)) return key;
  }
  return null;
}

/** Update em blocks removendo colunas ausentes no schema (produção sem migration). */
export async function persistBlockPatch(
  supabase: SupabaseClient,
  blockId: string,
  patch: Record<string, unknown>,
): Promise<{ patch: Record<string, unknown>; droppedColumns: string[] }> {
  let current = { ...patch };
  const dropped: string[] = [];
  const maxAttempts = 16;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { error } = await supabase
      .from('blocks')
      .update(current)
      .eq('id', blockId);

    if (!error) {
      return { patch: current, droppedColumns: dropped };
    }

    const col = findUnknownColumnInPatch(error, current);
    if (!col) {
      logSupabaseFrontSaveFailure('BLOCK_PATCH_FAILED', error, {
        blockId,
        payload: current,
      });
      throw error;
    }

    delete current[col];
    dropped.push(col);
    console.warn('BLOCK_PATCH: coluna ausente, removendo do update:', col, {
      blockId,
    });
  }

  throw new Error('BLOCK_PATCH: excedeu tentativas de fallback de colunas');
}

/** Patch mínimo e compatível com blocks em produção (sem updated_at). */
export function buildManualFrontPatch(
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
  options?: {
    includeFrontSource?: boolean;
    street?: FrontStreetPersistFields;
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...officialMeasuresToBlockFields(measures, frontSegmentIndex),
    front_segment_index: frontSegmentIndex,
  };
  if (options?.includeFrontSource) {
    patch.front_source = 'manual';
  }
  if (options?.street) {
    patch.front_street_id = options.street.front_street_id;
    patch.front_street_name = options.street.front_street_name;
    patch.front_street_type = options.street.front_street_type;
  }
  return patch;
}

export type PersistManualFrontResult = {
  patch: Record<string, unknown>;
  frontSourcePersisted: boolean;
  streetFieldsPersisted: boolean;
};

/**
 * Grava frente manual + logradouro; remove campos que não existirem no schema.
 */
export async function persistManualLotFront(
  supabase: SupabaseClient,
  blockId: string,
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
  street?: FrontStreetPersistFields,
): Promise<PersistManualFrontResult> {
  const fullPatch = buildManualFrontPatch(measures, frontSegmentIndex, {
    includeFrontSource: true,
    street,
  });

  const { patch, droppedColumns } = await persistBlockPatch(
    supabase,
    blockId,
    fullPatch,
  );

  return {
    patch,
    frontSourcePersisted:
      'front_source' in patch &&
      !droppedColumns.includes('front_source'),
    streetFieldsPersisted:
      street != null &&
      !droppedColumns.some((c) => c.startsWith('front_street')),
  };
}
