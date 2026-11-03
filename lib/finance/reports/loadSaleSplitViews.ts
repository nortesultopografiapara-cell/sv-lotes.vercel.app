import type { CanonicalSaleSplitView } from './canonicalFinanceTypes';

/**
 * Lê o split já persistido via API existente.
 * Não cria snapshot, não emite cobrança, não altera pagamento.
 */
export async function loadSaleSplitViewsForReport(
  saleIds: string[],
): Promise<Record<string, CanonicalSaleSplitView>> {
  const unique = [...new Set(saleIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const out: Record<string, CanonicalSaleSplitView> = {};
  await Promise.all(
    unique.map(async (saleId) => {
      try {
        const res = await fetch(
          `/api/finance/revenue-split/sales/${encodeURIComponent(saleId)}`,
          { credentials: 'include' },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.snapshot) return;
        out[saleId] = {
          saleId,
          snapshot: data.snapshot ? { id: String(data.snapshot.id) } : null,
          participants: data.participants || [],
          legs: data.legs || [],
        };
      } catch {
        /* relatório segue sem split desta venda */
      }
    }),
  );
  return out;
}
