/**
 * Cliente — vinculação manual de Contratos Antigos.
 */

import type {
  LegacyContractManualLinkInput,
  LegacyContractManualLinkOverride,
  ValidatedLegacyContractRow,
} from '@/lib/imports/modules/legacy-contracts/types';

export async function resolveLegacyContractManualLinkRemote(
  input: LegacyContractManualLinkInput,
  activeTenantId: string | null,
  baseRow: ValidatedLegacyContractRow,
): Promise<ValidatedLegacyContractRow> {
  const response = await fetch('/api/data-migration/legacy-contracts/resolve-manual-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      ...input,
      lineNumber: baseRow.lineNumber,
      activeTenantId,
      baseRow,
    }),
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(
      (typeof payload.error === 'string' && payload.error) ||
        'Não foi possível validar a vinculação manual.',
    );
  }

  if (!payload.row) {
    throw new Error('Resposta de vinculação manual inválida.');
  }

  return payload.row as ValidatedLegacyContractRow;
}

export function parseLegacyContractManualLinkOverrides(
  formData: FormData,
): LegacyContractManualLinkOverride[] {
  const raw = formData.get('manualLinkOverrides');
  if (typeof raw !== 'string' || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const lineNumber = Number((entry as { lineNumber?: unknown }).lineNumber);
        const project_id = String((entry as { project_id?: unknown }).project_id || '');
        const quadra = String((entry as { quadra?: unknown }).quadra || '');
        const lote = String((entry as { lote?: unknown }).lote || '');
        const customer_name = String(
          (entry as { customer_name?: unknown }).customer_name || '',
        );
        const observacoesRaw = (entry as { observacoes?: unknown }).observacoes;
        const observacoes =
          typeof observacoesRaw === 'string' && observacoesRaw.trim()
            ? observacoesRaw
            : undefined;

        if (!Number.isFinite(lineNumber) || lineNumber <= 0) return null;
        if (!project_id || !quadra.trim() || !lote.trim() || !customer_name.trim()) {
          return null;
        }

        return {
          lineNumber,
          project_id,
          quadra,
          lote,
          customer_name,
          observacoes,
        };
      })
      .filter((entry): entry is LegacyContractManualLinkOverride => entry != null);
  } catch {
    return [];
  }
}
