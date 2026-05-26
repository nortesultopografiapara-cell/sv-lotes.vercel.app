import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove prefixos legados CTR- para leitura/exibição. */
export function stripContractNumberPrefix(raw: string): string {
  let s = String(raw || "").trim();
  while (/^CTR-/i.test(s)) {
    s = s.replace(/^CTR-/i, "").trim();
  }
  return s;
}

/** Extrai sequencial e ano de formatos como 000000001/2026 ou CTR-000000001/2026. */
export function parseContractSequential(
  contractNumber: string | null | undefined,
): { seq: number; year: number } | null {
  if (!contractNumber) return null;
  const cleaned = stripContractNumberPrefix(contractNumber);
  const match = cleaned.match(/^(\d{1,9})\/(\d{4})$/);
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  if (!Number.isFinite(seq) || !Number.isFinite(year) || seq < 1) return null;
  return { seq, year };
}

/** Formato salvo: 000000001/2026 (sem prefixo CTR). */
export function formatContractNumber(seq: number, year: number): string {
  return `${String(seq).padStart(9, "0")}/${year}`;
}

/** Normaliza para exibição (9 dígitos + ano, sem CTR). */
export function formatContractNumberDisplay(
  contractNumber: string | null | undefined,
): string {
  if (!contractNumber) return "S/N";
  const parsed = parseContractSequential(contractNumber);
  if (parsed) return formatContractNumber(parsed.seq, parsed.year);
  const cleaned = stripContractNumberPrefix(contractNumber);
  return cleaned || "S/N";
}

/**
 * Próximo número sequencial por empresa/tenant e ano vigente.
 * Busca o maior sequencial existente no ano e soma +1.
 */
export async function getNextContractNumber(
  supabase: SupabaseClient,
  companyOrTenantId: string,
  year: number = new Date().getFullYear(),
): Promise<string> {
  if (!companyOrTenantId) {
    throw new Error("tenant_id/company_id obrigatório para numerar contrato");
  }

  const { data, error } = await supabase
    .from("contracts")
    .select("contract_number")
    .or(
      `tenant_id.eq.${companyOrTenantId},company_id.eq.${companyOrTenantId}`,
    );

  if (error) {
    console.error("[contractNumber] erro ao buscar contratos", error);
    throw error;
  }

  let maxSeq = 0;
  for (const row of data || []) {
    const parsed = parseContractSequential(row.contract_number);
    if (parsed && parsed.year === year && parsed.seq > maxSeq) {
      maxSeq = parsed.seq;
    }
  }

  return formatContractNumber(maxSeq + 1, year);
}

/** Verifica se o número já existe na mesma empresa/tenant. */
export async function contractNumberExists(
  supabase: SupabaseClient,
  companyOrTenantId: string,
  contractNumber: string,
): Promise<boolean> {
  const display = formatContractNumberDisplay(contractNumber);
  const { data, error } = await supabase
    .from("contracts")
    .select("id, contract_number")
    .or(
      `tenant_id.eq.${companyOrTenantId},company_id.eq.${companyOrTenantId}`,
    );

  if (error) return false;

  return (data || []).some(
    (row) =>
      formatContractNumberDisplay(row.contract_number) === display,
  );
}

/**
 * Aloca número com re-tentativa em caso de corrida (duplicidade).
 */
export async function allocateContractNumber(
  supabase: SupabaseClient,
  companyOrTenantId: string,
  maxAttempts = 8,
): Promise<string> {
  const year = new Date().getFullYear();
  let bump = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase
      .from("contracts")
      .select("contract_number")
      .or(
        `tenant_id.eq.${companyOrTenantId},company_id.eq.${companyOrTenantId}`,
      );

    if (error) throw error;

    let maxSeq = 0;
    for (const row of data || []) {
      const parsed = parseContractSequential(row.contract_number);
      if (parsed && parsed.year === year && parsed.seq > maxSeq) {
        maxSeq = parsed.seq;
      }
    }

    const candidate = formatContractNumber(maxSeq + 1 + bump, year);
    const exists = await contractNumberExists(
      supabase,
      companyOrTenantId,
      candidate,
    );
    if (!exists) return candidate;
    bump += 1;
  }

  throw new Error(
    "Não foi possível gerar número de contrato único. Tente novamente.",
  );
}
