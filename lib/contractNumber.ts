import type { SupabaseClient } from "@supabase/supabase-js";

const CONTRACT_NUMBER_PATTERN = /^\d{9}\/\d{4}$/;

/** Remove prefixos legados CTR- (não usar na geração). */
export function stripContractNumberPrefix(raw: string): string {
  let s = String(raw || "").trim();
  while (/^CTR-/i.test(s)) {
    s = s.replace(/^CTR-/i, "").trim();
  }
  return s;
}

/** Valor salvo no formato oficial 000000001/2026 */
export function isValidStoredContractNumber(
  contractNumber: string | null | undefined,
): boolean {
  if (!contractNumber) return false;
  return CONTRACT_NUMBER_PATTERN.test(stripContractNumberPrefix(contractNumber));
}

/** Exibição: só o valor do banco se estiver no formato correto (nunca timestamp legado). */
export function displayContractNumber(
  contractNumber: string | null | undefined,
): string {
  if (!contractNumber) return "S/N";
  const cleaned = stripContractNumberPrefix(contractNumber);
  if (CONTRACT_NUMBER_PATTERN.test(cleaned)) return cleaned;
  return "S/N";
}

/**
 * Próximo número sequencial por empresa/tenant e ano vigente.
 * Formato salvo: 000000001/2026
 */
export async function getNextContractNumber(
  supabase: SupabaseClient,
  tenantId: string,
  companyId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const tid = tenantId || companyId;
  const cid = companyId || tenantId;

  if (!tid || !cid) {
    throw new Error("tenant_id e company_id obrigatórios para numerar contrato");
  }

  const { data, error } = await supabase
    .from("contracts")
    .select("contract_number")
    .or(`tenant_id.eq.${tid},company_id.eq.${cid}`)
    .like("contract_number", `%/${year}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[contractNumber] erro ao buscar contratos", error);
    throw error;
  }

  const numbers = (data || [])
    .map((c) => stripContractNumberPrefix(String(c.contract_number || "")))
    .map((n) => {
      const match = n.match(/^(\d+)\/(\d{4})$/);
      return match ? Number(match[1]) : 0;
    });

  const next = Math.max(0, ...numbers, 0) + 1;

  return `${String(next).padStart(9, "0")}/${year}`;
}

/** Garante número válido; se legado (timestamp/CTR), gera o próximo sequencial. */
export async function ensureValidContractNumber(
  supabase: SupabaseClient,
  contract: {
    id?: string;
    contract_number?: string | null;
    tenant_id?: string | null;
    company_id?: string | null;
  },
): Promise<string> {
  if (isValidStoredContractNumber(contract.contract_number)) {
    return stripContractNumberPrefix(contract.contract_number!);
  }

  const tenantId = contract.tenant_id || contract.company_id || "";
  const companyId = contract.company_id || contract.tenant_id || "";
  const next = await getNextContractNumber(supabase, tenantId, companyId);

  if (contract.id) {
    const { error } = await supabase
      .from("contracts")
      .update({ contract_number: next })
      .eq("id", contract.id);
    if (error) {
      console.error("[contractNumber] erro ao atualizar número legado", error);
    }
  }

  return next;
}
