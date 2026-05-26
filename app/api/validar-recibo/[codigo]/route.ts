import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatFlowDate, getCashMovementMetadata } from "@/lib/financeCashFlow";
import { formatReceiptContractNumber } from "@/lib/contractNumber";
import { formatBeneficiaryDocument } from "@/lib/expenseReceiptPdf";

type CompanyRow = {
  id?: string;
  name?: string | null;
  razao_social?: string | null;
  fantasy_name?: string | null;
  cnpj?: string | null;
};

function cleanMovementDescription(desc: string | null | undefined): string {
  return String(desc ?? "")
    .split("[[sv_meta]]")[0]
    .trim();
}

async function fetchCompanyByMovement(
  client: ReturnType<typeof createAdminSupabase>["client"],
  movement: { company_id?: string | null; tenant_id?: string | null },
): Promise<CompanyRow | null> {
  if (!client) return null;
  const companyId = movement.company_id || movement.tenant_id;
  if (!companyId) return null;

  const { data, error } = await client
    .from("companies")
    .select("id, name, razao_social, fantasy_name, cnpj")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    console.error("[RECIBO] erro ao buscar empresa", error);
    return null;
  }
  return data;
}

function buildValidResponse(payload: {
  empresa: string;
  cnpj?: string;
  valor: number;
  movement_date: string;
  category: string;
  description: string;
  receipt_number: string | null;
  validation_code: string | null;
  beneficiario?: string;
  cpf_cnpj?: string;
  forma_pagamento?: string;
  projeto?: string;
  cliente?: string;
  contrato?: string;
}) {
  return NextResponse.json({
    valid: true,
    status: "Documento autêntico gerado pelo SV LOTES",
    tipo_documento: "RECIBO DE PAGAMENTO / SAÍDA",
    empresa: payload.empresa,
    cnpj: payload.cnpj || "Não informado",
    valor: payload.valor,
    data: formatFlowDate(payload.movement_date),
    categoria: payload.category,
    tipo_despesa: payload.category,
    descricao: payload.description,
    beneficiario: payload.beneficiario || "Não informado",
    cpf_cnpj: payload.cpf_cnpj || "",
    forma_pagamento: payload.forma_pagamento || "Não informado",
    projeto: payload.projeto || "Não informado",
    cliente: payload.cliente || "Não informado",
    corretor: payload.beneficiario || "Não informado",
    contrato: payload.contrato || "Não informado",
    receipt_number: payload.receipt_number,
    validation_code: payload.validation_code,
    autenticidade: "Documento autêntico gerado pelo SV LOTES",
    emitido_em: formatFlowDate(payload.movement_date),
  });
}

function notFoundResponse() {
  return NextResponse.json(
    { valid: false, error: "Recibo não encontrado" },
    { status: 404 },
  );
}

function resolveBeneficiaryFromMetadata(
  md: ReturnType<typeof getCashMovementMetadata>,
): string {
  return (
    String(md.beneficiary_manual ?? "").trim() ||
    String(md.broker_manual ?? "").trim() ||
    String(md.broker_name ?? "").trim() ||
    ""
  );
}

function resolveCustomerFromMetadata(
  md: ReturnType<typeof getCashMovementMetadata>,
  beneficiary: string,
): string {
  const manual = String(md.customer_manual ?? "").trim();
  if (manual) return manual;
  return beneficiary;
}

function resolveContractFromMetadata(
  md: ReturnType<typeof getCashMovementMetadata>,
): string {
  const raw = String(md.contract_manual ?? "").trim();
  if (!raw) return "";
  return formatReceiptContractNumber(raw) || raw;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await context.params;
  const code = decodeURIComponent(codigo || "").trim();
  if (!code) {
    return notFoundResponse();
  }

  const { client, configError } = createAdminSupabase();
  if (!client) {
    console.error("[RECIBO] validação indisponível", configError);
    return notFoundResponse();
  }

  const { data: cash, error: cashErr } = await client
    .from("cash_movements")
    .select("*")
    .eq("validation_code", code)
    .maybeSingle();

  if (cashErr) {
    console.error("[RECIBO] erro validação caixa", cashErr);
    return notFoundResponse();
  }

  if (cash) {
    const st = (cash.status || "").toLowerCase();
    if (st === "estornado" || st === "cancelado" || st === "deleted") {
      return NextResponse.json(
        { valid: false, error: "Recibo não encontrado" },
        { status: 404 },
      );
    }

    const company = await fetchCompanyByMovement(client, cash);
    const md = getCashMovementMetadata(cash);
    const beneficiario = resolveBeneficiaryFromMetadata(md);
    const cliente = resolveCustomerFromMetadata(md, beneficiario);
    const docRaw = String(md.beneficiary_document ?? "").trim();
    const cpf_cnpj = docRaw ? formatBeneficiaryDocument(docRaw) : "";
    const formaPagamento = String(md.payment_method ?? "").trim();

    return buildValidResponse({
      empresa:
        company?.razao_social ||
        company?.name ||
        company?.fantasy_name ||
        "SV LOTES",
      cnpj: company?.cnpj || undefined,
      valor: Number(cash.amount) || 0,
      movement_date: cash.movement_date,
      category: cash.category || "Saída",
      description: cleanMovementDescription(cash.description),
      receipt_number: cash.receipt_number,
      validation_code: cash.validation_code,
      beneficiario,
      cpf_cnpj,
      forma_pagamento: formaPagamento || undefined,
      projeto: md.project_name || md.project_manual || undefined,
      cliente,
      contrato: resolveContractFromMetadata(md) || undefined,
    });
  }

  const { data: comm, error: commErr } = await client
    .from("broker_commissions")
    .select("*")
    .eq("validation_code", code)
    .maybeSingle();

  if (commErr) {
    console.error("[RECIBO] erro validação comissão", commErr);
    return notFoundResponse();
  }

  if (!comm) {
    return notFoundResponse();
  }

  const cmStatus = (comm.status || "").toLowerCase();
  if (!["pago", "paga", "paid", "aprovado", "aprovada"].includes(cmStatus)) {
    return notFoundResponse();
  }

  const company = await fetchCompanyByMovement(client, comm);

  let brokerName = "";
  if (comm.broker_id) {
    const { data: broker } = await client
      .from("brokers")
      .select("name, full_name")
      .eq("id", comm.broker_id)
      .maybeSingle();
    brokerName = broker?.name || broker?.full_name || "";
  }

  let projeto: string | undefined;
  let cliente: string | undefined;
  let contrato: string | undefined;

  if (comm.sale_id) {
    const { data: sale } = await client
      .from("sales")
      .select("id, project_id, customer_id")
      .eq("id", comm.sale_id)
      .maybeSingle();

    if (sale?.project_id) {
      const { data: project } = await client
        .from("projects")
        .select("name")
        .eq("id", sale.project_id)
        .maybeSingle();
      projeto = project?.name || undefined;
    }

    if (sale?.customer_id) {
      const { data: customer } = await client
        .from("customers")
        .select("name, full_name")
        .eq("id", sale.customer_id)
        .maybeSingle();
      cliente = customer?.name || customer?.full_name || undefined;
    }
  }

  return buildValidResponse({
    empresa:
      company?.razao_social ||
      company?.name ||
      company?.fantasy_name ||
      "SV LOTES",
    cnpj: company?.cnpj || undefined,
    valor: Number(comm.amount) || 0,
    movement_date: comm.paid_at || "",
    category: "Comissão",
    description: `Pagamento de comissão — ${brokerName || "Corretor"}`,
    receipt_number: comm.receipt_number,
    validation_code: comm.validation_code,
    beneficiario: brokerName || undefined,
    projeto,
    cliente,
    contrato,
    forma_pagamento: "Não informado",
  });
}
