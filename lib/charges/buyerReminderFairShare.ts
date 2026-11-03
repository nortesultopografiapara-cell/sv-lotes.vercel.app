/**
 * Distribuição justa do teto de WhatsApp entre empresas na mesma execução.
 * O teto global permanece; e-mail não usa esta alocação.
 */

export function allocateWhatsAppSlots(
  companyIds: string[],
  maxSlots: number,
): boolean[] {
  const selected = companyIds.map(() => false);
  const cap = Math.max(0, Math.floor(maxSlots));
  if (cap <= 0 || companyIds.length === 0) return selected;

  const queues = new Map<string, number[]>();
  for (let i = 0; i < companyIds.length; i += 1) {
    const companyId = String(companyIds[i] || '').trim() || '_';
    const queue = queues.get(companyId);
    if (queue) queue.push(i);
    else queues.set(companyId, [i]);
  }

  const order = [...queues.keys()].sort((a, b) => a.localeCompare(b));
  let remaining = Math.min(cap, companyIds.length);

  while (remaining > 0) {
    let progressed = false;
    for (const companyId of order) {
      const queue = queues.get(companyId);
      if (!queue?.length) continue;
      const index = queue.shift();
      if (index === undefined) continue;
      selected[index] = true;
      remaining -= 1;
      progressed = true;
      if (remaining <= 0) break;
    }
    if (!progressed) break;
  }

  return selected;
}

export function countAllocatedByCompany(
  companyIds: string[],
  selected: boolean[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < companyIds.length; i += 1) {
    if (!selected[i]) continue;
    const companyId = String(companyIds[i] || '').trim() || '_';
    counts[companyId] = (counts[companyId] || 0) + 1;
  }
  return counts;
}
