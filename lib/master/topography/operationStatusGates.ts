import type { SupabaseClient } from '@supabase/supabase-js';
import { countActiveOperationEquipment } from './operationEquipmentService';
import { countOpenCriticalOccurrences } from './operationOccurrenceService';
import {
  countPendingCriticalRequiredTasks,
} from './operationTaskService';
import { countActiveOperationTeam } from './operationTeamService';
import type { OperationStatusCode } from './operationStatuses';

export type StatusTransitionContext = {
  to: OperationStatusCode;
  actualEnd?: string | null;
  overrideReason?: string | null;
  userId?: string | null;
};

export type StatusGateResult = {
  ok: boolean;
  message?: string;
  warnings?: string[];
  requiresOverride?: boolean;
  patchFields?: Record<string, unknown>;
};

/**
 * Regras extras além da máquina de estados:
 * - IN_FIELD: equipe + equipamento ativos (override SUPER_ADMIN com justificativa)
 * - COMPLETED: actual_end + checklist crítico obrigatório (override com justificativa)
 * - Ocorrências CRITICAL abertas: alerta (não bloqueia)
 */
export async function evaluateOperationStatusGates(
  supabase: SupabaseClient,
  operationId: string,
  ctx: StatusTransitionContext,
): Promise<StatusGateResult> {
  const warnings: string[] = [];
  const override = String(ctx.overrideReason || '').trim();
  const now = new Date().toISOString();

  if (ctx.to === 'IN_FIELD') {
    const [teamCount, equipCount] = await Promise.all([
      countActiveOperationTeam(supabase, operationId),
      countActiveOperationEquipment(supabase, operationId),
    ]);
    const missing: string[] = [];
    if (teamCount < 1) missing.push('pelo menos um integrante na equipe');
    if (equipCount < 1) missing.push('pelo menos um equipamento reservado/retirado');
    if (missing.length > 0) {
      if (!override) {
        return {
          ok: false,
          requiresOverride: true,
          message: `Para Em campo é necessário: ${missing.join(' e ')}. SUPER_ADMIN pode informar overrideReason.`,
        };
      }
      return {
        ok: true,
        warnings: [`Override IN_FIELD: ${override}`],
        patchFields: {
          field_requirements_override_reason: override,
          field_requirements_override_by: ctx.userId || null,
          field_requirements_override_at: now,
        },
      };
    }
  }

  if (ctx.to === 'COMPLETED') {
    if (!ctx.actualEnd) {
      return {
        ok: false,
        message: 'Operação concluída exige data/hora de fim real (actual_end).',
      };
    }

    const pendingCritical = await countPendingCriticalRequiredTasks(supabase, operationId);
    if (pendingCritical > 0) {
      if (!override) {
        return {
          ok: false,
          requiresOverride: true,
          message: `Há ${pendingCritical} item(ns) crítico(s) obrigatório(s) pendente(s) no checklist. Informe overrideReason para concluir.`,
        };
      }
      warnings.push(`Override checklist crítico: ${override}`);
    }

    const criticalOpen = await countOpenCriticalOccurrences(supabase, operationId);
    if (criticalOpen > 0) {
      warnings.push(
        `Atenção: ${criticalOpen} ocorrência(s) crítica(s) ainda aberta(s).`,
      );
    }

    const patchFields: Record<string, unknown> = {};
    if (pendingCritical > 0 && override) {
      patchFields.completion_override_reason = override;
      patchFields.completion_override_by = ctx.userId || null;
      patchFields.completion_override_at = now;
    }

    return { ok: true, warnings, patchFields };
  }

  return { ok: true, warnings };
}
