import type { SupabaseClient } from "@supabase/supabase-js";
import type { CashFlowItem } from "@/lib/financeCashFlow";
import { getCashMovementMetadata } from "@/lib/financeCashFlow";

const ORIGIN_ERROR =
  "Não foi possível identificar a origem deste lançamento.";

const REMOVAL_ERROR =
  "Não foi possível remover o lançamento no banco. Verifique permissões (RLS).";

function isCashMovementSaida(typeStr: string): boolean {
  return ["saida", "saída", "saida ", "despesa", "expense", "commission", "comissao", "comissão"].some(
    (val) => typeStr.includes(val),
  );
}

export type CashFlowDeleteTarget = {
  source_table: string;
  source_id: string;
};

/** Resolve tabela e id de origem a partir do item do fluxo. */
export function resolveCashFlowDeleteTarget(
  item: CashFlowItem,
): CashFlowDeleteTarget | null {
  if (item.source_table && item.source_id) {
    return { source_table: item.source_table, source_id: item.source_id };
  }
  if (item.source === "cash_movements" && item.cashMovementId) {
    return { source_table: "cash_movements", source_id: item.cashMovementId };
  }
  if (item.source === "broker_commissions" && item.commissionId) {
    return {
      source_table: "broker_commissions",
      source_id: item.commissionId,
    };
  }
  return null;
}

function findLinkedCashForCommission(
  cashMovements: any[],
  item: CashFlowItem,
): any[] {
  return (cashMovements || []).filter((c) => {
    const typeStr = (c.type || "").toLowerCase();
    if (!isCashMovementSaida(typeStr)) return false;
    const st = (c.status || "ativo").toLowerCase();
    if (st === "estornado" || st === "cancelado" || st === "deleted") {
      return false;
    }
    if (
      item.commissionId &&
      c.source_table === "broker_commissions" &&
      c.source_id === item.commissionId
    ) {
      return true;
    }
    const cMd = getCashMovementMetadata(c);
    const brokerMatch =
      item.brokerId &&
      (cMd.broker_id === item.brokerId || c.broker_id === item.brokerId);
    return (
      ((c.sale_id && item.saleId && c.sale_id === item.saleId) || brokerMatch) &&
      Math.abs(Number(c.amount) - item.amount) < 1
    );
  });
}

/** Marca movimento de caixa como removido (estorno — RLS permite UPDATE, não DELETE). */
async function removeCashMovementRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { data: updated, error: updErr } = await supabase
    .from("cash_movements")
    .update({ status: "estornado" })
    .eq("id", id)
    .select("id");

  if (updErr) throw updErr;
  if (updated && updated.length > 0) return;

  const { data: deleted, error: delErr } = await supabase
    .from("cash_movements")
    .delete()
    .eq("id", id)
    .select("id");

  if (delErr) throw delErr;
  if (!deleted || deleted.length === 0) {
    throw new Error(REMOVAL_ERROR);
  }
}

/** Cancela comissão paga (mantém venda/contrato/parcelas). */
async function removeCommissionRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { data: updated, error: updErr } = await supabase
    .from("broker_commissions")
    .update({ status: "cancelado" })
    .eq("id", id)
    .select("id");

  if (updErr) throw updErr;
  if (updated && updated.length > 0) return;

  const { data: deleted, error: delErr } = await supabase
    .from("broker_commissions")
    .delete()
    .eq("id", id)
    .select("id");

  if (delErr) throw delErr;
  if (!deleted || deleted.length === 0) {
    throw new Error(REMOVAL_ERROR);
  }
}

/**
 * Remove saída/despesa/comissão do banco.
 * Tabelas usadas no sistema: cash_movements, broker_commissions, finance_receipts (entradas — não excluir aqui).
 */
export async function deleteCashFlowItem(
  supabase: SupabaseClient,
  item: CashFlowItem,
  cashMovements: any[] = [],
): Promise<void> {
  if (item.tipo === "entrada") {
    throw new Error("Para entradas/parcelas, use Estornar em vez de excluir.");
  }

  const target = resolveCashFlowDeleteTarget(item);
  if (!target) {
    throw new Error(ORIGIN_ERROR);
  }

  console.log("[FINANCEIRO] excluir item", item.id);
  console.log("[FINANCEIRO] source_table", target.source_table);
  console.log("[FINANCEIRO] source_id", target.source_id);

  const table = target.source_table.toLowerCase();

  if (table === "finance_expenses" || table === "cash_flow") {
    throw new Error(
      `Tabela legada "${target.source_table}" não está em uso. Registre saídas em cash_movements.`,
    );
  }

  if (table === "cash_movements") {
    const row = cashMovements.find((c) => c.id === target.source_id);
    await removeCashMovementRecord(supabase, target.source_id);

    const linkedTable = (row?.source_table || "").toLowerCase();
    if (linkedTable === "broker_commissions" && row?.source_id) {
      await removeCommissionRecord(supabase, row.source_id);
    }
    return;
  }

  if (table === "broker_commissions") {
    const linkedCash = findLinkedCashForCommission(cashMovements, item);
    for (const cm of linkedCash) {
      await removeCashMovementRecord(supabase, cm.id);
    }
    await removeCommissionRecord(supabase, target.source_id);
    return;
  }

  if (table === "finance_receipts") {
    throw new Error("Para entradas/parcelas, use Estornar em vez de excluir.");
  }

  throw new Error(ORIGIN_ERROR);
}
