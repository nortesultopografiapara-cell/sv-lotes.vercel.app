import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { displayContractNumber } from "@/lib/contractNumber";
import {
  formatFlowDate,
  type CashFlowItem,
  type CashMovementMetadata,
} from "@/lib/financeCashFlow";
import { getReceiptValidationUrl } from "@/lib/pdfValidation";

/** Item normalizado para PDF — campos explícitos, sem "Lançamento manual". */
export type ExpenseReceiptItem = CashFlowItem & {
  project_name?: string;
  contract_number?: string;
  customer_name?: string;
  broker_name?: string;
  beneficiary_document?: string;
  block_label?: string;
  payment_method?: string;
};

/** Formata CPF (11) ou CNPJ (14) para exibição no recibo. */
export function formatBeneficiaryDocument(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return String(raw ?? "").trim();
}

export type ExpenseReceiptPdfInput = {
  item: ExpenseReceiptItem;
  tenantData: {
    razao_social?: string;
    name?: string;
    cnpj?: string;
    logo_url?: string;
  } | null;
  receiptNumber: string;
  validationCode: string;
  validationUrl?: string;
  paymentMethod?: string;
};

export function formatReceiptError(err: unknown): string {
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
  };
  return (
    e?.message ||
    e?.details ||
    e?.hint ||
    (typeof err === "string" ? err : JSON.stringify(err))
  );
}

function blockLabelFromMetadata(md: CashMovementMetadata): string {
  const quad = String(md.quadra_manual ?? "").trim();
  const lot = String(md.lote_manual ?? "").trim();
  if (quad && lot) return `QD ${quad} • LT ${lot}`;
  if (quad) return `QD ${quad}`;
  if (lot) return `LT ${lot}`;
  return "";
}

/** Monta objeto com campos do recibo priorizando metadata e valores reais. */
export function buildNormalizedExpenseReceiptItem(
  item: CashFlowItem,
  options?: {
    projectNameFromDb?: string;
    paymentMethod?: string;
  },
): ExpenseReceiptItem {
  const md: CashMovementMetadata = { ...(item.metadata || {}) };
  const blockFromMeta = blockLabelFromMetadata(md);

  const contractRaw = pickReceiptField(
    md.contract_manual,
    item.contractNumber,
    (item as { contract_number?: string }).contract_number,
  );
  const contract_number = contractRaw
    ? displayContractNumber(contractRaw)
    : "";

  return {
    ...item,
    metadata: md,
    project_name: pickReceiptField(
      md.project_name,
      md.project_manual,
      options?.projectNameFromDb,
      item.projectName,
      (item as { project_name?: string }).project_name,
      (item as { project_display?: string }).project_display,
    ),
    contract_number,
    customer_name: pickReceiptField(
      md.customer_manual,
      (item as { customer_name?: string }).customer_name,
      item.customerName,
    ),
    broker_name: pickReceiptField(
      md.beneficiary_manual,
      md.broker_manual,
      md.broker_name,
      (item as { broker_name?: string }).broker_name,
      item.brokerName,
    ),
    beneficiary_document: pickReceiptField(
      md.beneficiary_document,
      (item as { beneficiary_document?: string }).beneficiary_document,
    ),
    block_label: pickReceiptField(
      (item as { block_label?: string }).block_label,
      (item as { location_display?: string }).location_display,
      blockFromMeta,
      item.locationLabel,
    ),
    payment_method: pickReceiptField(
      (item as { payment_method?: string }).payment_method,
      md.payment_method,
      options?.paymentMethod,
    ),
  };
}

function displayPaymentMethod(value: string | null | undefined): string {
  const v = pickReceiptField(value);
  return v || "Não informado";
}

function receiptFieldsFromItem(item: ExpenseReceiptItem) {
  const docRaw = pickReceiptField(item.beneficiary_document);
  return {
    projectName: displayReceiptField(item.project_name),
    contractNumber: pickReceiptField(item.contract_number) || "S/N",
    customerName: displayReceiptField(item.customer_name),
    beneficiary: displayReceiptField(item.broker_name),
    beneficiaryDocument: docRaw ? formatBeneficiaryDocument(docRaw) : "",
    locationLabel: displayReceiptField(item.block_label),
    paymentMethod: displayPaymentMethod(item.payment_method),
  };
}

function drawReceiverSignatureBlock(
  doc: jsPDF,
  x: number,
  width: number,
  startY: number,
  receiverName: string,
  receiverDocument: string,
) {
  const boxH = 112;
  doc.setDrawColor(210);
  doc.setFillColor(252, 252, 253);
  doc.roundedRect(x, startY, width, boxH, 4, 4, "FD");

  doc.setTextColor(90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("RECEBEDOR / BENEFICIÁRIO", x + width / 2, startY + 12, {
    align: "center",
  });

  const nameVal = pickReceiptField(receiverName);
  const docVal = pickReceiptField(receiverDocument);
  const centerX = x + width / 2;

  doc.setTextColor(35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  if (nameVal) {
    doc.text(`Nome: ${nameVal.toUpperCase()}`, centerX, startY + 32, {
      align: "center",
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Nome: _________________________________", centerX, startY + 32, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(35);
  if (docVal) {
    doc.text(
      `CPF/CNPJ: ${formatBeneficiaryDocument(docVal)}`,
      centerX,
      startY + 48,
      { align: "center" },
    );
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("CPF/CNPJ: _____________________________", centerX, startY + 48, {
      align: "center",
    });
  }

  const lineW = Math.min(240, width - 60);
  const lineX = x + (width - lineW) / 2;
  doc.setDrawColor(150);
  doc.line(lineX, startY + 78, lineX + lineW, startY + 78);
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.setFont("helvetica", "normal");
  doc.text("Assinatura do recebedor", centerX, startY + 96, { align: "center" });
}

const PLACEHOLDER_LABELS = new Set([
  "",
  "-",
  "lancamento manual",
  "lançamento manual",
  "s/n",
  "nao informado",
  "não informado",
]);

function isPlaceholderReceiptValue(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  return PLACEHOLDER_LABELS.has(v.toLowerCase());
}

function pickReceiptField(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const v = String(c ?? "").trim();
    if (!isPlaceholderReceiptValue(v)) return v;
  }
  return "";
}

function displayReceiptField(value: string | null | undefined): string {
  const v = pickReceiptField(value);
  return v || "Não informado";
}

export type ExpenseReceiptDisplay = {
  projectName: string;
  contractNumber: string;
  customerName: string;
  beneficiary: string;
  locationLabel: string;
  paymentMethod: string;
};

/** Resolve campos do recibo a partir do item do fluxo + metadata. */
export function resolveExpenseReceiptDisplay(
  item: CashFlowItem,
  extra?: { projectNameFromDb?: string; paymentMethod?: string },
): ExpenseReceiptDisplay {
  const md: CashMovementMetadata = {
    ...(item.metadata || {}),
  };

  const projectName = pickReceiptField(
    md.project_name,
    md.project_manual,
    extra?.projectNameFromDb,
    item.projectName,
    (item as { project_name?: string }).project_name,
  );

  const contractRaw = pickReceiptField(
    md.contract_manual,
    item.contractNumber && !isPlaceholderReceiptValue(item.contractNumber)
      ? displayContractNumber(item.contractNumber)
      : "",
    (item as { contract_number?: string }).contract_number,
  );

  const customerName = pickReceiptField(
    md.customer_manual,
    item.customerName,
    (item as { customer_name?: string }).customer_name,
  );

  const beneficiary = pickReceiptField(
    md.beneficiary_manual,
    md.broker_manual,
    md.broker_name,
    item.brokerName,
    (item as { broker_name?: string }).broker_name,
    item.customerName,
  );

  const locationLabel = pickReceiptField(item.locationLabel);

  const paymentMethod = pickReceiptField(
    (item as { payment_method?: string }).payment_method,
    md.payment_method,
    extra?.paymentMethod,
  );

  return {
    projectName,
    contractNumber: contractRaw,
    customerName,
    beneficiary,
    locationLabel,
    paymentMethod,
  };
}

async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch {
    return null;
  }
}

function formatBrl(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export async function generateExpenseReceiptPdf(
  input: ExpenseReceiptPdfInput,
): Promise<jsPDF> {
  const { item, tenantData, receiptNumber, validationCode } = input;
  const doc = new jsPDF("portrait", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  const companyName = (
    tenantData?.razao_social ||
    tenantData?.name ||
    "S.V TOPOGRAFIA E PROJETOS LTDA"
  ).toUpperCase();
  const companyCnpj = tenantData?.cnpj || "Não informado";
  const validationUrl =
    input.validationUrl || getReceiptValidationUrl(validationCode);
  const issuedAt = new Date().toLocaleString("pt-BR");
  const paymentDate = formatFlowDate(item.movement_date);
  const valorStr = formatBrl(item.amount);
  const descricao = displayReceiptField(item.description);
  const display = receiptFieldsFromItem(item);
  const contrato = display.contractNumber;
  const beneficiario = display.beneficiary;

  doc.setFillColor(19, 22, 28);
  doc.rect(0, 0, pageWidth, 96, "F");

  const logo = tenantData?.logo_url
    ? await loadLogoBase64(tenantData.logo_url)
    : null;
  const headerTextX = logo ? 104 : margin;

  if (logo) {
    doc.addImage(logo, "PNG", margin, 20, 56, 30, undefined, "FAST");
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(companyName, headerTextX, 34);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${companyCnpj}`, headerTextX, 46);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE PAGAMENTO", headerTextX, 60);
  doc.setFontSize(8);
  doc.text("SAÍDA — Comprovante de pagamento realizado pela empresa", headerTextX, 70);

  doc.text(`Nº ${receiptNumber}`, pageWidth - margin, 34, { align: "right" });
  doc.text(`Emitido: ${issuedAt}`, pageWidth - margin, 44, { align: "right" });

  let y = 112;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RECIBO DE PAGAMENTO / SAÍDA", margin, y);

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const declaracao = `Declaramos para os devidos fins que ${companyName} realizou o pagamento no valor de ${valorStr} referente a ${descricao}, na data ${paymentDate}.`;
  doc.text(declaracao, margin, y, { maxWidth: pageWidth - margin * 2, lineHeightFactor: 1.4 });

  y += 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(231, 76, 60);
  doc.text(valorStr, margin, y);

  const rows: [string, string][] = [
    ["Data do pagamento", paymentDate],
    ["Categoria", displayReceiptField(item.category)],
    ["Descrição / Destino", descricao],
    ["Valor pago", valorStr],
    ["Projeto / Loteamento", display.projectName],
    ["Contrato", contrato],
    ["Cliente", display.customerName],
    ["Corretor / Fornecedor / Beneficiário", beneficiario],
    ...(display.beneficiaryDocument
      ? [["CPF/CNPJ do recebedor", display.beneficiaryDocument] as [string, string]]
      : []),
    ["Quadra / Lote", display.locationLabel],
    ["Forma de pagamento", display.paymentMethod],
    ["Código de validação", validationCode],
  ];

  autoTable(doc, {
    startY: y + 14,
    head: [["Campo", "Informação"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: "auto" } },
  });

  let tableEnd =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + 100;

  let qrBase64: string | null = null;
  try {
    qrBase64 = await QRCode.toDataURL(validationUrl, { margin: 1, width: 256 });
    console.log("[RECIBO] validacao criada", validationUrl);
  } catch {
    qrBase64 = null;
  }

  if (tableEnd > pageHeight - 200) {
    doc.addPage();
    tableEnd = 40;
  }

  const qrY = tableEnd + 20;
  doc.setDrawColor(210);
  doc.line(margin, qrY, pageWidth - margin, qrY);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text("Escaneie para validar este recibo", margin, qrY + 12);
  doc.setFontSize(7);
  doc.text(validationUrl, margin, qrY + 22, {
    maxWidth: pageWidth - margin - 90,
  });
  if (qrBase64) {
    doc.addImage(qrBase64, "PNG", pageWidth - margin - 76, qrY + 4, 68, 68);
  }

  let signY = qrY + 88;
  if (signY > pageHeight - 160) {
    doc.addPage();
    signY = 50;
  }

  const contentW = pageWidth - margin * 2;
  const signName = pickReceiptField(item.customer_name) || pickReceiptField(item.broker_name);
  const signDoc = item.beneficiary_document || "";

  drawReceiverSignatureBlock(
    doc,
    margin,
    contentW,
    signY,
    signName,
    signDoc,
  );

  const companyBoxW = Math.min(280, contentW);
  const companyX = margin + (contentW - companyBoxW) / 2;
  const companyY = signY + 122;
  doc.setDrawColor(210);
  doc.setFillColor(252, 252, 253);
  doc.roundedRect(companyX, companyY, companyBoxW, 72, 4, 4, "FD");
  doc.setTextColor(90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("EMPRESA PAGADORA", companyX + companyBoxW / 2, companyY + 12, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40);
  doc.text(companyName, companyX + companyBoxW / 2, companyY + 30, {
    align: "center",
    maxWidth: companyBoxW - 16,
  });
  doc.text(`CNPJ: ${companyCnpj}`, companyX + companyBoxW / 2, companyY + 44, {
    align: "center",
  });
  doc.setDrawColor(150);
  const cLineW = Math.min(200, companyBoxW - 40);
  doc.line(
    companyX + (companyBoxW - cLineW) / 2,
    companyY + 58,
    companyX + (companyBoxW + cLineW) / 2,
    companyY + 58,
  );
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text("Assinatura da empresa", companyX + companyBoxW / 2, companyY + 66, {
    align: "center",
  });

  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    "Documento gerado digitalmente pelo SV LOTES — Recibo de pagamento (saída)",
    margin,
    pageHeight - 24,
  );

  return doc;
}
