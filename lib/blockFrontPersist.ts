/**
 * Persistência da frente manual do lote (blocks) com fallback se colunas opcionais não existirem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  officialMeasuresToBlockFields,
  type OfficialLotMeasures,
} from '@/lib/officialLotMeasurements';

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

/** Patch mínimo e compatível com blocks em produção (sem updated_at). */
export function buildManualFrontPatch(
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
  options?: { includeFrontSource?: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...officialMeasuresToBlockFields(measures, frontSegmentIndex),
    front_segment_index: frontSegmentIndex,
  };
  if (options?.includeFrontSource) {
    patch.front_source = 'manual';
  }
  return patch;
}

export type PersistManualFrontResult = {
  patch: Record<string, unknown>;
  frontSourcePersisted: boolean;
};

/**
 * Grava frente manual; se `front_source` não existir no schema, repete sem esse campo.
 */
export async function persistManualLotFront(
  supabase: SupabaseClient,
  blockId: string,
  measures: OfficialLotMeasures,
  frontSegmentIndex: number,
): Promise<PersistManualFrontResult> {
  const withSource = buildManualFrontPatch(measures, frontSegmentIndex, {
    includeFrontSource: true,
  });

  let { error } = await supabase
    .from('blocks')
    .update(withSource)
    .eq('id', blockId);

  if (error && isUnknownColumnError(error, 'front_source')) {
    const withoutSource = buildManualFrontPatch(measures, frontSegmentIndex, {
      includeFrontSource: false,
    });
    console.warn(
      'BLOCK_FRONT_SAVE: coluna front_source ausente — salvando apenas front_segment_index e medidas.',
      { blockId, frontSegmentIndex },
    );
    const retry = await supabase
      .from('blocks')
      .update(withoutSource)
      .eq('id', blockId);
    error = retry.error;
    if (!error) {
      return { patch: withoutSource, frontSourcePersisted: false };
    }
  }

  if (error && isUnknownColumnError(error, 'updated_at')) {
    const withoutUpdated = buildManualFrontPatch(measures, frontSegmentIndex, {
      includeFrontSource: !isUnknownColumnError(error, 'front_source'),
    });
    const retry = await supabase
      .from('blocks')
      .update(withoutUpdated)
      .eq('id', blockId);
    error = retry.error;
    if (!error) {
      return {
        patch: withoutUpdated,
        frontSourcePersisted: Boolean(withoutUpdated.front_source),
      };
    }
  }

  if (error) {
    logSupabaseFrontSaveFailure('BLOCK_FRONT_SAVE_FAILED', error, {
      blockId,
      frontSegmentIndex,
      payload: withSource,
    });
    throw error;
  }

  return { patch: withSource, frontSourcePersisted: true };
}
