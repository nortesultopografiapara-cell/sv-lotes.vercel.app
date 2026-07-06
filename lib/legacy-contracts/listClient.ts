/**
 * Cliente HTTP — listagem de Contratos Antigos.
 */

import type { LegacyContractListResult } from '@/lib/legacy-contracts/types';

const LIST_TIMEOUT_MS = 60_000;

export async function fetchLegacyContractList(
  params: URLSearchParams,
): Promise<LegacyContractListResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api/legacy-contracts?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    const payload = (await response.json().catch(() => ({}))) as LegacyContractListResult & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        (typeof payload.error === 'string' && payload.error.trim()) ||
          `Não foi possível carregar os contratos antigos (HTTP ${response.status}).`,
      );
    }

    if (!Array.isArray(payload.items)) {
      throw new Error('Resposta inválida ao listar contratos antigos.');
    }

    return payload;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'A consulta de contratos antigos excedeu o tempo limite. Verifique sua conexão e tente novamente.',
      );
    }
    if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
      throw new Error(
        'Falha de conexão ao carregar contratos antigos. Verifique sua internet ou tente novamente em instantes.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
