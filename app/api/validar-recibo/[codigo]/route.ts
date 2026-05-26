import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  splitCashMovementDescription,
  formatFlowDate,
} from "@/lib/financeCashFlow";
import { displayContractNumber } from "@/lib/contractNumber";

export async function GET(
  _request: Request,
  context: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await context.params;
  const code = decodeURIComponent(codigo || "").trim();
  if (!code) {
    return NextResponse.json({ valid: false, error: "Código inválido" }, { status: 400 });
  }

  const { client, configError } = createAdminSupabase();
  if (!client) {
    return NextResponse.json(
      { valid: false, error: configError || "Serviço indisponível" },
      { status: 503 },
    );
  }

  const { data, error } = await client
    .from("cash_movements")
    .select(
      `
      id,
      type,
      category,
      description,
      amount,
      movement_date,
      status,
      receipt_number,
      receipt_url,
      validation_code,
      companies:company_id(razao_social, name),
      projects:project_id(name),
      customers:customer_id(name, full_name),
      brokers:broker_id(name, full_name),
      contracts:contract_id(contract_number)
    `,
    )
    .eq("validation_code", code)
    .maybeSingle();

  if (error) {
    console.error("[RECIBO] erro validação", error);
    return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ valid: false, error: "Recibo não encontrado" }, { status: 404 });
  }

  const st = (data.status || "").toLowerCase();
  if (st === "estornado" || st === "cancelado" || st === "deleted") {
    return NextResponse.json({
      valid: false,
      error: "Recibo estornado ou cancelado",
      status: data.status,
    });
  }

  const { text: descText, meta } = splitCashMovementDescription(data.description);
  const company =
    (data.companies as { razao_social?: string; name?: string } | null) || {};
  const customer =
    (data.customers as { name?: string; full_name?: string } | null) || {};
  const broker = (data.brokers as { name?: string; full_name?: string } | null) || {};
  const project = (data.projects as { name?: string } | null) || {};
  const contract = (data.contracts as { contract_number?: string } | null) || {};

  let cliente = customer.name || customer.full_name || "";
  if (!cliente && meta?.manual_customer) cliente = meta.manual_customer;

  let quadraLote = "";
  if (meta?.manual_quadra || meta?.manual_lote) {
    const q = meta.manual_quadra || "";
    const l = meta.manual_lote || "";
    quadraLote = q && l ? `QD ${q} • LT ${l}` : q ? `QD ${q}` : l ? `LT ${l}` : "";
  }

  let contrato = contract.contract_number
    ? displayContractNumber(contract.contract_number)
    : meta?.manual_contract || "";

  return NextResponse.json({
    valid: true,
    status: "Válido",
    empresa: company.razao_social || company.name || "SV LOTES",
    valor: Number(data.amount) || 0,
    data: formatFlowDate(data.movement_date),
    categoria: data.category,
    tipo_despesa: data.category,
    descricao: descText,
    projeto: project.name || "",
    cliente: cliente || "—",
    corretor: broker.name || broker.full_name || "—",
    contrato: contrato || "—",
    quadra_lote: quadraLote || "—",
    receipt_number: data.receipt_number,
    validation_code: data.validation_code,
    autenticidade: "Documento autêntico emitido pelo SV LOTES",
    emitido_em: formatFlowDate(data.movement_date),
  });
}
