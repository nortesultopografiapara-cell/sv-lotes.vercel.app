import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatFlowDate, getCashMovementMetadata } from "@/lib/financeCashFlow";
import { displayContractNumber } from "@/lib/contractNumber";

function buildValidResponse(payload: {
  empresa: string;
  valor: number;
  movement_date: string;
  category: string;
  description: string;
  receipt_number: string | null;
  validation_code: string | null;
  projeto?: string;
  cliente?: string;
  corretor?: string;
  contrato?: string;
}) {
  return NextResponse.json({
    valid: true,
    status: "Válido",
    tipo_documento: "RECIBO DE PAGAMENTO / SAÍDA",
    empresa: payload.empresa,
    valor: payload.valor,
    data: formatFlowDate(payload.movement_date),
    categoria: payload.category,
    tipo_despesa: payload.category,
    descricao: payload.description,
    projeto: payload.projeto || "Não informado",
    cliente: payload.cliente || "Não informado",
    corretor: payload.corretor || "Não informado",
    contrato: payload.contrato || "Não informado",
    receipt_number: payload.receipt_number,
    validation_code: payload.validation_code,
    autenticidade: "Documento autêntico emitido pelo SV LOTES",
    emitido_em: formatFlowDate(payload.movement_date),
  });
}

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

  const { data: cash, error: cashErr } = await client
    .from("cash_movements")
    .select(
      `
      id, category, description, amount, movement_date, status, metadata,
      receipt_number, validation_code,
      companies:company_id(razao_social, name),
      projects:project_id(name),
      customers:customer_id(name, full_name),
      contracts:contract_id(contract_number)
    `,
    )
    .eq("validation_code", code)
    .maybeSingle();

  if (cashErr) {
    console.error("[RECIBO] erro validação caixa", cashErr);
    return NextResponse.json({ valid: false, error: cashErr.message }, { status: 500 });
  }

  if (cash) {
    const st = (cash.status || "").toLowerCase();
    if (st === "estornado" || st === "cancelado" || st === "deleted") {
      return NextResponse.json({
        valid: false,
        error: "Recibo estornado ou cancelado",
        status: cash.status,
      });
    }

    const company =
      (cash.companies as { razao_social?: string; name?: string } | null) || {};
    const customer =
      (cash.customers as { name?: string; full_name?: string } | null) || {};
    const project = (cash.projects as { name?: string } | null) || {};
    const contract =
      (cash.contracts as { contract_number?: string } | null) || {};
    const md = getCashMovementMetadata(cash);

    return buildValidResponse({
      empresa: company.razao_social || company.name || "SV LOTES",
      valor: Number(cash.amount) || 0,
      movement_date: cash.movement_date,
      category: cash.category || "Saída",
      description: cash.description || "",
      receipt_number: cash.receipt_number,
      validation_code: cash.validation_code,
      projeto:
        md.project_name ||
        md.project_manual ||
        project.name ||
        undefined,
      cliente:
        md.customer_manual ||
        customer.name ||
        customer.full_name ||
        undefined,
      corretor:
        md.beneficiary_manual ||
        md.broker_manual ||
        md.broker_name ||
        undefined,
      contrato: md.contract_manual
        ? displayContractNumber(md.contract_manual)
        : contract.contract_number
          ? displayContractNumber(contract.contract_number)
          : "S/N",
    });
  }

  const { data: comm, error: commErr } = await client
    .from("broker_commissions")
    .select(
      `
      id, amount, paid_at, status,
      receipt_number, validation_code,
      companies:company_id(razao_social, name),
      brokers:broker_id(name, full_name),
      sales(id, projects(name), customers(name, full_name), contracts(contract_number))
    `,
    )
    .eq("validation_code", code)
    .maybeSingle();

  if (commErr) {
    console.error("[RECIBO] erro validação comissão", commErr);
    return NextResponse.json({ valid: false, error: commErr.message }, { status: 500 });
  }

  if (!comm) {
    return NextResponse.json({ valid: false, error: "Recibo não encontrado" }, { status: 404 });
  }

  const cmStatus = (comm.status || "").toLowerCase();
  if (!["pago", "paga", "paid", "aprovado", "aprovada"].includes(cmStatus)) {
    return NextResponse.json({
      valid: false,
      error: "Comissão não está paga/ativa",
      status: comm.status,
    });
  }

  const company =
    (comm.companies as { razao_social?: string; name?: string } | null) || {};
  const broker =
    (comm.brokers as { name?: string; full_name?: string } | null) || {};
  const sale = (comm.sales as {
    projects?: { name?: string };
    customers?: { name?: string; full_name?: string };
    contracts?: { contract_number?: string } | { contract_number?: string }[];
  } | null) || {};
  const saleContracts = Array.isArray(sale.contracts)
    ? sale.contracts[0]
    : sale.contracts;
  const customer = sale.customers || {};

  return buildValidResponse({
    empresa: company.razao_social || company.name || "SV LOTES",
    valor: Number(comm.amount) || 0,
    movement_date: comm.paid_at || "",
    category: "Comissão",
    description: `Pagamento de comissão — ${broker.name || broker.full_name || "Corretor"}`,
    receipt_number: comm.receipt_number,
    validation_code: comm.validation_code,
    projeto: sale.projects?.name,
    cliente: customer.name || customer.full_name,
    corretor: broker.name || broker.full_name,
    contrato: saleContracts?.contract_number
      ? displayContractNumber(saleContracts.contract_number)
      : undefined,
  });
}
