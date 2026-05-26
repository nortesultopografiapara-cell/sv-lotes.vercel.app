import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCashMovementMetadata,
  type CashMovementMetadata,
} from "@/lib/financeCashFlow";

export const RECEIPT_TYPE_EXPENSE = "expense";

export type ExpenseReceiptPersistInput = {
  validationCode: string;
  receiptNumber: string;
  validationUrl: string;
};

/** Normaliza código da URL/QR para comparação. */
export function normalizeValidationCode(raw: string): string {
  return decodeURIComponent(raw || "").trim();
}

export function validationCodeVariants(raw: string): string[] {
  const code = normalizeValidationCode(raw);
  if (!code) return [];
  return [...new Set([code, code.toUpperCase(), code.toLowerCase()])];
}

/** Mescla dados do recibo no metadata (fallback quando colunas dedicadas falham). */
export function mergeReceiptIntoMetadata(
  base: CashMovementMetadata | null | undefined,
  input: ExpenseReceiptPersistInput,
): CashMovementMetadata {
  const at = new Date().toISOString();
  return {
    ...(base || {}),
    validation_code: input.validationCode,
    receipt_number: input.receiptNumber,
    receipt_url: input.validationUrl,
    receipt_generated_at: at,
    receipt_type: RECEIPT_TYPE_EXPENSE,
  };
}

/** Persiste validação em colunas + metadata, com fallback progressivo. */
export async function persistExpenseReceiptValidation(
  supabase: SupabaseClient,
  movementId: string,
  existingRow: { metadata?: unknown } | null | undefined,
  input: ExpenseReceiptPersistInput,
): Promise<{ ok: boolean; error?: string }> {
  const metadata = mergeReceiptIntoMetadata(
    getCashMovementMetadata(existingRow || {}),
    input,
  );

  const columns = {
    receipt_number: input.receiptNumber,
    validation_code: input.validationCode,
    receipt_url: input.validationUrl,
    receipt_generated_at: metadata.receipt_generated_at,
    receipt_type: RECEIPT_TYPE_EXPENSE,
  };

  const payloads: Record<string, unknown>[] = [
    { ...columns, metadata },
    {
      receipt_number: columns.receipt_number,
      validation_code: columns.validation_code,
      receipt_url: columns.receipt_url,
      metadata,
    },
    { validation_code: columns.validation_code, metadata },
    { metadata },
  ];

  let lastMsg = "";
  for (const payload of payloads) {
    const { error } = await supabase
      .from("cash_movements")
      .update(payload)
      .eq("id", movementId);

    if (!error) {
      console.log(
        "[RECIBO] validação persistida",
        movementId,
        input.validationCode,
      );
      return { ok: true };
    }
    lastMsg = error.message;
    console.warn("[RECIBO] tentativa persistência falhou", error.message);
  }

  return { ok: false, error: lastMsg };
}

export function resolveStoredValidationCode(row: {
  validation_code?: string | null;
  metadata?: unknown;
}): string {
  const col = String(row.validation_code ?? "").trim();
  if (col) return col;
  const md = getCashMovementMetadata(row);
  return String(md.validation_code ?? "").trim();
}

export function resolveStoredReceiptNumber(row: {
  receipt_number?: string | null;
  metadata?: unknown;
}): string {
  const col = String(row.receipt_number ?? "").trim();
  if (col) return col;
  const md = getCashMovementMetadata(row);
  return String(md.receipt_number ?? "").trim();
}

/** Busca saída por validation_code (coluna ou metadata). */
export async function findCashMovementByValidationCode(
  client: SupabaseClient,
  rawCode: string,
): Promise<Record<string, unknown> | null> {
  const variants = validationCodeVariants(rawCode);
  if (variants.length === 0) return null;

  for (const code of variants) {
    const { data, error } = await client
      .from("cash_movements")
      .select("*")
      .eq("validation_code", code)
      .maybeSingle();

    if (error) {
      console.error("[RECIBO] busca validation_code coluna", error);
      break;
    }
    if (data) return data as Record<string, unknown>;
  }

  for (const code of variants) {
    const { data: rows, error } = await client
      .from("cash_movements")
      .select("*")
      .filter("metadata->>validation_code", "eq", code)
      .limit(1);

    if (error) {
      console.error("[RECIBO] busca metadata validation_code", error);
      continue;
    }
    const row = rows?.[0];
    if (row) return row as Record<string, unknown>;
  }

  return null;
}
